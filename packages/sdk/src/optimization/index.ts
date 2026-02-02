/**
 * Optimization Module
 *
 * Generate reward signals from traces for agent optimization and RLHF.
 *
 * @example
 * ```typescript
 * import {
 *   generateSignals,
 *   generateRewardSignals,
 *   generatePreferenceSignal,
 *   aggregateSignals,
 *   filterSignals,
 *   toRLHFFormat,
 * } from '@neon/sdk';
 *
 * // Generate comprehensive signals from a trace
 * const result = generateSignals(context, {
 *   includeRewards: true,
 *   includeMetrics: true,
 *   includeEvents: true,
 *   rewardConfig: {
 *     granularity: 'trace',
 *     successReward: 1.0,
 *   },
 * });
 *
 * // Filter to only high-value rewards
 * const highRewards = filterSignals(result.signals, {
 *   signalTypes: ['reward'],
 *   minValue: 0.8,
 * });
 *
 * // Aggregate for analysis
 * const summary = aggregateSignals(result.signals);
 *
 * // Convert to RLHF training format
 * const trainingData = toRLHFFormat(result.signals);
 * ```
 */

// Types
export type {
  // Core signal types
  SignalType,
  SignalSource,
  SignalGranularity,
  Signal,
  // Specific signal types
  RewardSignal,
  PreferenceSignal,
  DemonstrationSignal,
  FeedbackSignal,
  MetricSignal,
  EventSignal,
  AnySignal,
  // Supporting types
  DemonstrationAction,
  FeedbackCategory,
  SignalBatch,
  SignalAggregation,
  SignalGeneratorConfig,
  SignalFilter,
  SignalContext,
  SignalGenerationResult,
} from "./types.js";

// Signal generation functions
export {
  // Comprehensive signal generation
  generateSignals,
  // Specific signal generators
  generateRewardSignals,
  generateDemonstrationSignals,
  generateMetricSignals,
  generateEventSignals,
  generatePreferenceSignal,
  // Utility functions
  filterSignals,
  aggregateSignals,
  createSignalBatch,
  toRLHFFormat,
  // Config types
  type RewardSignalConfig,
  type DemonstrationSignalConfig,
  type MetricSignalConfig,
  type EventSignalConfig,
  type PreferenceSignalConfig,
  type ComprehensiveSignalConfig,
} from "./signals.js";
