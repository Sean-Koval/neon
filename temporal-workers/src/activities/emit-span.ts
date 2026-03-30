/**
 * Emit Span Activity
 *
 * Sends span data to the data layer via Next.js API.
 * This is the bridge between Temporal workflows and ClickHouse.
 */

import type { EmitSpanParams } from "../types";

// Use NEON_API_URL to point to the Next.js frontend API
const NEON_API_URL = process.env.NEON_API_URL || "http://localhost:3000";

function addJSONAttribute(
  attributes: Record<string, string>,
  key: string,
  value: unknown
): void {
  try {
    attributes[key] = JSON.stringify(value);
  } catch {
    // Ignore serialization failures to preserve span emission.
  }
}

function buildAttributes(params: EmitSpanParams): Record<string, string> {
  const attributes: Record<string, string> = { ...(params.attributes || {}) };

  if (params.componentType) {
    attributes["neon.component_type"] = params.componentType;
  }

  if (params.session) {
    attributes["session.id"] = params.session.sessionId;
    if (params.session.conversationId) {
      attributes["gen_ai.conversation.id"] = params.session.conversationId;
    }
    if (params.session.userId) {
      attributes["enduser.id"] = params.session.userId;
    }
    if (params.session.threadId) {
      attributes["neon.thread.id"] = params.session.threadId;
    }
    addJSONAttribute(attributes, "neon.session", params.session);
  }

  if (params.inputMessages?.length) {
    addJSONAttribute(attributes, "gen_ai.input.messages", params.inputMessages);
  }

  if (params.outputMessages?.length) {
    addJSONAttribute(attributes, "gen_ai.output.messages", params.outputMessages);
  }

  if (params.handoff) {
    attributes["neon.handoff.type"] = params.handoff.handoffType;
    attributes["neon.handoff.to_agent"] = params.handoff.toAgentId;
    if (params.handoff.fromAgentId) {
      attributes["neon.handoff.from_agent"] = params.handoff.fromAgentId;
    }
    if (params.handoff.reason) {
      attributes["neon.handoff.reason"] = params.handoff.reason;
    }
    if (params.handoff.taskDescription) {
      attributes["neon.handoff.task_description"] = params.handoff.taskDescription;
    }
    addJSONAttribute(attributes, "neon.handoff", params.handoff);
  }

  if (params.stateSnapshots?.length) {
    addJSONAttribute(attributes, "neon.state_snapshots", params.stateSnapshots);
  }

  if (params.artifacts?.length) {
    addJSONAttribute(attributes, "neon.artifacts", params.artifacts);
  }

  if (params.evalAnnotations?.length) {
    addJSONAttribute(attributes, "neon.eval.annotations", params.evalAnnotations);
  }

  if (params.skillSelection) {
    addJSONAttribute(attributes, "neon.skill_selection", params.skillSelection);
  }

  if (params.mcpContext) {
    addJSONAttribute(attributes, "neon.mcp_context", params.mcpContext);
  }

  if (params.decisionMetadata) {
    addJSONAttribute(attributes, "neon.decision_metadata", params.decisionMetadata);
  }

  return attributes;
}

function buildSpanPayload(params: EmitSpanParams) {
  const attributes = buildAttributes(params);

  return {
    project_id: extractProjectId(params.traceId),
    trace_id: params.traceId,
    span_id: params.spanId || `span-${crypto.randomUUID()}`,
    parent_span_id: params.parentSpanId || null,
    name: params.name,
    kind: "internal",
    span_type: params.spanType,
    component_type: params.componentType || null,
    timestamp: new Date().toISOString(),
    end_time: params.durationMs ? new Date(Date.now()).toISOString() : null,
    duration_ms: params.durationMs || 0,
    status: params.status || "unset",
    status_message: params.statusMessage || "",
    model: params.model || null,
    model_parameters: {},
    input: params.input || "",
    output: params.output || "",
    input_tokens: params.inputTokens || null,
    output_tokens: params.outputTokens || null,
    total_tokens:
      params.inputTokens && params.outputTokens
        ? params.inputTokens + params.outputTokens
        : null,
    cost_usd: null,
    tool_name: params.toolName || null,
    tool_input: params.toolInput || "",
    tool_output: params.toolOutput || "",
    session: params.session || null,
    input_messages: params.inputMessages || [],
    output_messages: params.outputMessages || [],
    handoff: params.handoff || null,
    state_snapshots: params.stateSnapshots || [],
    artifacts: params.artifacts || [],
    eval_annotations: params.evalAnnotations || [],
    // Skill selection context
    skill_selection: params.skillSelection ? {
      selected_skill: params.skillSelection.selectedSkill,
      skill_category: params.skillSelection.skillCategory || null,
      selection_confidence: params.skillSelection.selectionConfidence || null,
      selection_reason: params.skillSelection.selectionReason || null,
      alternatives_considered: params.skillSelection.alternativesConsidered || [],
      alternative_scores: params.skillSelection.alternativeScores || [],
    } : null,
    // MCP execution context
    mcp_context: params.mcpContext ? {
      server_id: params.mcpContext.serverId,
      server_url: params.mcpContext.serverUrl || null,
      tool_id: params.mcpContext.toolId,
      protocol_version: params.mcpContext.protocolVersion || null,
      transport: params.mcpContext.transport || null,
      capabilities: params.mcpContext.capabilities || [],
      error_code: params.mcpContext.errorCode || null,
    } : null,
    // Decision metadata
    decision_metadata: params.decisionMetadata ? {
      was_user_initiated: params.decisionMetadata.wasUserInitiated || false,
      is_fallback: params.decisionMetadata.isFallback || false,
      retry_count: params.decisionMetadata.retryCount || 0,
      original_span_id: params.decisionMetadata.originalSpanId || null,
      required_approval: params.decisionMetadata.requiredApproval || false,
      approval_granted: params.decisionMetadata.approvalGranted || null,
    } : null,
    attributes,
  };
}

/**
 * Emit a span to the data layer
 *
 * This activity is called from workflows to record spans.
 * It sends data to the MooseStack ingest API.
 */
export async function emitSpan(params: EmitSpanParams): Promise<void> {
  const span = buildSpanPayload(params);

  const response = await fetch(`${NEON_API_URL}/api/spans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(span),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to emit span: ${error}`);
  }
}

/**
 * Extract project ID from trace ID
 *
 * Trace IDs are formatted as: trace-{projectId}-{timestamp}
 * Or for external traces, the project ID comes from headers
 */
function extractProjectId(traceId: string): string {
  // For managed execution, trace ID contains project ID
  const parts = traceId.split("-");
  if (parts.length >= 2 && parts[0] === "trace") {
    return parts[1];
  }
  // For external traces, default to extracting from context
  // In practice, this would be passed through the activity context
  return process.env.DEFAULT_PROJECT_ID || "default";
}

/**
 * Emit multiple spans in batch
 */
export async function emitSpansBatch(spans: EmitSpanParams[]): Promise<void> {
  const formattedSpans = spans.map((params) => buildSpanPayload(params));

  const response = await fetch(`${NEON_API_URL}/api/spans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formattedSpans),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to emit spans batch: ${error}`);
  }
}
