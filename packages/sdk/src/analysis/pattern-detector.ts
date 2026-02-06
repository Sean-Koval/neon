/**
 * Failure Pattern Detector
 *
 * Implements ML-based pattern detection for identifying recurring failure signatures.
 * Extracts features from failed spans, clusters similar failures, and generates
 * pattern signatures for matching across traces.
 *
 * @example
 * ```typescript
 * // Detect patterns in a trace
 * const result = detectPatterns(evalContext);
 * console.log(result.patterns); // Array of FailurePattern
 *
 * // Use as a scorer
 * const scorer = patternDiversityScorer();
 * const score = scorer.evaluate(context);
 * ```
 */

import type { SpanWithChildren, ComponentType, SpanType } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext, type ScoreResult } from "../scorers/base.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Error category for grouping similar errors
 */
export type ErrorCategory =
  | "timeout"
  | "connection"
  | "authentication"
  | "authorization"
  | "validation"
  | "rate_limit"
  | "not_found"
  | "server_error"
  | "client_error"
  | "parse_error"
  | "configuration"
  | "dependency"
  | "resource_exhausted"
  | "unknown";

/**
 * Features extracted from a failed span for pattern matching
 */
export interface FailureFeatures {
  /** The raw error message */
  errorMessage: string | undefined;
  /** Normalized error message (dynamic values stripped) */
  normalizedMessage: string | undefined;
  /** Categorized error type */
  errorCategory: ErrorCategory;
  /** Component type that failed */
  componentType: ComponentType | undefined;
  /** Span type (span, generation, tool, etc.) */
  spanType: SpanType;
  /** Tool name if this was a tool span */
  toolName: string | undefined;
  /** Span name for context */
  spanName: string;
  /** Stack trace signature if available (in attributes) */
  stackSignature: string | undefined;
}

/**
 * A detected failure pattern
 */
export interface FailurePattern {
  /** Unique signature for this pattern */
  signature: string;
  /** Human-readable pattern name */
  name: string;
  /** Normalized error message pattern (regex-like) */
  messagePattern: string;
  /** Error category */
  category: ErrorCategory;
  /** Component types where this pattern appears */
  componentTypes: ComponentType[];
  /** Tool names associated with this pattern */
  toolNames: string[];
  /** Span types where this pattern appears */
  spanTypes: SpanType[];
  /** Number of occurrences */
  frequency: number;
  /** First occurrence timestamp */
  firstSeen: Date;
  /** Most recent occurrence timestamp */
  lastSeen: Date;
  /** Example span IDs demonstrating this pattern */
  exampleSpanIds: string[];
  /** Confidence score (0-1) based on cluster cohesion */
  confidence: number;
}

/**
 * Similarity method for comparing error messages
 */
export type SimilarityMethod = "token" | "embedding";

/**
 * Function type for computing embeddings from text
 * Users can provide their own embedding function using any model/API
 *
 * @example
 * ```typescript
 * // Using @xenova/transformers (runs locally)
 * import { pipeline } from '@xenova/transformers';
 * const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 *
 * const embedFn: EmbeddingFunction = async (texts) => {
 *   const results = await extractor(texts, { pooling: 'mean', normalize: true });
 *   return results.tolist();
 * };
 *
 * // Using OpenAI API
 * const embedFn: EmbeddingFunction = async (texts) => {
 *   const response = await openai.embeddings.create({
 *     model: 'text-embedding-3-small',
 *     input: texts,
 *   });
 *   return response.data.map(d => d.embedding);
 * };
 * ```
 */
export type EmbeddingFunction = (texts: string[]) => Promise<number[][]>;

/**
 * Configuration for pattern detection
 */
export interface PatternDetectorConfig {
  /** Minimum occurrences to be considered a pattern. Default: 2 */
  minFrequency?: number;
  /** Similarity threshold (0-1) for clustering. Default: 0.5 */
  similarityThreshold?: number;
  /** Maximum patterns to return. Default: 10 */
  maxPatterns?: number;
  /** Maximum example span IDs per pattern. Default: 5 */
  maxExamples?: number;
  /** Custom error category rules (regex -> category) */
  customCategories?: Array<{ pattern: RegExp; category: ErrorCategory }>;
  /**
   * Method for computing message similarity. Default: "token"
   * - "token": Fast, rule-based Jaccard similarity on tokens
   * - "embedding": Semantic similarity using embeddings (requires embeddingFn)
   */
  similarityMethod?: SimilarityMethod;
  /**
   * Embedding function for semantic similarity.
   * Required when similarityMethod is "embedding".
   * See EmbeddingFunction type for examples.
   */
  embeddingFn?: EmbeddingFunction;
  /**
   * Cache embeddings to avoid recomputing. Default: true
   * Only applies when similarityMethod is "embedding"
   */
  cacheEmbeddings?: boolean;
}

/**
 * Resolved config with defaults applied (internal use)
 * embeddingFn remains optional since it's only needed for embedding mode
 */
interface ResolvedPatternDetectorConfig {
  minFrequency: number;
  similarityThreshold: number;
  maxPatterns: number;
  maxExamples: number;
  customCategories: Array<{ pattern: RegExp; category: ErrorCategory }>;
  similarityMethod: SimilarityMethod;
  embeddingFn?: EmbeddingFunction;
  cacheEmbeddings: boolean;
}

/**
 * Result of pattern analysis
 */
export interface PatternAnalysisResult {
  /** Detected patterns, sorted by frequency (descending) */
  patterns: FailurePattern[];
  /** Total number of failed spans analyzed */
  totalFailures: number;
  /** Number of unique patterns found */
  uniquePatterns: number;
  /** Most frequent pattern, if any */
  topPattern: FailurePattern | null;
  /** Human-readable summary */
  summary: string;
  /** Spans that couldn't be clustered (noise) */
  unclusteredCount: number;
}

/**
 * Internal: Cluster of similar failures
 */
interface FailureCluster {
  features: FailureFeatures[];
  spans: SpanWithChildren[];
  centroidFeatures: FailureFeatures;
}

// ============================================================================
// Default Error Category Rules
// ============================================================================

/**
 * Maximum input length for regex matching
 * Prevents ReDoS attacks from causing hangs on malicious input
 */
const MAX_REGEX_INPUT_LENGTH = 1000;

/**
 * Safe regex test with input length protection
 * Truncates long inputs to prevent catastrophic backtracking
 */
function safeRegexTest(pattern: RegExp, input: string): boolean {
  // For short inputs, just run the regex directly (low risk)
  if (input.length <= MAX_REGEX_INPUT_LENGTH) {
    return pattern.test(input);
  }
  // For longer inputs, truncate to prevent ReDoS
  return pattern.test(input.slice(0, MAX_REGEX_INPUT_LENGTH));
}

/**
 * Default error category rules
 * SECURITY: Patterns are designed to avoid ReDoS vulnerabilities:
 * - Avoid nested quantifiers (e.g., (a+)+ or (a*)*)
 * - Use word boundaries to limit backtracking
 * - Replace \s* with literal space or [ ]? for optional single space
 * - Split complex patterns into multiple simpler patterns
 */
const DEFAULT_ERROR_CATEGORIES: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  // Timeout patterns - use literal space or optional single space
  { pattern: /\b(?:timeout|timed ?out|deadline exceeded)\b/i, category: "timeout" },
  // Connection patterns - simple alternation
  { pattern: /\b(?:connect|connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network)\b/i, category: "connection" },
  // Rate limit patterns - use literal space
  { pattern: /\b(?:rate limit|too many requests|quota|throttl)/i, category: "rate_limit" },
  // Authentication patterns - split into simpler patterns to avoid backtracking
  { pattern: /\b(?:auth failed|auth error|authentication failed|authentication error|authorization failed|authorization error)\b/i, category: "authentication" },
  { pattern: /\b(?:unauthenticated|login fail|credential|invalid token|token invalid|token expired|api key)\b/i, category: "authentication" },
  // Authorization patterns - simple literals
  { pattern: /\b(?:forbidden|permission denied|access denied|unauthorized|not allowed)\b|403/i, category: "authorization" },
  // Not found patterns - simple literals
  { pattern: /\b(?:not found|does not exist|no such)\b|404/i, category: "not_found" },
  // Server error patterns - simple literals
  { pattern: /\b(?:internal server|server error|service unavailable)\b|500|503/i, category: "server_error" },
  // Client error patterns - simple literals
  { pattern: /\b(?:bad request|client error)\b|400/i, category: "client_error" },
  // Parse error patterns - split to avoid complex alternations
  { pattern: /\b(?:parse error|syntax error|unexpected token)\b/i, category: "parse_error" },
  { pattern: /JSON\.parse|XML parse|XML syntax/i, category: "parse_error" },
  // Configuration patterns - split to avoid nested optional groups
  { pattern: /\b(?:config error|config missing|config invalid|configuration error|configuration missing|configuration invalid)\b/i, category: "configuration" },
  { pattern: /\b(?:not configured|environment variable)\b/i, category: "configuration" },
  // Dependency patterns - simple literals
  { pattern: /\b(?:dependency|cannot find module|package|require failed)\b/i, category: "dependency" },
  // Resource exhausted patterns - use literal spaces
  { pattern: /\b(?:out of memory|disk full|disk space|resource exhausted|quota exceeded)\b/i, category: "resource_exhausted" },
  // Validation patterns - split into multiple simpler patterns
  { pattern: /\bvalidation|malformed\b/i, category: "validation" },
  { pattern: /\binvalid (?:input|value|argument|parameter)\b/i, category: "validation" },
  { pattern: /\b(?:required field|missing field|missing parameter)\b/i, category: "validation" },
  { pattern: /\b(?:must be|cannot be empty|cannot be null)\b/i, category: "validation" },
];

// ============================================================================
// Feature Extraction
// ============================================================================

/**
 * Normalize an error message by stripping dynamic values
 * This helps group similar errors that differ only in IDs, timestamps, etc.
 *
 * Important: Order of replacements matters! More specific patterns (URLs, timestamps)
 * must be replaced before more general patterns (paths, numeric IDs).
 */
export function normalizeErrorMessage(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }

  let normalized = message;

  // Replace UUIDs first (very specific pattern)
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "<UUID>"
  );

  // Replace timestamps BEFORE numeric IDs (timestamps contain numbers)
  // ISO format: 2024-01-15T10:30:00Z or 2024-01-15T10:30:00.123+00:00
  normalized = normalized.replace(
    /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
    "<TIMESTAMP>"
  );

  // Replace URLs BEFORE paths (URLs contain paths)
  normalized = normalized.replace(/https?:\/\/[^\s]+/g, "<URL>");

  // Replace IP addresses BEFORE numeric IDs
  normalized = normalized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>");

  // Replace email addresses
  normalized = normalized.replace(/[\w.-]+@[\w.-]+\.\w+/g, "<EMAIL>");

  // Replace hex strings (common in error codes)
  normalized = normalized.replace(/\b0x[0-9a-f]+\b/gi, "<HEX>");

  // Replace file paths (after URLs which contain paths)
  normalized = normalized.replace(/(?:\/[\w.-]+)+/g, "<PATH>");

  // Replace numeric IDs last (standalone numbers 4+ digits, often IDs)
  normalized = normalized.replace(/\b\d{4,}\b/g, "<ID>");

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Categorize an error message into a known category
 */
export function categorizeError(
  message: string | undefined,
  customCategories?: Array<{ pattern: RegExp; category: ErrorCategory }>
): ErrorCategory {
  if (!message) {
    return "unknown";
  }

  // Check custom categories first (use safe test for user-provided patterns)
  if (customCategories) {
    for (const { pattern, category } of customCategories) {
      if (safeRegexTest(pattern, message)) {
        return category;
      }
    }
  }

  // Check default categories (safe patterns, but still use safeRegexTest for defense in depth)
  for (const { pattern, category } of DEFAULT_ERROR_CATEGORIES) {
    if (safeRegexTest(pattern, message)) {
      return category;
    }
  }

  return "unknown";
}

/**
 * Extract a stack trace signature from attributes
 * Normalizes the stack trace to remove line numbers and file paths
 */
function extractStackSignature(attributes: Record<string, string>): string | undefined {
  const stackTrace =
    attributes["exception.stacktrace"] ||
    attributes["error.stack"] ||
    attributes["stacktrace"];

  if (!stackTrace) {
    return undefined;
  }

  // Split into lines and process each frame
  const lines = stackTrace.split("\n");
  const frames: string[] = [];

  for (const line of lines) {
    // Skip node_modules frames - check the full line for the path
    if (line.includes("node_modules")) {
      continue;
    }

    // Extract function/method name from "at functionName (path:line:col)" or "at functionName path:line:col"
    const match = line.match(/at\s+(?:async\s+)?([^\s(]+)/);
    if (match) {
      // Remove line:column info
      const frame = match[1].replace(/:\d+:\d+$/, "");
      // Skip anonymous or internal frames
      if (frame && frame !== "Object.<anonymous>" && !frame.startsWith("internal/")) {
        frames.push(frame);
      }
    }

    // Limit to top 5 frames for signature
    if (frames.length >= 5) {
      break;
    }
  }

  return frames.length > 0 ? frames.join(" > ") : undefined;
}

/**
 * Extract failure features from a span
 */
export function extractFailureFeatures(
  span: SpanWithChildren,
  config?: PatternDetectorConfig
): FailureFeatures {
  const errorMessage = span.statusMessage;
  const normalizedMessage = normalizeErrorMessage(errorMessage);
  const errorCategory = categorizeError(errorMessage, config?.customCategories);
  const stackSignature = extractStackSignature(span.attributes);

  return {
    errorMessage,
    normalizedMessage,
    errorCategory,
    componentType: span.componentType,
    spanType: span.spanType,
    toolName: span.toolName,
    spanName: span.name,
    stackSignature,
  };
}

// ============================================================================
// Signature Generation
// ============================================================================

/**
 * Simple hash function for generating signatures
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to hex and ensure positive
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compute a unique signature for a set of features
 */
export function computeSignature(features: FailureFeatures): string {
  const parts = [
    features.errorCategory,
    features.normalizedMessage || "no-message",
    features.componentType || "no-component",
    features.spanType,
    features.toolName || "no-tool",
  ];

  return simpleHash(parts.join("|"));
}

// ============================================================================
// Similarity Measurement
// ============================================================================

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate string similarity using token-based Jaccard similarity
 */
function tokenSimilarity(str1: string | undefined, str2: string | undefined): number {
  if (str1 === str2) {
    return 1.0;
  }
  if (!str1 || !str2) {
    return str1 === str2 ? 1.0 : 0.0;
  }

  // Simple token-based similarity for efficiency
  const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

  return jaccardSimilarity(tokens1, tokens2);
}

// ============================================================================
// Embedding-Based Similarity
// ============================================================================

/** Maximum number of texts to send in a single embedding API call */
const MAX_EMBEDDING_BATCH_SIZE = 500;

/**
 * LRU Cache for computed embeddings with configurable max size
 * Prevents memory leaks from unbounded caching
 */
class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  get(text: string): number[] | undefined {
    const value = this.cache.get(text);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(text);
      this.cache.set(text, value);
    }
    return value;
  }

  set(text: string, embedding: number[]): void {
    // Delete if exists (to update position)
    if (this.cache.has(text)) {
      this.cache.delete(text);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(text, embedding);
  }

  has(text: string): boolean {
    return this.cache.has(text);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Per-project embedding caches to prevent data leakage between projects in multi-tenant scenarios
const projectEmbeddingCaches = new Map<string, EmbeddingCache>();
const DEFAULT_PROJECT_ID = "__default__";

/**
 * Get (or create) the embedding cache for a specific project.
 * Each project gets its own isolated LRU cache to prevent cross-tenant data leakage.
 */
export function getEmbeddingCache(projectId: string = DEFAULT_PROJECT_ID): EmbeddingCache {
  let cache = projectEmbeddingCaches.get(projectId);
  if (!cache) {
    cache = new EmbeddingCache(10000);
    projectEmbeddingCaches.set(projectId, cache);
  }
  return cache;
}

/**
 * Clear the embedding cache for a specific project
 */
export function clearEmbeddingCacheForProject(projectId: string): void {
  projectEmbeddingCaches.delete(projectId);
}

/**
 * Compute cosine similarity between two embedding vectors
 * Optimized for normalized vectors (most embedding models return normalized)
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Embedding dimension mismatch: ${vec1.length} vs ${vec2.length}`);
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Use a single loop for better cache locality
  for (let i = 0; i < vec1.length; i++) {
    const a = vec1[i];
    const b = vec2[i];
    dotProduct += a * b;
    norm1 += a * a;
    norm2 += b * b;
  }

  const magnitude = Math.sqrt(norm1 * norm2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Pre-computed embedding index for efficient similarity lookups
 * This avoids O(N²) embedding API calls by batching upfront
 */
export class EmbeddingIndex {
  private embeddings: Map<string, number[]> = new Map();

  /**
   * Build an index from texts using the provided embedding function
   * Batches all unique texts into a single API call
   */
  static async build(
    texts: string[],
    embeddingFn: EmbeddingFunction,
    useCache = true,
    projectId: string = DEFAULT_PROJECT_ID
  ): Promise<EmbeddingIndex> {
    const index = new EmbeddingIndex();
    const cache = useCache ? getEmbeddingCache(projectId) : null;

    // Deduplicate texts (filter out empty and whitespace-only strings)
    const uniqueTexts = [...new Set(texts.filter((t) => t && t.trim().length > 0))];

    if (uniqueTexts.length === 0) {
      return index;
    }

    // Check cache for existing embeddings
    const uncachedTexts: string[] = [];
    for (const text of uniqueTexts) {
      if (cache) {
        const cached = cache.get(text);
        if (cached) {
          index.embeddings.set(text, cached);
          continue;
        }
      }
      uncachedTexts.push(text);
    }

    // Batch compute embeddings for uncached texts (chunked to avoid API limits)
    if (uncachedTexts.length > 0) {
      for (let offset = 0; offset < uncachedTexts.length; offset += MAX_EMBEDDING_BATCH_SIZE) {
        const batch = uncachedTexts.slice(offset, offset + MAX_EMBEDDING_BATCH_SIZE);
        const batchEmbeddings = await embeddingFn(batch);
        for (let i = 0; i < batch.length; i++) {
          const text = batch[i];
          const embedding = batchEmbeddings[i];
          index.embeddings.set(text, embedding);
          if (cache) {
            cache.set(text, embedding);
          }
        }
      }
    }

    return index;
  }

  /**
   * Get similarity between two texts using pre-computed embeddings
   * Returns token-based similarity if either text wasn't indexed
   */
  getSimilarity(text1: string | undefined, text2: string | undefined): number {
    if (text1 === text2) {
      return 1.0;
    }
    if (!text1 || !text2) {
      return text1 === text2 ? 1.0 : 0.0;
    }

    const emb1 = this.embeddings.get(text1);
    const emb2 = this.embeddings.get(text2);

    if (!emb1 || !emb2) {
      // Fall back to token similarity if not in index
      const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
      const tokens2 = new Set(text2.toLowerCase().split(/\s+/));
      return jaccardSimilarity(tokens1, tokens2);
    }

    return cosineSimilarity(emb1, emb2);
  }

  /**
   * Check if a text has an embedding in the index
   */
  has(text: string): boolean {
    return this.embeddings.has(text);
  }

  /**
   * Get the number of indexed texts
   */
  get size(): number {
    return this.embeddings.size;
  }
}

/**
 * Clear all embedding caches (all projects)
 * Useful for testing or when switching embedding models
 */
export function clearEmbeddingCache(): void {
  projectEmbeddingCaches.clear();
}

/**
 * Get the current size of the default embedding cache
 */
export function getEmbeddingCacheSize(): number {
  const cache = projectEmbeddingCaches.get(DEFAULT_PROJECT_ID);
  return cache ? cache.size : 0;
}

/**
 * Weights for feature comparison
 */
const SIMILARITY_WEIGHTS = {
  category: 0.25,
  normalizedMessage: 0.35,
  componentType: 0.15,
  spanType: 0.1,
  toolName: 0.1,
  stackSignature: 0.05,
} as const;

/**
 * Measure similarity between two failure features (synchronous, token-based)
 * Returns a score from 0 (completely different) to 1 (identical)
 */
export function measureSimilarity(
  features1: FailureFeatures,
  features2: FailureFeatures
): number {
  let score = 0;

  // Category match (exact)
  if (features1.errorCategory === features2.errorCategory) {
    score += SIMILARITY_WEIGHTS.category;
  }

  // Normalized message similarity (token-based)
  score +=
    SIMILARITY_WEIGHTS.normalizedMessage *
    tokenSimilarity(features1.normalizedMessage, features2.normalizedMessage);

  // Component type match
  if (features1.componentType === features2.componentType) {
    score += SIMILARITY_WEIGHTS.componentType;
  }

  // Span type match
  if (features1.spanType === features2.spanType) {
    score += SIMILARITY_WEIGHTS.spanType;
  }

  // Tool name match
  if (features1.toolName === features2.toolName) {
    score += SIMILARITY_WEIGHTS.toolName;
  } else if (features1.toolName && features2.toolName) {
    // Partial credit for similar tool names
    score += SIMILARITY_WEIGHTS.toolName * tokenSimilarity(features1.toolName, features2.toolName);
  }

  // Stack signature match
  if (features1.stackSignature && features2.stackSignature) {
    score += SIMILARITY_WEIGHTS.stackSignature * tokenSimilarity(features1.stackSignature, features2.stackSignature);
  } else if (!features1.stackSignature && !features2.stackSignature) {
    score += SIMILARITY_WEIGHTS.stackSignature; // Both missing = match
  }

  return score;
}

/**
 * Measure similarity using embeddings for semantic message comparison
 * Returns a score from 0 (completely different) to 1 (identical)
 *
 * Note: For batch processing, use EmbeddingIndex.build() to pre-compute embeddings
 * and avoid O(N²) API calls. This function is useful for one-off comparisons.
 *
 * @example
 * ```typescript
 * import { pipeline } from '@xenova/transformers';
 *
 * const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 * const embedFn = async (texts) => {
 *   const results = await extractor(texts, { pooling: 'mean', normalize: true });
 *   return results.tolist();
 * };
 *
 * const similarity = await measureSimilarityWithEmbeddings(features1, features2, embedFn);
 * ```
 */
export async function measureSimilarityWithEmbeddings(
  features1: FailureFeatures,
  features2: FailureFeatures,
  embeddingFn: EmbeddingFunction,
  useCache = true
): Promise<number> {
  // Collect texts to embed
  const texts: string[] = [];
  if (features1.normalizedMessage) texts.push(features1.normalizedMessage);
  if (features2.normalizedMessage) texts.push(features2.normalizedMessage);

  // Build a mini embedding index for this comparison
  const embeddingIndex = await EmbeddingIndex.build(texts, embeddingFn, useCache);

  // Use the index-based measurement
  return measureSimilarityWithIndex(features1, features2, embeddingIndex);
}

// ============================================================================
// Clustering
// ============================================================================

/**
 * Find the nearest cluster for a feature set
 */
function findNearestCluster(
  features: FailureFeatures,
  clusters: FailureCluster[],
  threshold: number
): { cluster: FailureCluster; similarity: number } | null {
  let bestCluster: FailureCluster | null = null;
  let bestSimilarity = 0;

  for (const cluster of clusters) {
    const similarity = measureSimilarity(features, cluster.centroidFeatures);
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestCluster = cluster;
    }
  }

  return bestCluster ? { cluster: bestCluster, similarity: bestSimilarity } : null;
}

/**
 * Update cluster centroid after adding a new member
 * For categorical features, uses mode (most common value)
 * For string features, keeps the most representative one
 */
function updateCentroid(cluster: FailureCluster): void {
  const features = cluster.features;
  if (features.length === 0) {
    return;
  }

  // Find mode for each categorical field
  const categoryCounts = new Map<ErrorCategory, number>();
  const componentCounts = new Map<ComponentType | undefined, number>();
  const spanTypeCounts = new Map<SpanType, number>();
  const toolCounts = new Map<string | undefined, number>();

  for (const f of features) {
    categoryCounts.set(f.errorCategory, (categoryCounts.get(f.errorCategory) || 0) + 1);
    componentCounts.set(f.componentType, (componentCounts.get(f.componentType) || 0) + 1);
    spanTypeCounts.set(f.spanType, (spanTypeCounts.get(f.spanType) || 0) + 1);
    toolCounts.set(f.toolName, (toolCounts.get(f.toolName) || 0) + 1);
  }

  const getMode = <T>(counts: Map<T, number>): T => {
    let maxCount = 0;
    let mode: T | undefined;
    for (const [value, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    }
    return mode!;
  };

  // Use the first feature's message as representative (they should be similar)
  cluster.centroidFeatures = {
    errorMessage: features[0].errorMessage,
    normalizedMessage: features[0].normalizedMessage,
    errorCategory: getMode(categoryCounts),
    componentType: getMode(componentCounts),
    spanType: getMode(spanTypeCounts),
    toolName: getMode(toolCounts),
    spanName: features[0].spanName,
    stackSignature: features[0].stackSignature,
  };
}

/**
 * Cluster similar failures together (synchronous, token-based)
 * Uses a simple incremental clustering approach
 */
function clusterFailures(
  failedSpans: SpanWithChildren[],
  config: Required<Omit<PatternDetectorConfig, "embeddingFn" | "similarityMethod" | "cacheEmbeddings">>
): FailureCluster[] {
  const clusters: FailureCluster[] = [];

  for (const span of failedSpans) {
    const features = extractFailureFeatures(span, config);
    const nearest = findNearestCluster(features, clusters, config.similarityThreshold);

    if (nearest) {
      // Add to existing cluster
      nearest.cluster.features.push(features);
      nearest.cluster.spans.push(span);
      updateCentroid(nearest.cluster);
    } else {
      // Create new cluster
      const newCluster: FailureCluster = {
        features: [features],
        spans: [span],
        centroidFeatures: features,
      };
      clusters.push(newCluster);
    }
  }

  return clusters;
}

/**
 * Measure similarity using a pre-built embedding index
 * Much faster than per-comparison embedding calls
 */
function measureSimilarityWithIndex(
  features1: FailureFeatures,
  features2: FailureFeatures,
  embeddingIndex: EmbeddingIndex
): number {
  let score = 0;

  // Category match (exact)
  if (features1.errorCategory === features2.errorCategory) {
    score += SIMILARITY_WEIGHTS.category;
  }

  // Normalized message similarity (embedding-based)
  score +=
    SIMILARITY_WEIGHTS.normalizedMessage *
    embeddingIndex.getSimilarity(features1.normalizedMessage, features2.normalizedMessage);

  // Component type match (exact)
  if (features1.componentType === features2.componentType) {
    score += SIMILARITY_WEIGHTS.componentType;
  }

  // Span type match (exact)
  if (features1.spanType === features2.spanType) {
    score += SIMILARITY_WEIGHTS.spanType;
  }

  // Tool name match - use token similarity
  if (features1.toolName === features2.toolName) {
    score += SIMILARITY_WEIGHTS.toolName;
  } else if (features1.toolName && features2.toolName) {
    score += SIMILARITY_WEIGHTS.toolName * tokenSimilarity(features1.toolName, features2.toolName);
  }

  // Stack signature match - use token similarity
  if (features1.stackSignature && features2.stackSignature) {
    score += SIMILARITY_WEIGHTS.stackSignature * tokenSimilarity(features1.stackSignature, features2.stackSignature);
  } else if (!features1.stackSignature && !features2.stackSignature) {
    score += SIMILARITY_WEIGHTS.stackSignature;
  }

  return score;
}

/**
 * Find nearest cluster using pre-computed embedding index
 */
function findNearestClusterWithIndex(
  features: FailureFeatures,
  clusters: FailureCluster[],
  threshold: number,
  embeddingIndex: EmbeddingIndex
): { cluster: FailureCluster; similarity: number } | null {
  let bestCluster: FailureCluster | null = null;
  let bestSimilarity = 0;

  for (const cluster of clusters) {
    const similarity = measureSimilarityWithIndex(features, cluster.centroidFeatures, embeddingIndex);
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestCluster = cluster;
    }
  }

  return bestCluster ? { cluster: bestCluster, similarity: bestSimilarity } : null;
}

/**
 * Cluster similar failures using embedding-based similarity (async)
 *
 * Optimized to batch compute all embeddings upfront, then use
 * cosine similarity for O(1) comparisons. This avoids O(N²)
 * embedding API calls.
 */
async function clusterFailuresWithEmbeddings(
  failedSpans: SpanWithChildren[],
  config: ResolvedPatternDetectorConfig,
  embeddingFn: EmbeddingFunction
): Promise<FailureCluster[]> {
  // Extract all features first
  const allFeatures: FailureFeatures[] = failedSpans.map((span) =>
    extractFailureFeatures(span, config)
  );

  // Collect all unique normalized messages for batch embedding
  const allMessages = allFeatures
    .map((f) => f.normalizedMessage)
    .filter((m): m is string => m !== undefined && m.length > 0);

  // Build embedding index in a single batch call
  const embeddingIndex = await EmbeddingIndex.build(allMessages, embeddingFn, config.cacheEmbeddings);

  // Now cluster using the pre-computed index (no more async calls!)
  const clusters: FailureCluster[] = [];

  for (let i = 0; i < failedSpans.length; i++) {
    const span = failedSpans[i];
    const features = allFeatures[i];

    const nearest = findNearestClusterWithIndex(
      features,
      clusters,
      config.similarityThreshold,
      embeddingIndex
    );

    if (nearest) {
      nearest.cluster.features.push(features);
      nearest.cluster.spans.push(span);
      updateCentroid(nearest.cluster);
    } else {
      const newCluster: FailureCluster = {
        features: [features],
        spans: [span],
        centroidFeatures: features,
      };
      clusters.push(newCluster);
    }
  }

  return clusters;
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Generate a human-readable pattern name
 */
function generatePatternName(pattern: Omit<FailurePattern, "name">): string {
  const parts: string[] = [];

  // Start with category
  parts.push(pattern.category.replace(/_/g, " "));

  // Add component context if available
  if (pattern.componentTypes.length === 1) {
    parts.push(`in ${pattern.componentTypes[0]}`);
  }

  // Add tool context if specific
  if (pattern.toolNames.length === 1) {
    parts.push(`(${pattern.toolNames[0]})`);
  }

  return parts.join(" ");
}

/**
 * Convert a cluster to a failure pattern
 */
function clusterToPattern(
  cluster: FailureCluster,
  config: ResolvedPatternDetectorConfig
): FailurePattern {
  const centroid = cluster.centroidFeatures;
  const spans = cluster.spans;

  // Collect unique values across cluster
  const componentTypes = new Set<ComponentType>();
  const toolNames = new Set<string>();
  const spanTypes = new Set<SpanType>();

  for (const f of cluster.features) {
    if (f.componentType) {
      componentTypes.add(f.componentType);
    }
    if (f.toolName) {
      toolNames.add(f.toolName);
    }
    spanTypes.add(f.spanType);
  }

  // Calculate confidence based on cluster cohesion
  let totalSimilarity = 0;
  for (const f of cluster.features) {
    totalSimilarity += measureSimilarity(f, centroid);
  }
  const avgSimilarity = cluster.features.length > 0
    ? totalSimilarity / cluster.features.length
    : 1.0;

  // Get timestamps
  const timestamps = spans.map((s) => new Date(s.timestamp));
  const firstSeen = new Date(Math.min(...timestamps.map((t) => t.getTime())));
  const lastSeen = new Date(Math.max(...timestamps.map((t) => t.getTime())));

  // Select example span IDs
  const exampleSpanIds = spans
    .slice(0, config.maxExamples)
    .map((s) => s.spanId);

  const basePattern = {
    signature: computeSignature(centroid),
    messagePattern: centroid.normalizedMessage || centroid.errorMessage || "unknown",
    category: centroid.errorCategory,
    componentTypes: [...componentTypes],
    toolNames: [...toolNames],
    spanTypes: [...spanTypes],
    frequency: cluster.spans.length,
    firstSeen,
    lastSeen,
    exampleSpanIds,
    confidence: avgSimilarity,
  };

  return {
    ...basePattern,
    name: generatePatternName(basePattern),
  };
}

/**
 * Flatten a span tree into a flat array
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

  return result;
}

/**
 * Find all error spans in a span tree
 */
function findErrorSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
  return flattenSpans(spans).filter((span) => span.status === "error");
}

/**
 * Generate a summary of the pattern analysis
 */
function generateSummary(result: Omit<PatternAnalysisResult, "summary">): string {
  if (result.totalFailures === 0) {
    return "No failures detected";
  }

  if (result.patterns.length === 0) {
    return `${result.totalFailures} failure(s) detected, but no recurring patterns found`;
  }

  const patternSummary = result.patterns
    .slice(0, 3)
    .map((p) => `${p.name} (${p.frequency}x)`)
    .join(", ");

  const topPatternPct = result.topPattern
    ? ((result.topPattern.frequency / result.totalFailures) * 100).toFixed(0)
    : 0;

  return `${result.uniquePatterns} pattern(s) detected in ${result.totalFailures} failures. ` +
    `Top: ${patternSummary}. ` +
    `Most common pattern accounts for ${topPatternPct}% of failures.`;
}

/**
 * Resolve configuration with defaults
 */
function resolveConfig(config?: PatternDetectorConfig): ResolvedPatternDetectorConfig {
  return {
    minFrequency: config?.minFrequency ?? 2,
    similarityThreshold: config?.similarityThreshold ?? 0.5,
    maxPatterns: config?.maxPatterns ?? 10,
    maxExamples: config?.maxExamples ?? 5,
    customCategories: config?.customCategories ?? [],
    similarityMethod: config?.similarityMethod ?? "token",
    embeddingFn: config?.embeddingFn,
    cacheEmbeddings: config?.cacheEmbeddings ?? true,
  };
}

/**
 * Build pattern analysis result from clusters
 */
function buildPatternResult(
  clusters: FailureCluster[],
  errorSpans: SpanWithChildren[],
  config: ResolvedPatternDetectorConfig
): PatternAnalysisResult {
  // Convert clusters to patterns (filter by min frequency)
  const patterns = clusters
    .filter((c) => c.spans.length >= config.minFrequency)
    .map((c) => clusterToPattern(c, config))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, config.maxPatterns);

  // Count unclustered spans (in clusters below minFrequency)
  const clusteredCount = patterns.reduce((sum, p) => sum + p.frequency, 0);
  const unclusteredCount = errorSpans.length - clusteredCount;

  const baseResult = {
    patterns,
    totalFailures: errorSpans.length,
    uniquePatterns: patterns.length,
    topPattern: patterns[0] || null,
    unclusteredCount,
  };

  return {
    ...baseResult,
    summary: generateSummary(baseResult),
  };
}

/**
 * Detect failure patterns in spans (synchronous, token-based similarity)
 *
 * For semantic similarity using embeddings, use `detectPatternsAsync` instead.
 *
 * @param input - Either an EvalContext or an array of SpanWithChildren
 * @param config - Optional configuration for pattern detection
 * @returns Pattern analysis result with detected patterns
 *
 * @example
 * ```typescript
 * // From eval context
 * const result = detectPatterns(evalContext);
 *
 * // From raw spans with custom config
 * const result = detectPatterns(spans, {
 *   minFrequency: 3,
 *   similarityThreshold: 0.6,
 * });
 *
 * console.log(result.patterns); // Array of FailurePattern
 * console.log(result.topPattern); // Most frequent pattern
 * ```
 */
export function detectPatterns(
  input: EvalContext | SpanWithChildren[],
  config?: PatternDetectorConfig
): PatternAnalysisResult {
  const resolvedConfig = resolveConfig(config);

  // Warn if embedding similarity is configured but sync function is called
  if (resolvedConfig.similarityMethod === "embedding") {
    throw new Error(
      "Embedding-based similarity requires async. Use detectPatternsAsync() instead, " +
      "or set similarityMethod: 'token' for synchronous operation."
    );
  }

  // Extract spans from input
  const spans = Array.isArray(input) ? input : input.trace.spans;

  // Find all error spans
  const errorSpans = findErrorSpans(spans);

  if (errorSpans.length === 0) {
    return {
      patterns: [],
      totalFailures: 0,
      uniquePatterns: 0,
      topPattern: null,
      summary: "No failures detected",
      unclusteredCount: 0,
    };
  }

  // Cluster similar failures (token-based)
  const clusters = clusterFailures(errorSpans, resolvedConfig);

  return buildPatternResult(clusters, errorSpans, resolvedConfig);
}

/**
 * Detect failure patterns using embedding-based semantic similarity (async)
 *
 * This version uses embeddings for more accurate semantic matching of error messages.
 * Errors like "Connection refused" and "Cannot reach server" will be correctly
 * identified as similar, even though they share no tokens.
 *
 * @param input - Either an EvalContext or an array of SpanWithChildren
 * @param config - Configuration with embedding function
 * @returns Promise resolving to pattern analysis result
 *
 * @example
 * ```typescript
 * // Using @xenova/transformers (runs locally, ~10ms per comparison)
 * import { pipeline } from '@xenova/transformers';
 *
 * const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 * const embedFn = async (texts) => {
 *   const results = await extractor(texts, { pooling: 'mean', normalize: true });
 *   return results.tolist();
 * };
 *
 * const result = await detectPatternsAsync(evalContext, {
 *   similarityMethod: "embedding",
 *   embeddingFn: embedFn,
 * });
 *
 * // Using OpenAI embeddings API
 * const embedFn = async (texts) => {
 *   const response = await openai.embeddings.create({
 *     model: 'text-embedding-3-small',
 *     input: texts,
 *   });
 *   return response.data.map(d => d.embedding);
 * };
 *
 * const result = await detectPatternsAsync(evalContext, {
 *   similarityMethod: "embedding",
 *   embeddingFn: embedFn,
 *   cacheEmbeddings: true, // Cache to avoid redundant API calls
 * });
 * ```
 */
export async function detectPatternsAsync(
  input: EvalContext | SpanWithChildren[],
  config?: PatternDetectorConfig
): Promise<PatternAnalysisResult> {
  const resolvedConfig = resolveConfig(config);

  // Extract spans from input
  const spans = Array.isArray(input) ? input : input.trace.spans;

  // Find all error spans
  const errorSpans = findErrorSpans(spans);

  if (errorSpans.length === 0) {
    return {
      patterns: [],
      totalFailures: 0,
      uniquePatterns: 0,
      topPattern: null,
      summary: "No failures detected",
      unclusteredCount: 0,
    };
  }

  // Use embedding-based clustering if configured
  let clusters: FailureCluster[];

  if (resolvedConfig.similarityMethod === "embedding" && resolvedConfig.embeddingFn) {
    clusters = await clusterFailuresWithEmbeddings(
      errorSpans,
      resolvedConfig,
      resolvedConfig.embeddingFn
    );
  } else {
    // Fall back to token-based clustering
    clusters = clusterFailures(errorSpans, resolvedConfig);
  }

  return buildPatternResult(clusters, errorSpans, resolvedConfig);
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a span matches a known pattern
 *
 * @param span - Span to check
 * @param pattern - Pattern to match against
 * @param threshold - Similarity threshold (0-1). Default: 0.8
 * @returns true if the span matches the pattern
 */
export function matchesPattern(
  span: SpanWithChildren,
  pattern: FailurePattern,
  threshold = 0.8
): boolean {
  if (span.status !== "error") {
    return false;
  }

  const features = extractFailureFeatures(span);

  // Quick checks first
  if (features.errorCategory !== pattern.category) {
    return false;
  }

  // Create pattern features for comparison
  const patternFeatures: FailureFeatures = {
    errorMessage: pattern.messagePattern,
    normalizedMessage: pattern.messagePattern,
    errorCategory: pattern.category,
    componentType: pattern.componentTypes[0],
    spanType: pattern.spanTypes[0] || "span",
    toolName: pattern.toolNames[0],
    spanName: "",
    stackSignature: undefined,
  };

  const similarity = measureSimilarity(features, patternFeatures);
  return similarity >= threshold;
}

/**
 * Find which known patterns match a span
 *
 * @param span - Span to check
 * @param patterns - Array of known patterns
 * @param threshold - Similarity threshold (0-1). Default: 0.8
 * @returns Matching patterns with their similarity scores
 */
export function findMatchingPatterns(
  span: SpanWithChildren,
  patterns: FailurePattern[],
  threshold = 0.8
): Array<{ pattern: FailurePattern; similarity: number }> {
  if (span.status !== "error") {
    return [];
  }

  const features = extractFailureFeatures(span);
  const matches: Array<{ pattern: FailurePattern; similarity: number }> = [];

  for (const pattern of patterns) {
    const patternFeatures: FailureFeatures = {
      errorMessage: pattern.messagePattern,
      normalizedMessage: pattern.messagePattern,
      errorCategory: pattern.category,
      componentType: pattern.componentTypes[0],
      spanType: pattern.spanTypes[0] || "span",
      toolName: pattern.toolNames[0],
      spanName: "",
      stackSignature: undefined,
    };

    const similarity = measureSimilarity(features, patternFeatures);
    if (similarity >= threshold) {
      matches.push({ pattern, similarity });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}

// ============================================================================
// Scorers
// ============================================================================

/**
 * Configuration for pattern-based scorers
 */
export interface PatternScorerConfig extends PatternDetectorConfig {
  /** Custom name for the scorer */
  name?: string;
  /** Description of the scorer */
  description?: string;
}

/**
 * Pattern diversity scorer
 *
 * Scores based on how diverse the failure patterns are.
 * High score = failures are varied (good - means different issues)
 * Low score = failures are repetitive (bad - same issue recurring)
 *
 * @example
 * ```typescript
 * const scorer = patternDiversityScorer();
 * const result = scorer.evaluate(context);
 * // result.value: 0.0 (all same pattern) to 1.0 (all unique)
 * ```
 */
export function patternDiversityScorer(config?: PatternScorerConfig): Scorer {
  const {
    name = "pattern_diversity",
    description = "Measures diversity of failure patterns (high = varied failures, low = repetitive)",
    ...detectorConfig
  } = config || {};

  return defineScorer({
    name,
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = detectPatterns(context, detectorConfig);

      if (analysis.totalFailures === 0) {
        return {
          value: 1.0,
          reason: "No failures detected",
        };
      }

      if (analysis.uniquePatterns === 0) {
        return {
          value: 1.0,
          reason: "No recurring patterns (all failures unique)",
        };
      }

      // Diversity = unique patterns / total failures
      // Capped at 1.0 (if more unique than recurring)
      const diversity = Math.min(1.0, analysis.uniquePatterns / analysis.totalFailures);

      return {
        value: diversity,
        reason: analysis.summary,
      };
    },
  });
}

/**
 * Pattern concentration scorer
 *
 * Scores based on how concentrated failures are in the top pattern.
 * High score = failures spread across patterns (good - no single dominant issue)
 * Low score = failures concentrated (bad - major recurring issue)
 *
 * @example
 * ```typescript
 * const scorer = patternConcentrationScorer();
 * const result = scorer.evaluate(context);
 * // result.value: 0.0 (all same pattern) to 1.0 (evenly distributed)
 * ```
 */
export function patternConcentrationScorer(config?: PatternScorerConfig): Scorer {
  const {
    name = "pattern_concentration",
    description = "Measures concentration in top failure pattern (high = distributed, low = concentrated)",
    ...detectorConfig
  } = config || {};

  return defineScorer({
    name,
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = detectPatterns(context, detectorConfig);

      if (analysis.totalFailures === 0) {
        return {
          value: 1.0,
          reason: "No failures detected",
        };
      }

      if (!analysis.topPattern) {
        return {
          value: 1.0,
          reason: "No recurring patterns found",
        };
      }

      // Concentration = 1 - (top pattern frequency / total failures)
      const topFrequency = analysis.topPattern.frequency;
      const concentration = 1 - (topFrequency / analysis.totalFailures);

      return {
        value: concentration,
        reason: `Top pattern "${analysis.topPattern.name}" accounts for ${topFrequency}/${analysis.totalFailures} failures`,
      };
    },
  });
}

/**
 * New pattern scorer
 *
 * Scores based on whether failures match known patterns.
 * Useful for detecting novel/unknown failure modes.
 * High score = failures match known patterns (good - expected issues)
 * Low score = failures are novel (potentially bad - new issues)
 *
 * @param knownPatterns - Array of known patterns to match against
 * @param config - Optional configuration
 *
 * @example
 * ```typescript
 * const knownPatterns = [pattern1, pattern2];
 * const scorer = novelPatternScorer(knownPatterns);
 * const result = scorer.evaluate(context);
 * // result.value: 0.0 (all novel) to 1.0 (all known)
 * ```
 */
export function novelPatternScorer(
  knownPatterns: FailurePattern[],
  config?: PatternScorerConfig & { matchThreshold?: number }
): Scorer {
  const {
    name = "novel_patterns",
    description = "Detects novel failure patterns not matching known patterns",
    matchThreshold = 0.8,
    ...detectorConfig
  } = config || {};

  return defineScorer({
    name,
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const spans = context.trace.spans;
      const errorSpans = findErrorSpans(spans);

      if (errorSpans.length === 0) {
        return {
          value: 1.0,
          reason: "No failures detected",
        };
      }

      let matchedCount = 0;
      const novelErrors: string[] = [];

      for (const span of errorSpans) {
        const matches = findMatchingPatterns(span, knownPatterns, matchThreshold);
        if (matches.length > 0) {
          matchedCount++;
        } else {
          const features = extractFailureFeatures(span, detectorConfig);
          novelErrors.push(features.normalizedMessage || span.name);
        }
      }

      const knownRatio = matchedCount / errorSpans.length;
      const novelCount = errorSpans.length - matchedCount;

      const reason = novelCount === 0
        ? "All failures match known patterns"
        : `${novelCount} novel failure(s) detected: ${novelErrors.slice(0, 3).join(", ")}${novelErrors.length > 3 ? "..." : ""}`;

      return {
        value: knownRatio,
        reason,
      };
    },
  });
}

/**
 * Detailed pattern analysis scorer
 *
 * Returns the full pattern analysis as JSON in the reason field.
 * Useful for debugging and detailed reports.
 */
export function patternAnalysisDetailedScorer(config?: PatternScorerConfig): Scorer {
  const {
    name = "pattern_analysis_detailed",
    description = "Full pattern analysis with detailed breakdown",
    ...detectorConfig
  } = config || {};

  return defineScorer({
    name,
    description,
    dataType: "numeric",
    evaluate: (context: EvalContext): ScoreResult => {
      const analysis = detectPatterns(context, detectorConfig);

      // Score based on error rate (inverse)
      const flatSpans = flattenSpans(context.trace.spans);
      const errorRate = flatSpans.length > 0
        ? analysis.totalFailures / flatSpans.length
        : 0;

      return {
        value: 1 - errorRate,
        reason: JSON.stringify(analysis, null, 2),
      };
    },
  });
}
