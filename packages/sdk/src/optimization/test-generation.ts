/**
 * Test Generation
 *
 * Automatically generates test cases from failed traces. Extracts failure patterns,
 * synthesizes adversarial variants, deduplicates against existing suites, and
 * prioritizes by composite scoring.
 */

import type { SpanWithChildren } from "@neon/shared";
import type { ErrorCategory, EmbeddingFunction } from "../analysis/pattern-detector.js";
import {
  extractFailureFeatures,
  EmbeddingIndex,
} from "../analysis/pattern-detector.js";
import { generateRewardSignals } from "./signals.js";
import type { SignalContext } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Scorer configuration for a generated test case
 */
export interface ScorerConfig {
  name: string;
  type: "rule" | "llm_judge";
  config?: Record<string, unknown>;
}

/**
 * A trace that failed, used as input for test generation
 */
export interface FailedTrace {
  traceId: string;
  spans: SpanWithChildren[];
  failureReason?: string;
  errorCategory?: ErrorCategory;
  score?: number;
}

/**
 * Lineage tracking for generated test cases
 */
export interface TestCaseLineage {
  sourceTraceIds: string[];
  sourcePattern?: string;
  generationMethod: "extraction" | "synthesis" | "adversarial";
  generatedAt: Date;
}

/**
 * A test case generated from failure analysis
 */
export interface GeneratedTestCase {
  id: string;
  input: Record<string, unknown>;
  expectedOutput?: string;
  scorers: ScorerConfig[];
  priority: number;
  lineage: TestCaseLineage;
  status: "pending_review" | "approved" | "rejected";
  similarityToExisting: number;
}

/**
 * Configuration for test generation
 */
export interface TestGenerationConfig {
  /** Embedding function for semantic deduplication */
  embeddingFn?: EmbeddingFunction;
  /** Maximum number of test cases to generate (default: 20) */
  maxTestCases?: number;
  /** Similarity threshold for deduplication (default: 0.85) */
  deduplicationThreshold?: number;
  /** LLM generator for synthesis/adversarial variants */
  llmGenerator?: (prompt: string) => Promise<string>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique test case ID
 */
function generateTestCaseId(): string {
  return `tc_${crypto.randomUUID()}`;
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
 * Infer scorers from a failed span
 */
function inferScorers(span: SpanWithChildren): ScorerConfig[] {
  const scorers: ScorerConfig[] = [];

  if (span.status === "error") {
    scorers.push({
      name: "error_detection",
      type: "rule",
      config: { expectError: false },
    });
  }

  if (span.spanType === "tool") {
    scorers.push({
      name: "tool_selection",
      type: "rule",
      config: { expectedTool: span.toolName },
    });
  }

  if (span.spanType === "generation") {
    scorers.push({
      name: "output_quality",
      type: "llm_judge",
    });
  }

  if (scorers.length === 0) {
    scorers.push({ name: "success", type: "rule" });
  }

  return scorers;
}

/**
 * Compute severity score for a failure (0-1)
 */
function computeSeverity(trace: FailedTrace): number {
  const flat = flattenSpans(trace.spans);
  const errorCount = flat.filter(s => s.status === "error").length;
  const errorRate = flat.length > 0 ? errorCount / flat.length : 0;

  // Low scores indicate worse failures
  const scoreWeight = trace.score !== undefined ? 1 - Math.min(1, Math.max(0, trace.score)) : 0.5;

  return errorRate * 0.5 + scoreWeight * 0.5;
}

/**
 * Compute a text fingerprint for a test case for deduplication
 */
function testCaseFingerprint(tc: GeneratedTestCase): string {
  return JSON.stringify(tc.input) + (tc.expectedOutput || "");
}

// ============================================================================
// Pipeline Steps
// ============================================================================

/**
 * Step 1: Extract test cases from failed traces
 */
function extractTestCases(failures: FailedTrace[]): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];

  for (const failure of failures) {
    const flat = flattenSpans(failure.spans);
    const errorSpans = flat.filter(s => s.status === "error");

    // Extract from the first error span (or root if no error spans)
    const targetSpan = errorSpans[0] || flat[0];
    if (!targetSpan) continue;

    const input: Record<string, unknown> = {};

    if (targetSpan.spanType === "tool") {
      input.toolName = targetSpan.toolName;
      if (targetSpan.toolInput) {
        try {
          input.toolInput = JSON.parse(targetSpan.toolInput);
        } catch {
          input.toolInput = targetSpan.toolInput;
        }
      }
    } else if (targetSpan.input) {
      input.query = targetSpan.input;
    } else {
      input.spanName = targetSpan.name;
      input.spanType = targetSpan.spanType;
    }

    if (failure.failureReason) {
      input.failureContext = failure.failureReason;
    }

    cases.push({
      id: generateTestCaseId(),
      input,
      expectedOutput: targetSpan.output || undefined,
      scorers: inferScorers(targetSpan),
      priority: 0, // computed later
      lineage: {
        sourceTraceIds: [failure.traceId],
        sourcePattern: failure.errorCategory,
        generationMethod: "extraction",
        generatedAt: new Date(),
      },
      status: "pending_review",
      similarityToExisting: 0,
    });
  }

  return cases;
}

/**
 * Step 2: Synthesize adversarial variants using LLM
 */
async function synthesizeVariants(
  extracted: GeneratedTestCase[],
  llmGenerator: (prompt: string) => Promise<string>
): Promise<GeneratedTestCase[]> {
  const variants: GeneratedTestCase[] = [];

  for (const base of extracted) {
    const prompt = `Given this failing test case input:
${JSON.stringify(base.input, null, 2)}

Generate a JSON object with a similar but slightly different adversarial variant that would test the same failure mode.
Return ONLY valid JSON, no explanation.`;

    try {
      const response = await llmGenerator(prompt);
      const parsed = JSON.parse(response);

      variants.push({
        id: generateTestCaseId(),
        input: typeof parsed === "object" && parsed !== null ? parsed : { generated: parsed },
        expectedOutput: base.expectedOutput,
        scorers: base.scorers,
        priority: 0,
        lineage: {
          sourceTraceIds: base.lineage.sourceTraceIds,
          sourcePattern: base.lineage.sourcePattern,
          generationMethod: "adversarial",
          generatedAt: new Date(),
        },
        status: "pending_review",
        similarityToExisting: 0,
      });
    } catch {
      // Skip if LLM output isn't valid JSON
    }
  }

  return variants;
}

/**
 * Step 3: Deduplicate test cases against existing suite
 */
async function deduplicateTestCases(
  candidates: GeneratedTestCase[],
  existingSuite: GeneratedTestCase[],
  config: TestGenerationConfig
): Promise<GeneratedTestCase[]> {
  const threshold = config.deduplicationThreshold ?? 0.85;

  if (existingSuite.length === 0) {
    return candidates;
  }

  // Build fingerprints for all cases
  const existingFingerprints = existingSuite.map(testCaseFingerprint);
  const candidateFingerprints = candidates.map(testCaseFingerprint);

  if (config.embeddingFn) {
    // Use embedding-based deduplication
    const allTexts = [...existingFingerprints, ...candidateFingerprints];
    const index = await EmbeddingIndex.build(allTexts, config.embeddingFn);

    return candidates.filter((candidate, i) => {
      const candidateFp = candidateFingerprints[i];
      let maxSimilarity = 0;

      for (const existingFp of existingFingerprints) {
        const sim = index.getSimilarity(candidateFp, existingFp);
        if (sim > maxSimilarity) maxSimilarity = sim;
      }

      candidate.similarityToExisting = maxSimilarity;
      return maxSimilarity < threshold;
    });
  }

  // Token-based deduplication fallback
  return candidates.filter((candidate, i) => {
    const candidateTokens = new Set(candidateFingerprints[i].toLowerCase().split(/\s+/));
    let maxSimilarity = 0;

    for (const existingFp of existingFingerprints) {
      const existingTokens = new Set(existingFp.toLowerCase().split(/\s+/));
      const intersection = new Set([...candidateTokens].filter(t => existingTokens.has(t)));
      const union = new Set([...candidateTokens, ...existingTokens]);
      const sim = union.size > 0 ? intersection.size / union.size : 0;
      if (sim > maxSimilarity) maxSimilarity = sim;
    }

    candidate.similarityToExisting = maxSimilarity;
    return maxSimilarity < threshold;
  });
}

/**
 * Step 4: Prioritize test cases with composite scoring
 *
 * Weights: frequency 30% + severity 25% + novelty 25% + coverage 20%
 */
function prioritizeTestCases(
  cases: GeneratedTestCase[],
  failures: FailedTrace[]
): GeneratedTestCase[] {
  // Build frequency map: how many traces share each pattern
  const patternFrequency = new Map<string, number>();
  for (const failure of failures) {
    const key = failure.errorCategory || "unknown";
    patternFrequency.set(key, (patternFrequency.get(key) || 0) + 1);
  }
  const maxFrequency = Math.max(1, ...patternFrequency.values());

  // Build severity map per trace
  const severityByTrace = new Map<string, number>();
  for (const failure of failures) {
    severityByTrace.set(failure.traceId, computeSeverity(failure));
  }

  // Track generation methods seen for coverage
  const methodCounts = new Map<string, number>();
  for (const tc of cases) {
    const method = tc.lineage.generationMethod;
    methodCounts.set(method, (methodCounts.get(method) || 0) + 1);
  }
  const maxMethodCount = Math.max(1, ...methodCounts.values());

  for (const tc of cases) {
    // Frequency (30%): how common is this failure pattern
    const pattern = tc.lineage.sourcePattern || "unknown";
    const frequencyScore = (patternFrequency.get(pattern) || 1) / maxFrequency;

    // Severity (25%): how severe is the failure
    const traceId = tc.lineage.sourceTraceIds[0];
    const severityScore = traceId ? (severityByTrace.get(traceId) || 0.5) : 0.5;

    // Novelty (25%): inverse of similarity to existing
    const noveltyScore = 1 - tc.similarityToExisting;

    // Coverage (20%): favor underrepresented generation methods
    const method = tc.lineage.generationMethod;
    const coverageScore = 1 - ((methodCounts.get(method) || 1) / maxMethodCount);

    tc.priority =
      frequencyScore * 0.3 +
      severityScore * 0.25 +
      noveltyScore * 0.25 +
      coverageScore * 0.2;
  }

  return cases.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate test cases from failed traces
 *
 * Pipeline:
 * 1. Extract — Pull input/expected output from failed trace spans
 * 2. Synthesize — If llmGenerator provided, create adversarial variants
 * 3. Deduplicate — Semantic similarity check against existing suite (threshold: 0.85)
 * 4. Prioritize — Rank by composite: frequency (30%) + severity (25%) + novelty (25%) + coverage gap (20%)
 * 5. Lineage — Track sourceTraceId, sourcePattern, generationMethod, timestamp
 *
 * @example
 * ```typescript
 * const testCases = await generateTestCases(failedTraces, existingSuite, {
 *   maxTestCases: 10,
 *   deduplicationThreshold: 0.85,
 *   llmGenerator: async (prompt) => llm.generate(prompt),
 * });
 * ```
 */
export async function generateTestCases(
  failures: FailedTrace[],
  existingSuite?: GeneratedTestCase[],
  config?: TestGenerationConfig
): Promise<GeneratedTestCase[]> {
  const resolvedConfig: TestGenerationConfig = {
    maxTestCases: config?.maxTestCases ?? 20,
    deduplicationThreshold: config?.deduplicationThreshold ?? 0.85,
    embeddingFn: config?.embeddingFn,
    llmGenerator: config?.llmGenerator,
  };

  if (failures.length === 0) {
    return [];
  }

  // Step 1: Extract test cases from failures
  let candidates = extractTestCases(failures);

  // Step 2: Synthesize adversarial variants (if LLM available)
  if (resolvedConfig.llmGenerator) {
    const variants = await synthesizeVariants(candidates, resolvedConfig.llmGenerator);
    candidates = [...candidates, ...variants];
  }

  // Step 3: Deduplicate against existing suite
  candidates = await deduplicateTestCases(
    candidates,
    existingSuite || [],
    resolvedConfig
  );

  // Step 4: Prioritize
  candidates = prioritizeTestCases(candidates, failures);

  // Step 5: Trim to max
  return candidates.slice(0, resolvedConfig.maxTestCases);
}
