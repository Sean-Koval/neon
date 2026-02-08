/**
 * Root Cause Synthesizer
 *
 * Composes three existing analyzers (causal, correlation, pattern-detector)
 * into ranked RCA hypotheses with evidence chains and remediation suggestions.
 *
 * Pipeline:
 * 1. Run causal analysis for causal DAG
 * 2. Run correlation analysis for cross-trace correlations (if configured)
 * 3. Run pattern detection for failure patterns
 * 4. Build evidence chains linking spans → patterns → correlations
 * 5. Rank by composite statistical confidence
 * 6. Deduplicate overlapping hypotheses
 * 7. Optional LLM summarization
 *
 * @example
 * ```typescript
 * import { synthesizeRootCause } from "@neon/sdk/analysis";
 *
 * const result = await synthesizeRootCause(evalContext, {
 *   maxHypotheses: 5,
 *   minConfidence: 0.3,
 * });
 *
 * for (const hypothesis of result.hypotheses) {
 *   console.log(`[${hypothesis.rank}] ${hypothesis.summary} (${hypothesis.confidence})`);
 * }
 * ```
 */

import type { EvalContext } from "../scorers/base.js";
import {
  analyzeCausality,
  type CausalAnalysisResult,
  type CausalNode,
} from "../scorers/causal.js";
import {
  type CorrelationAnalyzer,
  type TimeWindow,
  type TimeWindowAnalysis,
  type PatternCorrelation,
  type SystemicIssue,
} from "./correlation.js";
import {
  detectPatternsAsync,
  categorizeError,
  type PatternAnalysisResult,
  type FailurePattern,
} from "./pattern-detector.js";

// ============================================================================
// Types
// ============================================================================

/**
 * A link in an evidence chain connecting spans, patterns, and correlations
 */
export interface EvidenceLink {
  /** Type of relationship */
  type: "caused" | "correlated_with" | "matches_pattern" | "similar_to";
  /** Source span ID */
  sourceSpanId: string;
  /** Target span ID (optional for pattern matches) */
  targetSpanId?: string;
  /** Human-readable description of the link */
  description: string;
  /** Strength of the link (0-1) */
  strength: number;
}

/**
 * A suggested remediation action based on evidence
 */
export interface RemediationSuggestion {
  /** Short action title */
  action: string;
  /** Detailed description of what to do */
  description: string;
  /** Confidence in this suggestion (0-1) */
  confidence: number;
  /** What this suggestion is based on */
  basedOn: "historical_resolution" | "pattern_match" | "best_practice";
}

/**
 * A root cause analysis hypothesis with ranked confidence
 */
export interface RCAHypothesis {
  /** Unique identifier */
  id: string;
  /** Rank (1 = highest confidence) */
  rank: number;
  /** Statistical confidence (NOT LLM-based) */
  confidence: number;
  /** Category of hypothesis */
  category: "root_cause" | "contributing_factor" | "systemic_issue";
  /** Human-readable summary */
  summary: string;
  /** Chain of evidence supporting this hypothesis */
  evidenceChain: EvidenceLink[];
  /** Span IDs affected by this root cause */
  affectedSpans: string[];
  /** Associated failure pattern, if any */
  pattern?: FailurePattern;
  /** Associated correlation, if any */
  correlation?: PatternCorrelation;
  /** Suggested remediation */
  remediation?: RemediationSuggestion;
  /** Statistical basis for confidence score */
  statisticalBasis: {
    method: "causal_dag" | "phi_coefficient" | "pattern_clustering";
    strength: number;
    sampleSize: number;
  };
}

/**
 * Configuration for the root cause synthesizer
 */
export interface RCASynthesizerConfig {
  /** Enable LLM-based summarization of evidence. Default: false */
  enableLLMSummarization?: boolean;
  /** Custom LLM summarizer function */
  llmSummarizer?: (evidence: EvidenceLink[]) => Promise<string>;
  /** Maximum hypotheses to return. Default: 10 */
  maxHypotheses?: number;
  /** Minimum confidence threshold. Default: 0.3 */
  minConfidence?: number;
  /** Correlation analyzer for cross-trace analysis */
  correlationAnalyzer?: CorrelationAnalyzer;
  /** Time window for correlation analysis */
  timeWindow?: TimeWindow;
  /** Project ID for correlation analysis */
  projectId?: string;
}

/**
 * Result of root cause synthesis
 */
export interface RCASynthesisResult {
  /** Ranked hypotheses */
  hypotheses: RCAHypothesis[];
  /** Causal analysis result */
  causalAnalysis: CausalAnalysisResult;
  /** Pattern analysis result */
  patternAnalysis: PatternAnalysisResult;
  /** Correlation analysis result (if available) */
  correlationAnalysis?: TimeWindowAnalysis;
  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Simple hash for generating hypothesis IDs
 */
function hashId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return `rca-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Build evidence chain from causal analysis
 */
function buildCausalEvidenceChain(causalResult: CausalAnalysisResult): EvidenceLink[] {
  const chain: EvidenceLink[] = [];
  const nodes = causalResult.causalChain;

  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i];
    const target = nodes[i + 1];
    chain.push({
      type: "caused",
      sourceSpanId: source.spanId,
      targetSpanId: target.spanId,
      description: `${source.spanName} caused failure in ${target.spanName}`,
      strength: 1.0 - i * 0.1, // Decreasing strength along the chain
    });
  }

  return chain;
}

/**
 * Build evidence chain from pattern matches
 */
function buildPatternEvidenceChain(pattern: FailurePattern): EvidenceLink[] {
  const chain: EvidenceLink[] = [];
  const spanIds = pattern.exampleSpanIds;

  for (let i = 0; i < spanIds.length; i++) {
    chain.push({
      type: "matches_pattern",
      sourceSpanId: spanIds[i],
      description: `Matches ${pattern.category} pattern "${pattern.name}" (${pattern.frequency}x occurrences)`,
      strength: pattern.confidence,
    });
  }

  return chain;
}

/**
 * Build evidence chain from correlation
 */
function buildCorrelationEvidenceChain(
  correlation: PatternCorrelation,
  systemicIssues: SystemicIssue[]
): EvidenceLink[] {
  const chain: EvidenceLink[] = [];

  // Find systemic issues related to this correlation
  const relatedIssue = systemicIssues.find(
    (issue) =>
      issue.relatedPatterns.includes(correlation.patternA) ||
      issue.relatedPatterns.includes(correlation.patternB)
  );

  chain.push({
    type: "correlated_with",
    sourceSpanId: correlation.patternA,
    targetSpanId: correlation.patternB,
    description: `Patterns co-occur in ${correlation.coOccurrenceCount} traces ` +
      `(${correlation.correlationType} correlation, strength: ${correlation.strength.toFixed(2)})` +
      (relatedIssue ? `. Related systemic issue: ${relatedIssue.title}` : ""),
    strength: correlation.strength,
  });

  return chain;
}

/**
 * Generate remediation suggestion based on error category
 */
function generateRemediation(
  category: string,
  pattern?: FailurePattern,
  systemicIssue?: SystemicIssue
): RemediationSuggestion | undefined {
  if (systemicIssue) {
    return {
      action: `Address ${systemicIssue.issueType.replace(/_/g, " ")}`,
      description: systemicIssue.description,
      confidence: systemicIssue.confidence,
      basedOn: "historical_resolution",
    };
  }

  const remediationMap: Record<string, { action: string; description: string }> = {
    timeout: {
      action: "Increase timeout or optimize slow operation",
      description: "The operation is timing out. Consider increasing timeout limits, adding retry logic with backoff, or optimizing the underlying operation.",
    },
    connection: {
      action: "Check network connectivity and service health",
      description: "Connection failures detected. Verify the target service is reachable, check DNS resolution, and ensure connection pools are properly configured.",
    },
    authentication: {
      action: "Verify credentials and token expiration",
      description: "Authentication failures indicate invalid or expired credentials. Check API keys, refresh tokens, and credential rotation policies.",
    },
    authorization: {
      action: "Review permissions and access policies",
      description: "Authorization failures suggest insufficient permissions. Review IAM policies, role assignments, and resource-level access controls.",
    },
    rate_limit: {
      action: "Implement rate limiting and backoff",
      description: "Rate limit errors detected. Add exponential backoff, request queuing, or increase API quota.",
    },
    validation: {
      action: "Fix input validation errors",
      description: "Input validation failures detected. Review the data being sent and ensure it conforms to the expected schema.",
    },
    server_error: {
      action: "Investigate server-side errors",
      description: "Server errors indicate issues in the backend service. Check server logs, resource utilization, and recent deployments.",
    },
    resource_exhausted: {
      action: "Scale resources or optimize usage",
      description: "Resource exhaustion detected. Consider scaling up, optimizing resource usage, or implementing resource limits.",
    },
  };

  const errorCategory = pattern?.category || category;
  const suggestion = remediationMap[errorCategory];
  if (suggestion) {
    return {
      ...suggestion,
      confidence: pattern ? pattern.confidence * 0.8 : 0.5,
      basedOn: "best_practice" as const,
    };
  }

  return undefined;
}

/**
 * Generate template-based summary for a hypothesis
 */
function generateHypothesisSummary(
  category: RCAHypothesis["category"],
  causalNode?: CausalNode,
  pattern?: FailurePattern,
  correlation?: PatternCorrelation
): string {
  if (category === "root_cause" && causalNode) {
    const component = causalNode.componentType || causalNode.spanType;
    const message = causalNode.statusMessage
      ? `: ${causalNode.statusMessage.slice(0, 100)}`
      : "";
    return `Root cause identified in ${component} component "${causalNode.spanName}"${message}`;
  }

  if (category === "systemic_issue" && correlation) {
    return `Systemic correlation detected between patterns ` +
      `(strength: ${correlation.strength.toFixed(2)}, ` +
      `co-occurring in ${correlation.coOccurrenceCount} traces)`;
  }

  if (pattern) {
    return `${pattern.category.replace(/_/g, " ")} pattern "${pattern.name}" ` +
      `detected ${pattern.frequency} times with ${(pattern.confidence * 100).toFixed(0)}% confidence`;
  }

  return "Hypothesis generated from analysis evidence";
}

/**
 * Calculate composite confidence score
 * Combines: statistical strength × pattern frequency × recency
 */
function calculateCompositeConfidence(
  strength: number,
  frequency: number,
  lastSeen?: Date
): number {
  // Frequency component: log-scaled, capped at 1.0
  const frequencyScore = Math.min(1.0, Math.log10(frequency + 1) / 2);

  // Recency component: exponential decay with 24-hour half-life
  let recencyScore = 1.0;
  if (lastSeen) {
    const hoursAgo = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
    recencyScore = Math.exp(-hoursAgo / 24);
  }

  return strength * 0.5 + frequencyScore * 0.3 + recencyScore * 0.2;
}

/**
 * Check if two hypotheses overlap (same affected spans or root cause)
 */
function hypothesesOverlap(a: RCAHypothesis, b: RCAHypothesis): boolean {
  // Check span overlap
  const spansA = new Set(a.affectedSpans);
  const commonSpans = b.affectedSpans.filter((s) => spansA.has(s));
  const overlapRatio = commonSpans.length / Math.min(a.affectedSpans.length, b.affectedSpans.length);

  if (overlapRatio > 0.7) {
    return true;
  }

  // Check if same pattern
  if (a.pattern && b.pattern && a.pattern.signature === b.pattern.signature) {
    return true;
  }

  return false;
}

/**
 * Deduplicate overlapping hypotheses, keeping the higher-confidence one
 */
function deduplicateHypotheses(hypotheses: RCAHypothesis[]): RCAHypothesis[] {
  if (hypotheses.length <= 1) {
    return hypotheses;
  }

  // Sort by confidence descending
  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence);
  const kept: RCAHypothesis[] = [];

  for (const hypothesis of sorted) {
    const isDuplicate = kept.some((existing) => hypothesesOverlap(existing, hypothesis));
    if (!isDuplicate) {
      kept.push(hypothesis);
    }
  }

  return kept;
}

// ============================================================================
// Main Synthesis Function
// ============================================================================

/**
 * Synthesize root cause analysis from causal, correlation, and pattern analysis
 *
 * Composes three existing analyzers into ranked RCA hypotheses with evidence chains.
 *
 * @param context - Evaluation context with trace data
 * @param config - Optional configuration
 * @returns Ranked, deduplicated hypotheses with evidence chains
 *
 * @example
 * ```typescript
 * // Basic usage (causal + pattern only)
 * const result = await synthesizeRootCause(evalContext);
 *
 * // With correlation analysis
 * const analyzer = createCorrelationAnalyzer(clickhouseClient);
 * const result = await synthesizeRootCause(evalContext, {
 *   correlationAnalyzer: analyzer,
 *   projectId: "my-project",
 *   timeWindow: { hours: 24 },
 * });
 *
 * // With LLM summarization
 * const result = await synthesizeRootCause(evalContext, {
 *   enableLLMSummarization: true,
 *   llmSummarizer: async (evidence) => {
 *     return await llm.summarize(evidence);
 *   },
 * });
 * ```
 */
export async function synthesizeRootCause(
  context: EvalContext,
  config?: RCASynthesizerConfig
): Promise<RCASynthesisResult> {
  const maxHypotheses = config?.maxHypotheses ?? 10;
  const minConfidence = config?.minConfidence ?? 0.3;
  const enableLLM = config?.enableLLMSummarization ?? false;

  // Step 1: Run causal analysis
  const causalResult = analyzeCausality(context);

  // Step 2: Run correlation analysis (if configured)
  let correlationResult: TimeWindowAnalysis | undefined;
  if (config?.correlationAnalyzer && config?.projectId) {
    const timeWindow = config.timeWindow ?? { hours: 24 };
    correlationResult = await config.correlationAnalyzer.analyzeTimeWindow(
      config.projectId,
      timeWindow
    );
  }

  // Step 3: Run pattern detection
  const patternResult = await detectPatternsAsync(context);

  // Step 4: Build hypotheses from each evidence source
  const hypotheses: RCAHypothesis[] = [];

  // 4a: Hypotheses from causal analysis
  if (causalResult.hasErrors && causalResult.rootCause) {
    const evidenceChain = buildCausalEvidenceChain(causalResult);
    const affectedSpans = causalResult.causalChain.map((n) => n.spanId);

    // Find matching pattern for the root cause
    const matchingPattern = patternResult.patterns.find((p) =>
      p.exampleSpanIds.includes(causalResult.rootCause!.spanId)
    );

    hypotheses.push({
      id: hashId(`causal-${causalResult.rootCause.spanId}`),
      rank: 0, // Will be assigned after sorting
      confidence: calculateCompositeConfidence(
        1.0, // Causal analysis has high inherent strength
        causalResult.errorCount,
        matchingPattern?.lastSeen
      ),
      category: "root_cause",
      summary: generateHypothesisSummary("root_cause", causalResult.rootCause, matchingPattern),
      evidenceChain,
      affectedSpans,
      pattern: matchingPattern,
      remediation: generateRemediation(
        matchingPattern?.category || categorizeError(causalResult.rootCause.statusMessage),
        matchingPattern
      ),
      statisticalBasis: {
        method: "causal_dag",
        strength: 1.0,
        sampleSize: causalResult.totalSpans,
      },
    });
  }

  // 4b: Hypotheses from pattern analysis
  for (const pattern of patternResult.patterns) {
    const evidenceChain = buildPatternEvidenceChain(pattern);

    hypotheses.push({
      id: hashId(`pattern-${pattern.signature}`),
      rank: 0,
      confidence: calculateCompositeConfidence(
        pattern.confidence,
        pattern.frequency,
        pattern.lastSeen
      ),
      category: "contributing_factor",
      summary: generateHypothesisSummary("contributing_factor", undefined, pattern),
      evidenceChain,
      affectedSpans: pattern.exampleSpanIds,
      pattern,
      remediation: generateRemediation(pattern.category, pattern),
      statisticalBasis: {
        method: "pattern_clustering",
        strength: pattern.confidence,
        sampleSize: pattern.frequency,
      },
    });
  }

  // 4c: Hypotheses from correlation analysis
  if (correlationResult) {
    for (const correlation of correlationResult.correlations) {
      const evidenceChain = buildCorrelationEvidenceChain(
        correlation,
        correlationResult.systemicIssues
      );

      const relatedIssue = correlationResult.systemicIssues.find(
        (issue) =>
          issue.relatedPatterns.includes(correlation.patternA) ||
          issue.relatedPatterns.includes(correlation.patternB)
      );

      hypotheses.push({
        id: hashId(`corr-${correlation.patternA}-${correlation.patternB}`),
        rank: 0,
        confidence: calculateCompositeConfidence(
          correlation.strength,
          correlation.coOccurrenceCount
        ),
        category: "systemic_issue",
        summary: generateHypothesisSummary("systemic_issue", undefined, undefined, correlation),
        evidenceChain,
        affectedSpans: [],
        correlation,
        remediation: generateRemediation("unknown", undefined, relatedIssue),
        statisticalBasis: {
          method: "phi_coefficient",
          strength: correlation.strength,
          sampleSize: correlation.patternACount + correlation.patternBCount,
        },
      });
    }
  }

  // Step 5: Filter by minimum confidence
  const filtered = hypotheses.filter((h) => h.confidence >= minConfidence);

  // Step 6: Deduplicate overlapping hypotheses
  const deduplicated = deduplicateHypotheses(filtered);

  // Step 7: Rank by confidence (descending) and assign ranks
  deduplicated.sort((a, b) => b.confidence - a.confidence);
  const ranked = deduplicated.slice(0, maxHypotheses);
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }

  // Step 8: Optional LLM summarization
  if (enableLLM && config?.llmSummarizer) {
    for (const hypothesis of ranked) {
      hypothesis.summary = await config.llmSummarizer(hypothesis.evidenceChain);
    }
  }

  // Generate overall summary
  const summary = generateOverallSummary(ranked, causalResult, patternResult, correlationResult);

  return {
    hypotheses: ranked,
    causalAnalysis: causalResult,
    patternAnalysis: patternResult,
    correlationAnalysis: correlationResult,
    summary,
  };
}

/**
 * Generate an overall summary of the RCA synthesis
 */
function generateOverallSummary(
  hypotheses: RCAHypothesis[],
  causalResult: CausalAnalysisResult,
  patternResult: PatternAnalysisResult,
  correlationResult?: TimeWindowAnalysis
): string {
  if (!causalResult.hasErrors && patternResult.totalFailures === 0) {
    return "No errors detected in trace analysis.";
  }

  const parts: string[] = [];

  parts.push(
    `Analyzed ${causalResult.totalSpans} spans, found ${causalResult.errorCount} errors.`
  );

  if (patternResult.uniquePatterns > 0) {
    parts.push(`${patternResult.uniquePatterns} failure pattern(s) detected.`);
  }

  if (correlationResult && correlationResult.correlations.length > 0) {
    parts.push(
      `${correlationResult.correlations.length} cross-trace correlation(s) found.`
    );
  }

  if (hypotheses.length > 0) {
    const topHypothesis = hypotheses[0];
    parts.push(
      `Top hypothesis: ${topHypothesis.summary} ` +
      `(confidence: ${(topHypothesis.confidence * 100).toFixed(0)}%).`
    );
  } else {
    parts.push("No hypotheses met the minimum confidence threshold.");
  }

  return parts.join(" ");
}
