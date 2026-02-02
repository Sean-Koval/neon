/**
 * Optimization Signal Types
 *
 * Type definitions for reward signals used in agent optimization and RLHF.
 * Signals can be generated from traces, scores, annotations, or evaluations.
 */

import type {
  TraceWithSpans,
  SpanWithChildren,
  ComponentType,
  ScoreDataType,
  SpanStatus,
} from "@neon/shared";

/**
 * Signal type categories
 */
export type SignalType =
  | "reward"        // Scalar reward signal (e.g., 0-1 score)
  | "preference"    // Pairwise preference (A > B)
  | "demonstration" // Expert demonstration signal
  | "feedback"      // Human or automated feedback
  | "metric"        // Continuous metric values
  | "event";        // Discrete events of interest

/**
 * Source of the signal
 */
export type SignalSource =
  | "trace"         // Derived from trace analysis
  | "score"         // From evaluation scores
  | "annotation"    // Human annotation
  | "evaluation"    // Automated evaluation
  | "comparison"    // Pairwise comparison result
  | "derived";      // Derived/aggregated from other signals

/**
 * Granularity of the signal
 */
export type SignalGranularity =
  | "trace"         // Trace-level signal
  | "span"          // Span-level signal
  | "step"          // Individual step within execution
  | "component";    // Component-level (e.g., all retrieval spans)

/**
 * Base signal interface
 */
export interface Signal {
  /** Unique signal identifier */
  signalId: string;
  /** Type of signal */
  signalType: SignalType;
  /** Source of the signal */
  source: SignalSource;
  /** Granularity of the signal */
  granularity: SignalGranularity;
  /** Timestamp when signal was generated */
  timestamp: Date;
  /** Associated trace ID */
  traceId: string;
  /** Associated span ID (if span-level) */
  spanId?: string;
  /** Component type if component-level */
  componentType?: ComponentType;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
}

/**
 * Reward signal for RLHF-style training
 */
export interface RewardSignal extends Signal {
  signalType: "reward";
  /** Scalar reward value (typically 0-1 or -1 to 1) */
  value: number;
  /** Optional reason for the reward */
  reason?: string;
  /** Whether this is a terminal reward */
  terminal: boolean;
  /** Discount factor applied */
  discount?: number;
}

/**
 * Preference signal for pairwise comparisons
 */
export interface PreferenceSignal extends Signal {
  signalType: "preference";
  /** ID of the preferred trace/response */
  preferredId: string;
  /** ID of the rejected trace/response */
  rejectedId: string;
  /** Confidence in the preference (0-1) */
  confidence: number;
  /** Reason for the preference */
  reason?: string;
  /** Whether preference is based on multiple criteria */
  criteria?: string[];
}

/**
 * Demonstration signal for imitation learning
 */
export interface DemonstrationSignal extends Signal {
  signalType: "demonstration";
  /** The action taken */
  action: DemonstrationAction;
  /** State before the action */
  stateBefore?: Record<string, unknown>;
  /** State after the action */
  stateAfter?: Record<string, unknown>;
  /** Whether this is an expert demonstration */
  isExpert: boolean;
  /** Quality score of the demonstration */
  quality?: number;
}

/**
 * Action in a demonstration
 */
export interface DemonstrationAction {
  /** Type of action */
  actionType: "tool_call" | "generation" | "decision" | "other";
  /** Name of the action (e.g., tool name) */
  name: string;
  /** Input to the action */
  input?: string;
  /** Output of the action */
  output?: string;
  /** Parameters used */
  parameters?: Record<string, unknown>;
}

/**
 * Feedback signal from human or automated evaluation
 */
export interface FeedbackSignal extends Signal {
  signalType: "feedback";
  /** Feedback category */
  category: FeedbackCategory;
  /** Numeric rating if applicable */
  rating?: number;
  /** Free-form text feedback */
  text?: string;
  /** Structured feedback tags */
  tags?: string[];
  /** Whether feedback is from a human */
  isHuman: boolean;
  /** Author of the feedback */
  authorId?: string;
}

/**
 * Feedback categories
 */
export type FeedbackCategory =
  | "quality"        // Overall quality
  | "correctness"    // Factual correctness
  | "helpfulness"    // How helpful the response was
  | "safety"         // Safety/harmlessness
  | "efficiency"     // Resource efficiency
  | "style"          // Style/format
  | "other";

/**
 * Metric signal for continuous measurements
 */
export interface MetricSignal extends Signal {
  signalType: "metric";
  /** Name of the metric */
  name: string;
  /** Numeric value */
  value: number;
  /** Unit of measurement */
  unit?: string;
  /** Whether higher is better */
  higherIsBetter: boolean;
  /** Threshold for success */
  threshold?: number;
}

/**
 * Event signal for discrete occurrences
 */
export interface EventSignal extends Signal {
  signalType: "event";
  /** Event name */
  eventName: string;
  /** Event severity/importance */
  severity: "info" | "warning" | "error" | "critical";
  /** Event data */
  data?: Record<string, unknown>;
  /** Count if aggregated */
  count?: number;
}

/**
 * Union type of all signal types
 */
export type AnySignal =
  | RewardSignal
  | PreferenceSignal
  | DemonstrationSignal
  | FeedbackSignal
  | MetricSignal
  | EventSignal;

/**
 * Signal batch for efficient processing
 */
export interface SignalBatch {
  /** Batch identifier */
  batchId: string;
  /** Project ID */
  projectId: string;
  /** Signals in the batch */
  signals: AnySignal[];
  /** When batch was created */
  createdAt: Date;
  /** Source of the batch */
  source: string;
}

/**
 * Aggregated signals summary
 */
export interface SignalAggregation {
  /** Signal type being aggregated */
  signalType: SignalType;
  /** Number of signals */
  count: number;
  /** Mean value (for numeric signals) */
  mean?: number;
  /** Standard deviation */
  stdDev?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Distribution by source */
  bySource: Record<SignalSource, number>;
  /** Distribution by granularity */
  byGranularity: Record<SignalGranularity, number>;
  /** Time range */
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Configuration for signal generation
 */
export interface SignalGeneratorConfig {
  /** Name for this generator */
  name: string;
  /** Description of what signals it generates */
  description?: string;
  /** Default granularity */
  granularity: SignalGranularity;
  /** Whether to include terminal rewards */
  includeTerminalRewards?: boolean;
  /** Custom metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Signal filter options
 */
export interface SignalFilter {
  /** Filter by signal type */
  signalTypes?: SignalType[];
  /** Filter by source */
  sources?: SignalSource[];
  /** Filter by granularity */
  granularities?: SignalGranularity[];
  /** Filter by trace ID */
  traceIds?: string[];
  /** Filter by time range */
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  /** Filter by minimum value (for numeric signals) */
  minValue?: number;
  /** Filter by maximum value */
  maxValue?: number;
}

/**
 * Context for signal generation
 */
export interface SignalContext {
  /** The trace to generate signals from */
  trace: TraceWithSpans;
  /** Expected outputs for comparison */
  expected?: Record<string, unknown>;
  /** Evaluation scores if available */
  scores?: Array<{
    name: string;
    value: number;
    dataType: ScoreDataType;
  }>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of signal generation
 */
export interface SignalGenerationResult {
  /** Generated signals */
  signals: AnySignal[];
  /** Warnings during generation */
  warnings: string[];
  /** Statistics about generation */
  stats: {
    totalSignals: number;
    byType: Record<string, number>;
    byGranularity: Record<string, number>;
    generationTimeMs: number;
  };
}
