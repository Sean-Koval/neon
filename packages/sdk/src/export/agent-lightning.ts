/**
 * Agent Lightning Export
 *
 * Export traces in Agent Lightning format for RL training.
 * Agent Lightning is a framework for adding reinforcement learning
 * to AI agents without code rewrites.
 *
 * @see https://www.microsoft.com/en-us/research/blog/agent-lightning-adding-reinforcement-learning-to-ai-agents-without-code-rewrites/
 */

import type {
  TraceWithSpans,
  SpanWithChildren,
  ComponentType,
} from "@neon/shared";

/**
 * A single transition in the Agent Lightning format
 * Represents one LLM call with its input, output, and assigned reward
 */
export interface AgentLightningTransition {
  /** Unique identifier for this transition */
  transitionId: string;
  /** The prompt/input sent to the LLM */
  prompt: string;
  /** The generation/output from the LLM */
  generation: string;
  /** Immediate reward assigned to this transition */
  reward: number;
  /** Discount factor applied to future rewards */
  discount?: number;
  /** State context before this transition */
  stateBefore?: Record<string, unknown>;
  /** State context after this transition */
  stateAfter?: Record<string, unknown>;
  /** Component type attribution */
  componentType?: ComponentType;
  /** Tool name if this was a tool call */
  toolName?: string;
  /** Model used for generation */
  model?: string;
  /** Span-level metadata */
  metadata: Record<string, unknown>;
}

/**
 * An episode in Agent Lightning format
 * Represents a complete agent execution (trace)
 */
export interface AgentLightningEpisode {
  /** Unique episode identifier (trace ID) */
  episodeId: string;
  /** Name of the task/workflow */
  name: string;
  /** Ordered sequence of transitions */
  transitions: AgentLightningTransition[];
  /** Terminal reward for the entire episode */
  terminalReward: number;
  /** Whether the episode was successful */
  success: boolean;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Total tokens used */
  totalTokens: number;
  /** Episode-level metadata */
  metadata: Record<string, unknown>;
}

/**
 * Batch of episodes in Agent Lightning format
 */
export interface AgentLightningBatch {
  /** Format identifier */
  format: "agent-lightning";
  /** Format version */
  version: "1.0";
  /** Timestamp when batch was created */
  createdAt: string;
  /** Episodes in this batch */
  episodes: AgentLightningEpisode[];
  /** Batch-level statistics */
  stats: {
    totalEpisodes: number;
    totalTransitions: number;
    successRate: number;
    avgReward: number;
    avgDurationMs: number;
    avgTokens: number;
  };
  /** Batch-level metadata */
  metadata: Record<string, unknown>;
}

/**
 * Filter configuration for Agent Lightning export
 */
export interface AgentLightningFilter {
  /** Filter by component types (include only these) */
  componentTypes?: ComponentType[];
  /** Minimum score threshold (0-1) for including transitions */
  scoreThreshold?: number;
  /** Include only successful episodes */
  successOnly?: boolean;
  /** Maximum duration for episodes (filter out slow ones) */
  maxDurationMs?: number;
  /** Span types to include (default: ['generation', 'tool']) */
  spanTypes?: string[];
  /** Minimum reward value for transitions */
  minReward?: number;
  /** Maximum reward value for transitions */
  maxReward?: number;
}

/**
 * Configuration for Agent Lightning export
 */
export interface AgentLightningExportConfig {
  /** Filters to apply during export */
  filter?: AgentLightningFilter;
  /** Credit assignment strategy */
  creditAssignment?: "uniform" | "terminal" | "proportional" | "decay";
  /** Discount factor for reward assignment (default: 0.99) */
  discountFactor?: number;
  /** Base reward for successful execution (default: 1.0) */
  successReward?: number;
  /** Base penalty for failed execution (default: 0.0) */
  failurePenalty?: number;
  /** Include state snapshots in transitions */
  includeState?: boolean;
  /** Custom metadata to attach to batch */
  metadata?: Record<string, unknown>;
}

/**
 * Score data for credit assignment
 */
export interface ScoreData {
  name: string;
  value: number;
  spanId?: string;
}

/**
 * Context for exporting a single trace
 */
export interface ExportContext {
  /** The trace to export */
  trace: TraceWithSpans;
  /** Scores to use for reward assignment */
  scores?: ScoreData[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Flatten span tree into ordered array by timestamp
 */
function flattenSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
  const result: SpanWithChildren[] = [];

  function traverse(span: SpanWithChildren): void {
    result.push(span);
    for (const child of span.children) {
      traverse(child);
    }
  }

  for (const span of spans) {
    traverse(span);
  }

  return result.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Apply filters to spans
 */
function filterSpans(
  spans: SpanWithChildren[],
  filter?: AgentLightningFilter
): SpanWithChildren[] {
  if (!filter) return spans;

  return spans.filter((span) => {
    // Filter by span type
    if (filter.spanTypes && !filter.spanTypes.includes(span.spanType)) {
      return false;
    }

    // Filter by component type
    if (filter.componentTypes && span.componentType) {
      if (!filter.componentTypes.includes(span.componentType)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Assign credits/rewards to transitions based on strategy
 */
function assignCredits(
  transitions: AgentLightningTransition[],
  terminalReward: number,
  config: AgentLightningExportConfig
): AgentLightningTransition[] {
  const { creditAssignment = "decay", discountFactor = 0.99 } = config;

  const n = transitions.length;
  if (n === 0) return [];

  switch (creditAssignment) {
    case "uniform": {
      // Distribute reward equally
      const rewardPerStep = terminalReward / n;
      return transitions.map((t) => ({
        ...t,
        reward: rewardPerStep,
        discount: 1.0,
      }));
    }

    case "terminal": {
      // Only assign reward to last transition
      return transitions.map((t, i) => ({
        ...t,
        reward: i === n - 1 ? terminalReward : 0,
        discount: 1.0,
      }));
    }

    case "proportional": {
      // Assign proportional to position (later steps get more)
      const totalWeight = (n * (n + 1)) / 2;
      return transitions.map((t, i) => ({
        ...t,
        reward: (terminalReward * (i + 1)) / totalWeight,
        discount: 1.0,
      }));
    }

    case "decay":
    default: {
      // Exponential decay from terminal (standard RL discount)
      return transitions.map((t, i) => {
        const stepsFromEnd = n - 1 - i;
        const discount = Math.pow(discountFactor, stepsFromEnd);
        return {
          ...t,
          reward: terminalReward * discount,
          discount,
        };
      });
    }
  }
}

/**
 * Convert a span to an Agent Lightning transition
 */
function spanToTransition(
  span: SpanWithChildren,
  index: number,
  config: AgentLightningExportConfig
): AgentLightningTransition | null {
  // Extract prompt and generation based on span type
  let prompt = "";
  let generation = "";

  if (span.spanType === "generation") {
    prompt = span.input || "";
    generation = span.output || "";
  } else if (span.spanType === "tool") {
    prompt = span.toolInput || span.input || "";
    generation = span.toolOutput || span.output || "";
  } else {
    // For other span types, use input/output if available
    prompt = span.input || "";
    generation = span.output || "";
  }

  // Skip if no meaningful prompt/generation
  if (!prompt && !generation) {
    return null;
  }

  const transition: AgentLightningTransition = {
    transitionId: span.spanId,
    prompt,
    generation,
    reward: 0, // Will be assigned later
    componentType: span.componentType,
    toolName: span.toolName,
    model: span.model,
    metadata: {
      spanName: span.name,
      spanType: span.spanType,
      durationMs: span.durationMs,
      status: span.status,
      inputTokens: span.inputTokens,
      outputTokens: span.outputTokens,
    },
  };

  if (config.includeState) {
    transition.stateBefore = {
      timestamp: span.timestamp,
      spanIndex: index,
    };
    transition.stateAfter = {
      timestamp: span.endTime,
      status: span.status,
    };
  }

  return transition;
}

/**
 * Calculate terminal reward from trace and scores
 */
function calculateTerminalReward(
  trace: TraceWithSpans,
  scores?: ScoreData[],
  config?: AgentLightningExportConfig
): number {
  const successReward = config?.successReward ?? 1.0;
  const failurePenalty = config?.failurePenalty ?? 0.0;

  // Base reward from trace status
  const isSuccess = trace.trace.status === "ok";
  let reward = isSuccess ? successReward : failurePenalty;

  // Incorporate scores if available
  if (scores && scores.length > 0) {
    const avgScore = scores.reduce((sum, s) => sum + s.value, 0) / scores.length;
    // Blend base reward with average score
    reward = reward * 0.5 + avgScore * 0.5;
  }

  return Math.max(-1, Math.min(1, reward));
}

/**
 * Export a single trace to Agent Lightning episode format
 *
 * @example
 * ```typescript
 * const episode = exportToAgentLightning({
 *   trace: myTrace,
 *   scores: [{ name: 'quality', value: 0.9 }],
 * }, {
 *   creditAssignment: 'decay',
 *   discountFactor: 0.99,
 *   filter: {
 *     componentTypes: ['tool', 'generation'],
 *     scoreThreshold: 0.5,
 *   },
 * });
 * ```
 */
export function exportToAgentLightning(
  context: ExportContext,
  config: AgentLightningExportConfig = {}
): AgentLightningEpisode | null {
  const { trace, scores, metadata } = context;
  const { filter } = config;

  // Apply episode-level filters
  if (filter?.successOnly && trace.trace.status !== "ok") {
    return null;
  }

  if (filter?.maxDurationMs && trace.trace.durationMs > filter.maxDurationMs) {
    return null;
  }

  // Flatten and filter spans
  const allSpans = flattenSpans(trace.spans);
  const defaultSpanTypes = ["generation", "tool"];
  const spanFilter: AgentLightningFilter = {
    ...filter,
    spanTypes: filter?.spanTypes ?? defaultSpanTypes,
  };
  const filteredSpans = filterSpans(allSpans, spanFilter);

  // Convert spans to transitions
  let transitions: AgentLightningTransition[] = [];
  for (let i = 0; i < filteredSpans.length; i++) {
    const span = filteredSpans[i];
    const transition = spanToTransition(span, i, config);
    if (transition) {
      // Apply span-level score if available
      const spanScore = scores?.find((s) => s.spanId === span.spanId);
      if (spanScore) {
        transition.metadata.score = spanScore.value;
        transition.metadata.scoreName = spanScore.name;
      }
      transitions.push(transition);
    }
  }

  // Apply score threshold filter
  if (filter?.scoreThreshold !== undefined) {
    transitions = transitions.filter((t) => {
      const score = t.metadata.score as number | undefined;
      return score === undefined || score >= filter.scoreThreshold!;
    });
  }

  // Apply reward range filters
  if (filter?.minReward !== undefined || filter?.maxReward !== undefined) {
    transitions = transitions.filter((t) => {
      if (filter.minReward !== undefined && t.reward < filter.minReward) {
        return false;
      }
      if (filter.maxReward !== undefined && t.reward > filter.maxReward) {
        return false;
      }
      return true;
    });
  }

  // Skip if no transitions
  if (transitions.length === 0) {
    return null;
  }

  // Calculate terminal reward
  const terminalReward = calculateTerminalReward(trace, scores, config);

  // Assign credits to transitions
  transitions = assignCredits(transitions, terminalReward, config);

  const totalTokens =
    trace.trace.totalInputTokens + trace.trace.totalOutputTokens;

  return {
    episodeId: trace.trace.traceId,
    name: trace.trace.name,
    transitions,
    terminalReward,
    success: trace.trace.status === "ok",
    durationMs: trace.trace.durationMs,
    totalTokens,
    metadata: {
      agentId: trace.trace.agentId,
      agentVersion: trace.trace.agentVersion,
      workflowId: trace.trace.workflowId,
      ...trace.trace.metadata,
      ...metadata,
    },
  };
}

/**
 * Export multiple traces to Agent Lightning batch format
 *
 * @example
 * ```typescript
 * const batch = exportBatchToAgentLightning(
 *   traces.map(t => ({ trace: t, scores: scoresMap[t.trace.traceId] })),
 *   {
 *     creditAssignment: 'decay',
 *     filter: { successOnly: true },
 *     metadata: { projectId: 'my-project' },
 *   }
 * );
 *
 * // Write to file for training
 * fs.writeFileSync('training-data.json', JSON.stringify(batch, null, 2));
 * ```
 */
export function exportBatchToAgentLightning(
  contexts: ExportContext[],
  config: AgentLightningExportConfig = {}
): AgentLightningBatch {
  const episodes: AgentLightningEpisode[] = [];

  for (const context of contexts) {
    const episode = exportToAgentLightning(context, config);
    if (episode) {
      episodes.push(episode);
    }
  }

  // Calculate batch statistics
  const totalTransitions = episodes.reduce(
    (sum, e) => sum + e.transitions.length,
    0
  );
  const successCount = episodes.filter((e) => e.success).length;
  const totalReward = episodes.reduce((sum, e) => sum + e.terminalReward, 0);
  const totalDuration = episodes.reduce((sum, e) => sum + e.durationMs, 0);
  const totalTokens = episodes.reduce((sum, e) => sum + e.totalTokens, 0);

  return {
    format: "agent-lightning",
    version: "1.0",
    createdAt: new Date().toISOString(),
    episodes,
    stats: {
      totalEpisodes: episodes.length,
      totalTransitions,
      successRate: episodes.length > 0 ? successCount / episodes.length : 0,
      avgReward: episodes.length > 0 ? totalReward / episodes.length : 0,
      avgDurationMs: episodes.length > 0 ? totalDuration / episodes.length : 0,
      avgTokens: episodes.length > 0 ? totalTokens / episodes.length : 0,
    },
    metadata: {
      exportedAt: new Date().toISOString(),
      ...config.metadata,
    },
  };
}

/**
 * Configuration for streaming export
 */
export interface StreamExportConfig extends AgentLightningExportConfig {
  /** Callback for each exported episode */
  onEpisode?: (episode: AgentLightningEpisode) => void;
  /** Callback for progress updates */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Export traces with streaming support for large datasets
 *
 * @example
 * ```typescript
 * const results = await streamExportToAgentLightning(
 *   traceContexts,
 *   {
 *     onEpisode: (episode) => appendToFile(episode),
 *     onProgress: (current, total) => console.log(`${current}/${total}`),
 *   }
 * );
 * ```
 */
export async function streamExportToAgentLightning(
  contexts: ExportContext[],
  config: StreamExportConfig = {}
): Promise<AgentLightningBatch> {
  const { onEpisode, onProgress, ...exportConfig } = config;
  const episodes: AgentLightningEpisode[] = [];
  const total = contexts.length;

  for (let i = 0; i < total; i++) {
    const episode = exportToAgentLightning(contexts[i], exportConfig);
    if (episode) {
      episodes.push(episode);
      if (onEpisode) {
        onEpisode(episode);
      }
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    // Yield to event loop for large batches
    if (i % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Calculate batch statistics
  const totalTransitions = episodes.reduce(
    (sum, e) => sum + e.transitions.length,
    0
  );
  const successCount = episodes.filter((e) => e.success).length;
  const totalReward = episodes.reduce((sum, e) => sum + e.terminalReward, 0);
  const totalDuration = episodes.reduce((sum, e) => sum + e.durationMs, 0);
  const totalTokens = episodes.reduce((sum, e) => sum + e.totalTokens, 0);

  return {
    format: "agent-lightning",
    version: "1.0",
    createdAt: new Date().toISOString(),
    episodes,
    stats: {
      totalEpisodes: episodes.length,
      totalTransitions,
      successRate: episodes.length > 0 ? successCount / episodes.length : 0,
      avgReward: episodes.length > 0 ? totalReward / episodes.length : 0,
      avgDurationMs: episodes.length > 0 ? totalDuration / episodes.length : 0,
      avgTokens: episodes.length > 0 ? totalTokens / episodes.length : 0,
    },
    metadata: {
      exportedAt: new Date().toISOString(),
      ...exportConfig.metadata,
    },
  };
}

/**
 * Validate an Agent Lightning batch for completeness
 */
export function validateAgentLightningBatch(
  batch: AgentLightningBatch
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (batch.format !== "agent-lightning") {
    errors.push(
      `Invalid format: expected 'agent-lightning', got '${batch.format}'`
    );
  }

  if (batch.version !== "1.0") {
    errors.push(`Unsupported version: ${batch.version}`);
  }

  if (!Array.isArray(batch.episodes)) {
    errors.push("Episodes must be an array");
  }

  for (let i = 0; i < batch.episodes.length; i++) {
    const episode = batch.episodes[i];
    if (!episode.episodeId) {
      errors.push(`Episode ${i}: missing episodeId`);
    }
    if (!Array.isArray(episode.transitions)) {
      errors.push(`Episode ${i}: transitions must be an array`);
    }
    for (let j = 0; j < episode.transitions.length; j++) {
      const t = episode.transitions[j];
      if (t.prompt === undefined) {
        errors.push(`Episode ${i}, Transition ${j}: missing prompt`);
      }
      if (t.generation === undefined) {
        errors.push(`Episode ${i}, Transition ${j}: missing generation`);
      }
      if (typeof t.reward !== "number") {
        errors.push(`Episode ${i}, Transition ${j}: reward must be a number`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge multiple Agent Lightning batches into one
 */
export function mergeAgentLightningBatches(
  batches: AgentLightningBatch[]
): AgentLightningBatch {
  const allEpisodes: AgentLightningEpisode[] = [];
  const mergedMetadata: Record<string, unknown> = {};

  for (const batch of batches) {
    allEpisodes.push(...batch.episodes);
    Object.assign(mergedMetadata, batch.metadata);
  }

  // Recalculate statistics
  const totalTransitions = allEpisodes.reduce(
    (sum, e) => sum + e.transitions.length,
    0
  );
  const successCount = allEpisodes.filter((e) => e.success).length;
  const totalReward = allEpisodes.reduce((sum, e) => sum + e.terminalReward, 0);
  const totalDuration = allEpisodes.reduce((sum, e) => sum + e.durationMs, 0);
  const totalTokens = allEpisodes.reduce((sum, e) => sum + e.totalTokens, 0);

  return {
    format: "agent-lightning",
    version: "1.0",
    createdAt: new Date().toISOString(),
    episodes: allEpisodes,
    stats: {
      totalEpisodes: allEpisodes.length,
      totalTransitions,
      successRate:
        allEpisodes.length > 0 ? successCount / allEpisodes.length : 0,
      avgReward: allEpisodes.length > 0 ? totalReward / allEpisodes.length : 0,
      avgDurationMs:
        allEpisodes.length > 0 ? totalDuration / allEpisodes.length : 0,
      avgTokens: allEpisodes.length > 0 ? totalTokens / allEpisodes.length : 0,
    },
    metadata: {
      mergedAt: new Date().toISOString(),
      batchCount: batches.length,
      ...mergedMetadata,
    },
  };
}
