/**
 * Scorers Index
 *
 * Re-exports all scorer types and utilities.
 */

// Base types and utilities
export {
  defineScorer,
  type Scorer,
  type ScorerConfig,
  type EvalContext,
  type ScoreResult,
} from "./base.js";

// LLM Judge
export {
  llmJudge,
  responseQualityJudge,
  safetyJudge,
  helpfulnessJudge,
  type LLMJudgeConfig,
} from "./llm-judge.js";

// Rule-based scorers
export {
  ruleBasedScorer,
  toolSelectionScorer,
  // New API (preferred)
  contains,
  exactMatch,
  // Legacy aliases (deprecated)
  containsScorer,
  exactMatchScorer,
  // Other scorers
  jsonMatchScorer,
  latencyScorer,
  errorRateScorer,
  tokenEfficiencyScorer,
  successScorer,
  iterationScorer,
  // Types
  type RuleBasedConfig,
  type ContainsConfig,
  type ExactMatchConfig,
} from "./rule-based.js";
