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
