/**
 * Analysis Module
 *
 * Advanced analysis tools for understanding agent behavior patterns,
 * failure modes, and execution characteristics.
 */

// Pattern Detection
export {
  // Core functions (sync, token-based)
  detectPatterns,
  extractFailureFeatures,
  normalizeErrorMessage,
  categorizeError,
  computeSignature,
  measureSimilarity,
  matchesPattern,
  findMatchingPatterns,
  // Async functions (embedding-based)
  detectPatternsAsync,
  measureSimilarityWithEmbeddings,
  // Embedding utilities
  EmbeddingIndex,
  cosineSimilarity,
  clearEmbeddingCache,
  getEmbeddingCacheSize,
  // Scorers
  patternDiversityScorer,
  patternConcentrationScorer,
  novelPatternScorer,
  patternAnalysisDetailedScorer,
  // Types
  type ErrorCategory,
  type FailureFeatures,
  type FailurePattern,
  type PatternDetectorConfig,
  type PatternAnalysisResult,
  type PatternScorerConfig,
  type SimilarityMethod,
  type EmbeddingFunction,
} from "./pattern-detector.js";

// Failure Correlation Analysis
export {
  // Analyzer class
  CorrelationAnalyzer,
  createCorrelationAnalyzer,
  // Standalone query functions
  querySimilarFailures,
  // Error handling
  CorrelationAnalysisError,
  type CorrelationErrorCode,
  // Types
  type ClickHouseConfig,
  type ClickHouseClientInterface,
  type ClickHouseClientFactory,
  type TimeWindow,
  type FailureRecord,
  type CorrelatedPattern,
  type SystemicIssue,
  type PatternCorrelation,
  type ComponentHealth,
  type TimeWindowAnalysis,
  type FindCorrelatedFailuresOptions,
  type IdentifySystemicIssuesOptions,
  type ComponentHealthOptions,
} from "./correlation.js";
