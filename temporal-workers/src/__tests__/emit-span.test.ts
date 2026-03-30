/**
 * Tests for Emit Span Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emitSpan, emitSpansBatch } from "../activities/emit-span";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("emitSpan", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.NEON_API_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("basic span emission", () => {
    it("emits a span successfully", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "generation",
        name: "test-span",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/spans",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("includes all required fields in span data", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "tool:search",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body).toMatchObject({
        project_id: "project1",
        trace_id: "trace-project1-12345",
        span_type: "tool",
        name: "tool:search",
        kind: "internal",
      });
      expect(body.span_id).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it("uses provided spanId when given", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanId: "custom-span-id",
        spanType: "generation",
        name: "test",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.span_id).toBe("custom-span-id");
    });

    it("includes optional fields when provided", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "generation",
        name: "llm:claude",
        parentSpanId: "parent-123",
        model: "claude-3-sonnet",
        input: "Hello",
        output: "Hi there!",
        inputTokens: 10,
        outputTokens: 20,
        durationMs: 500,
        status: "ok",
        statusMessage: "Success",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body).toMatchObject({
        parent_span_id: "parent-123",
        model: "claude-3-sonnet",
        input: "Hello",
        output: "Hi there!",
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        duration_ms: 500,
        status: "ok",
        status_message: "Success",
      });
    });

    it("includes tool fields for tool spans", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "tool:search",
        toolName: "search",
        toolInput: '{"query": "test"}',
        toolOutput: '{"results": []}',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body).toMatchObject({
        tool_name: "search",
        tool_input: '{"query": "test"}',
        tool_output: '{"results": []}',
      });
    });
  });

  describe("project ID extraction", () => {
    it("extracts project ID from trace ID format", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-myproject-12345",
        spanType: "span",
        name: "test",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.project_id).toBe("myproject");
    });

    it("uses DEFAULT_PROJECT_ID for non-standard trace IDs", async () => {
      process.env.DEFAULT_PROJECT_ID = "fallback-project";
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "external-trace-id",
        spanType: "span",
        name: "test",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.project_id).toBe("fallback-project");
    });

    it("uses 'default' when no DEFAULT_PROJECT_ID is set", async () => {
      delete process.env.DEFAULT_PROJECT_ID;
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "external-trace-id",
        spanType: "span",
        name: "test",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.project_id).toBe("default");
    });
  });

  describe("skill selection context", () => {
    it("includes skill selection data when provided", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "tool:search",
        skillSelection: {
          selectedSkill: "web_search",
          skillCategory: "search",
          selectionConfidence: 0.95,
          selectionReason: "User asked for web information",
          alternativesConsidered: ["file_search", "grep"],
          alternativeScores: [0.3, 0.2],
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.skill_selection).toEqual({
        selected_skill: "web_search",
        skill_category: "search",
        selection_confidence: 0.95,
        selection_reason: "User asked for web information",
        alternatives_considered: ["file_search", "grep"],
        alternative_scores: [0.3, 0.2],
      });
    });
  });

  describe("MCP context", () => {
    it("includes MCP context when provided", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "mcp:search",
        mcpContext: {
          serverId: "filesystem-server",
          serverUrl: "http://localhost:8080",
          toolId: "read_file",
          protocolVersion: "2024-01",
          transport: "stdio",
          capabilities: ["tools", "resources"],
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.mcp_context).toEqual({
        server_id: "filesystem-server",
        server_url: "http://localhost:8080",
        tool_id: "read_file",
        protocol_version: "2024-01",
        transport: "stdio",
        capabilities: ["tools", "resources"],
        error_code: null,
      });
    });
  });

  describe("decision metadata", () => {
    it("includes decision metadata when provided", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "tool:retry",
        decisionMetadata: {
          wasUserInitiated: false,
          isFallback: true,
          retryCount: 2,
          originalSpanId: "original-span-123",
          requiredApproval: true,
          approvalGranted: true,
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.decision_metadata).toEqual({
        was_user_initiated: false,
        is_fallback: true,
        retry_count: 2,
        original_span_id: "original-span-123",
        required_approval: true,
        approval_granted: true,
      });
    });
  });

  describe("rich schema fields", () => {
    it("preserves sessions, messages, handoffs, snapshots, artifacts, and eval annotations", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await emitSpan({
        traceId: "trace-project1-12345",
        spanType: "generation",
        name: "rich-span",
        session: {
          sessionId: "session-1",
          conversationId: "conversation-1",
          userId: "user-1",
          threadId: "thread-1",
        },
        inputMessages: [{ role: "user", content: "hello", messageId: "m1" }],
        outputMessages: [{ role: "assistant", content: "hi", messageId: "m2" }],
        handoff: {
          handoffType: "delegation",
          fromAgentId: "planner",
          toAgentId: "executor",
          taskDescription: "Execute step 2",
        },
        stateSnapshots: [{ snapshotId: "snapshot-1", stateType: "agent_state" }],
        artifacts: [{ artifactId: "artifact-1", name: "plan.json", kind: "json" }],
        evalAnnotations: [
          {
            annotationId: "annotation-1",
            name: "expected-tool",
            evaluatorType: "dataset",
            status: "expected",
          },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(body.session).toEqual({
        sessionId: "session-1",
        conversationId: "conversation-1",
        userId: "user-1",
        threadId: "thread-1",
      });
      expect(body.input_messages).toEqual([
        expect.objectContaining({ role: "user", content: "hello" }),
      ]);
      expect(body.output_messages).toEqual([
        expect.objectContaining({ role: "assistant", content: "hi" }),
      ]);
      expect(body.handoff).toEqual(
        expect.objectContaining({
          handoffType: "delegation",
          toAgentId: "executor",
        }),
      );
      expect(body.state_snapshots).toEqual([
        expect.objectContaining({ snapshotId: "snapshot-1" }),
      ]);
      expect(body.artifacts).toEqual([
        expect.objectContaining({ artifactId: "artifact-1" }),
      ]);
      expect(body.eval_annotations).toEqual([
        expect.objectContaining({ annotationId: "annotation-1" }),
      ]);
      expect(body.attributes["session.id"]).toBe("session-1");
      expect(body.attributes["gen_ai.conversation.id"]).toBe("conversation-1");
      expect(body.attributes["enduser.id"]).toBe("user-1");
      expect(body.attributes["neon.thread.id"]).toBe("thread-1");
      expect(JSON.parse(body.attributes["gen_ai.input.messages"])).toEqual([
        expect.objectContaining({ role: "user", content: "hello" }),
      ]);
      expect(JSON.parse(body.attributes["gen_ai.output.messages"])).toEqual([
        expect.objectContaining({ role: "assistant", content: "hi" }),
      ]);
      expect(body.attributes["neon.handoff.type"]).toBe("delegation");
      expect(body.attributes["neon.handoff.to_agent"]).toBe("executor");
      expect(JSON.parse(body.attributes["neon.state_snapshots"])).toEqual([
        expect.objectContaining({ snapshotId: "snapshot-1" }),
      ]);
      expect(JSON.parse(body.attributes["neon.artifacts"])).toEqual([
        expect.objectContaining({ artifactId: "artifact-1" }),
      ]);
      expect(JSON.parse(body.attributes["neon.eval.annotations"])).toEqual([
        expect.objectContaining({ annotationId: "annotation-1" }),
      ]);
    });
  });

  describe("error handling", () => {
    it("throws error when API call fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(
        emitSpan({
          traceId: "trace-project1-12345",
          spanType: "span",
          name: "test",
        })
      ).rejects.toThrow("Failed to emit span: Internal Server Error");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(
        emitSpan({
          traceId: "trace-project1-12345",
          spanType: "span",
          name: "test",
        })
      ).rejects.toThrow("Network error");
    });
  });
});

describe("emitSpansBatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEON_API_URL = "http://localhost:3000";
  });

  it("emits multiple spans in a single request", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await emitSpansBatch([
      {
        traceId: "trace-project1-12345",
        spanType: "generation",
        name: "span1",
      },
      {
        traceId: "trace-project1-12345",
        spanType: "tool",
        name: "span2",
      },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("span1");
    expect(body[1].name).toBe("span2");
  });

  it("handles empty batch", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await emitSpansBatch([]);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual([]);
  });

  it("throws error when batch API call fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Batch insert failed"),
    });

    await expect(
      emitSpansBatch([
        {
          traceId: "trace-project1-12345",
          spanType: "span",
          name: "test",
        },
      ])
    ).rejects.toThrow("Failed to emit spans batch: Batch insert failed");
  });

  it("includes all span fields in batch items", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await emitSpansBatch([
      {
        traceId: "trace-project1-12345",
        spanType: "generation",
        name: "llm-call",
        model: "claude-3",
        inputTokens: 100,
        outputTokens: 200,
        skillSelection: {
          selectedSkill: "chat",
          selectionConfidence: 0.9,
        },
      },
    ]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(body[0]).toMatchObject({
      model: "claude-3",
      input_tokens: 100,
      output_tokens: 200,
      total_tokens: 300,
    });
    expect(body[0].skill_selection).toMatchObject({
      selected_skill: "chat",
      selection_confidence: 0.9,
    });
  });
});
