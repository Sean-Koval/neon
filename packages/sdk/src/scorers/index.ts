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

// Causal analysis scorers
export {
  causalAnalysisScorer,
  causalAnalysisDetailedScorer,
  rootCauseScorer,
  analyzeCausality,
  // Types
  type CausalAnalysisConfig,
  type CausalAnalysisResult,
  type CausalNode,
} from "./causal.js";

// Skill selection scorers
export {
  skillSelectionScorer,
  skillChainScorer,
  skillSetScorer,
  firstSkillScorer,
  skillCategoryScorer,
  skillConfidenceScorer,
  // Types
  type SkillSelectionConfig,
  type SkillSubstitutes,
  type SkillCategoryMap,
  type SkillSelectionDetails,
} from "./skill-selection.js";

// Parameter accuracy scorers
export {
  parameterAccuracyScorer,
  parameterTypeScorer,
  parameterCompletenessScorer,
  parameterValueMatchScorer,
  parameterConstraintScorer,
  // Types
  type ParameterType,
  type ParameterSchemaItem,
  type ParameterAccuracyConfig,
  type ParameterAccuracyDetails,
} from "./parameter-accuracy.js";

// Result quality scorers
export {
  resultQualityScorer,
  outputTypeScorer,
  outputPatternScorer,
  outputCompletenessScorer,
  outputLengthScorer,
  noForbiddenPatternsScorer,
  resultSuccessScorer,
  resultLatencyScorer,
  // Types
  type OutputType,
  type ResultQualityConfig,
  type ResultQualityDetails,
} from "./result-quality.js";
