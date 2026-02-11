/**
 * Training Loop Activities
 *
 * Activities for the closed-loop training workflow:
 * - Signal collection from ClickHouse
 * - Training data curation and quality filtering
 * - Optimization dispatch
 * - Regression status checking
 * - Loop iteration observability
 */

import { getProvider, hasProviderConfigured } from "@neon/llm-providers";
import { emitSpan } from "./emit-span";
import {
  type TrainingSignal,
  queryFeedbackSignals,
  queryLowScoreTraces,
  queryErrorTraces,
  queryRecentScores,
} from "../lib/clickhouse";

// Re-export for tests
export type { TrainingSignal };

/**
 * Collect preference signals from ClickHouse for training.
 */
export async function collectSignals(
  projectId: string,
  timeWindow: { startDate: string; endDate: string },
  signalTypes: string[],
): Promise<{ signals: TrainingSignal[]; count: number }> {
  const signals: TrainingSignal[] = [];
  const typeSet = new Set(signalTypes);

  // Query feedback signals (preference/correction)
  if (typeSet.has("preference") || typeSet.has("correction") || typeSet.has("feedback")) {
    const feedbackSignals = await queryFeedbackSignals(
      projectId,
      timeWindow.startDate,
      timeWindow.endDate,
    );
    for (const s of feedbackSignals) {
      if (typeSet.has(s.type) || typeSet.has("feedback")) {
        signals.push(s);
      }
    }
  }

  // Query low-score traces
  if (typeSet.has("low_score") || typeSet.has("feedback")) {
    const lowScoreSignals = await queryLowScoreTraces(
      projectId,
      timeWindow.startDate,
      timeWindow.endDate,
      0.5,
    );
    signals.push(...lowScoreSignals);
  }

  // Query error traces
  if (typeSet.has("error") || typeSet.has("feedback")) {
    const errorSignals = await queryErrorTraces(
      projectId,
      timeWindow.startDate,
      timeWindow.endDate,
    );
    signals.push(...errorSignals);
  }

  await emitSpan({
    traceId: `collect-signals-${projectId}`,
    spanType: "span",
    name: "collect-signals",
    attributes: {
      "training.project_id": projectId,
      "training.time_window_start": timeWindow.startDate,
      "training.time_window_end": timeWindow.endDate,
      "training.signal_types": signalTypes.join(","),
      "training.signal_count": String(signals.length),
    },
  });

  return { signals, count: signals.length };
}

// ============================================================================
// Curation helpers
// ============================================================================

function hashSignal(s: TrainingSignal): string {
  const key = `${s.traceId}:${s.type}:${s.content.slice(0, 128)}`;
  // Simple hash: sum of char codes mod a large prime
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return String(h);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Curate training data by deduplication, quality filtering, and class balancing.
 */
export async function curateTrainingData(
  signals: TrainingSignal[],
  config: { minQuality: number; maxSamples: number; balanceClasses: boolean },
): Promise<{
  curatedData: TrainingSignal[];
  qualityScore: number;
  stats: Record<string, number>;
}> {
  if (signals.length === 0) {
    return {
      curatedData: [],
      qualityScore: 0,
      stats: { totalInput: 0, afterDedup: 0, afterQualityFilter: 0, finalCount: 0, qualityScore: 0 },
    };
  }

  // 1. Deduplicate by hash
  const seen = new Set<string>();
  const deduped: TrainingSignal[] = [];
  for (const s of signals) {
    const h = hashSignal(s);
    if (!seen.has(h)) {
      seen.add(h);
      deduped.push(s);
    }
  }

  // 2. Quality filter: if signal has a score, it must meet minQuality
  const qualityFiltered = deduped.filter(
    (s) => s.score === undefined || s.score >= config.minQuality,
  );

  // 3. Balance: cap any single signal type at 60% of total
  let balanced: TrainingSignal[];
  if (config.balanceClasses) {
    const byType = new Map<string, TrainingSignal[]>();
    for (const s of qualityFiltered) {
      const arr = byType.get(s.type) || [];
      arr.push(s);
      byType.set(s.type, arr);
    }

    const maxPerType = Math.ceil(qualityFiltered.length * 0.6);
    balanced = [];
    for (const [, items] of byType) {
      balanced.push(...items.slice(0, maxPerType));
    }
  } else {
    balanced = qualityFiltered;
  }

  // 4. Diversity selection via greedy Jaccard similarity
  const tokenized = balanced.map((s) => ({ signal: s, tokens: tokenize(s.content) }));
  const selected: TrainingSignal[] = [];
  const selectedTokens: Set<string>[] = [];

  for (const { signal, tokens } of tokenized) {
    if (selected.length >= config.maxSamples) break;

    // Check similarity against already-selected items
    let tooSimilar = false;
    for (const prev of selectedTokens) {
      if (jaccardSimilarity(tokens, prev) > 0.8) {
        tooSimilar = true;
        break;
      }
    }

    if (!tooSimilar) {
      selected.push(signal);
      selectedTokens.push(tokens);
    }
  }

  // If diversity selection was too aggressive, backfill from balanced set
  if (selected.length < Math.min(config.maxSamples, balanced.length)) {
    const selectedSet = new Set(selected);
    for (const s of balanced) {
      if (selected.length >= config.maxSamples) break;
      if (!selectedSet.has(s)) {
        selected.push(s);
        selectedSet.add(s);
      }
    }
  }

  // 5. Compute quality score
  const uniqueTypes = new Set(selected.map((s) => s.type));
  const typeCount = uniqueTypes.size;
  const possibleTypes = 4; // preference, correction, low_score, error

  // Diversity: how many unique token sets vs total
  const diversityScore = selected.length > 1
    ? 1 - (selectedTokens.reduce((sum, ts, i) => {
        if (i === 0) return 0;
        const prev = selectedTokens[i - 1];
        return sum + jaccardSimilarity(ts, prev);
      }, 0) / (selected.length - 1))
    : 1;

  // Balance: how evenly distributed across types
  const countByType = new Map<string, number>();
  for (const s of selected) {
    countByType.set(s.type, (countByType.get(s.type) || 0) + 1);
  }
  const counts = [...countByType.values()];
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const balanceScore = maxCount > 0 ? minCount / maxCount : 0;

  // Coverage: fraction of signal types represented
  const coverageScore = typeCount / possibleTypes;

  const qualityScore = 0.4 * diversityScore + 0.3 * balanceScore + 0.3 * coverageScore;

  const stats: Record<string, number> = {
    totalInput: signals.length,
    afterDedup: deduped.length,
    afterQualityFilter: qualityFiltered.length,
    finalCount: selected.length,
    qualityScore,
    diversityScore,
    balanceScore,
    coverageScore,
  };

  return { curatedData: selected, qualityScore, stats };
}

// ============================================================================
// Optimization
// ============================================================================

/**
 * Dispatch optimization to generate a candidate prompt.
 */
export async function runOptimization(
  dataset: TrainingSignal[],
  strategy: string,
  promptId: string,
): Promise<{
  candidatePrompt: string;
  candidateScore: number;
  metadata: Record<string, unknown>;
}> {
  if (strategy === "example_selection") {
    return runExampleSelectionStrategy(dataset, promptId);
  }
  return runInstructionOptimizationStrategy(dataset, promptId, strategy);
}

/**
 * Example Selection Strategy:
 * Extract high-quality examples, rank by diversity, format as few-shot prompt.
 */
async function runExampleSelectionStrategy(
  dataset: TrainingSignal[],
  promptId: string,
): Promise<{
  candidatePrompt: string;
  candidateScore: number;
  metadata: Record<string, unknown>;
}> {
  // Extract successful traces (score > 0.7)
  const goodExamples = dataset.filter((s) => s.score !== undefined && s.score > 0.7);
  const candidates = goodExamples.length > 0 ? goodExamples : dataset;

  // Tokenize and select diverse top-K examples
  const K = 5;
  const tokenized = candidates.map((s) => ({ signal: s, tokens: tokenize(s.content) }));
  const selected: Array<{ signal: TrainingSignal; tokens: Set<string> }> = [];

  for (const item of tokenized) {
    if (selected.length >= K) break;

    let tooSimilar = false;
    for (const prev of selected) {
      if (jaccardSimilarity(item.tokens, prev.tokens) > 0.7) {
        tooSimilar = true;
        break;
      }
    }
    if (!tooSimilar) {
      selected.push(item);
    }
  }

  // If not enough diverse examples, fill from remaining
  if (selected.length < K) {
    for (const item of tokenized) {
      if (selected.length >= K) break;
      if (!selected.includes(item)) {
        selected.push(item);
      }
    }
  }

  // Format as few-shot prompt template
  const exampleLines = selected.map((item, i) => {
    const scoreLabel = item.signal.score !== undefined ? ` (score: ${item.signal.score.toFixed(2)})` : "";
    return `Example ${i + 1}${scoreLabel}:\n${item.signal.content}`;
  });

  const candidatePrompt = [
    `# Few-Shot Prompt for ${promptId}`,
    "",
    "Use the following examples to guide your responses:",
    "",
    ...exampleLines,
    "",
    "Now respond to the user's request following the patterns shown above.",
  ].join("\n");

  // Score based on example diversity
  let diversitySum = 0;
  let comparisons = 0;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      diversitySum += 1 - jaccardSimilarity(selected[i].tokens, selected[j].tokens);
      comparisons++;
    }
  }
  const candidateScore = comparisons > 0 ? diversitySum / comparisons : 0;

  return {
    candidatePrompt,
    candidateScore,
    metadata: {
      strategy: "example_selection",
      promptId,
      datasetSize: dataset.length,
      examplesSelected: selected.length,
      goodExamplesAvailable: goodExamples.length,
    },
  };
}

/**
 * Instruction Optimization Strategy:
 * Use an LLM to generate improved instructions based on good/bad examples.
 */
async function runInstructionOptimizationStrategy(
  dataset: TrainingSignal[],
  promptId: string,
  strategy: string,
): Promise<{
  candidatePrompt: string;
  candidateScore: number;
  metadata: Record<string, unknown>;
}> {
  // Separate good and bad examples
  const good = dataset.filter((s) => s.score !== undefined && s.score > 0.7);
  const bad = dataset.filter(
    (s) => s.type === "error" || s.type === "low_score" || (s.score !== undefined && s.score <= 0.5),
  );

  const goodSummary = good
    .slice(0, 5)
    .map((s) => s.content.slice(0, 300))
    .join("\n---\n");
  const badSummary = bad
    .slice(0, 5)
    .map((s) => s.content.slice(0, 300))
    .join("\n---\n");

  // Try LLM-based optimization if a provider is configured
  if (hasProviderConfigured()) {
    try {
      const model = process.env.NEON_OPTIMIZATION_MODEL || "claude-3-haiku";
      const provider = getProvider(model);

      const response = await provider.chat({
        model,
        messages: [
          {
            role: "user",
            content: [
              "Given these examples of good and bad agent behavior, generate an improved system instruction.",
              `Current prompt ID: ${promptId}`,
              "",
              "## Good examples (high scores):",
              goodSummary || "(none available)",
              "",
              "## Bad examples (low scores / errors):",
              badSummary || "(none available)",
              "",
              "Generate ONLY the improved system instruction text. No explanations or commentary.",
            ].join("\n"),
          },
        ],
        maxTokens: 2048,
      });

      const avgScore = good.length > 0
        ? good.reduce((sum, s) => sum + (s.score || 0), 0) / good.length
        : 0.5;

      return {
        candidatePrompt: response.content.trim(),
        candidateScore: avgScore,
        metadata: {
          strategy,
          promptId,
          datasetSize: dataset.length,
          goodExamples: good.length,
          badExamples: bad.length,
          llmModel: model,
        },
      };
    } catch (error) {
      // Fall through to template-based approach
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      return buildTemplateFallback(dataset, promptId, strategy, good, bad, errMsg);
    }
  }

  // No LLM provider configured — use template-based approach
  return buildTemplateFallback(dataset, promptId, strategy, good, bad);
}

function buildTemplateFallback(
  dataset: TrainingSignal[],
  promptId: string,
  strategy: string,
  good: TrainingSignal[],
  bad: TrainingSignal[],
  fallbackReason?: string,
): {
  candidatePrompt: string;
  candidateScore: number;
  metadata: Record<string, unknown>;
} {
  const instructions = [
    `# Optimized Instructions for ${promptId}`,
    "",
  ];

  if (good.length > 0) {
    instructions.push("## Key patterns from successful interactions:");
    for (const s of good.slice(0, 3)) {
      instructions.push(`- ${s.content.slice(0, 200)}`);
    }
    instructions.push("");
  }

  if (bad.length > 0) {
    instructions.push("## Patterns to avoid:");
    for (const s of bad.slice(0, 3)) {
      instructions.push(`- ${s.content.slice(0, 200)}`);
    }
    instructions.push("");
  }

  const avgScore = good.length > 0
    ? good.reduce((sum, s) => sum + (s.score || 0), 0) / good.length
    : 0.3;

  return {
    candidatePrompt: instructions.join("\n"),
    candidateScore: avgScore * 0.8, // discount for template-based approach
    metadata: {
      strategy,
      promptId,
      datasetSize: dataset.length,
      goodExamples: good.length,
      badExamples: bad.length,
      usedFallback: true,
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}

// ============================================================================
// Regression Detection
// ============================================================================

/**
 * Check for regression in a suite's recent evaluation results.
 */
export async function checkRegressionStatus(
  suiteId: string,
  windowSize: number,
): Promise<{
  hasRegression: boolean;
  severity?: string;
  details?: string;
  currentScore?: number;
  baseline?: number;
  dropPercent?: number;
}> {
  // Extract projectId from suiteId pattern or use env default
  const projectId = process.env.DEFAULT_PROJECT_ID || "default";

  const scores = await queryRecentScores(projectId, suiteId, windowSize);

  await emitSpan({
    traceId: `regression-check-${suiteId}`,
    spanType: "span",
    name: "check-regression",
    attributes: {
      "training.suite_id": suiteId,
      "training.window_size": String(windowSize),
      "training.scores_found": String(scores.length),
    },
  });

  // Need at least 5 scores for meaningful regression detection
  if (scores.length < 5) {
    return {
      hasRegression: false,
      details: `Insufficient data: ${scores.length} scores (need at least 5)`,
    };
  }

  // Scores come back newest-first from the query
  const values = scores.map((s) => s.value);
  const currentScore = values[0];

  // Compute rolling average and stddev over the older scores (exclude most recent)
  const olderValues = values.slice(1);
  const mean = olderValues.reduce((a, b) => a + b, 0) / olderValues.length;
  const variance =
    olderValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / olderValues.length;
  const stddev = Math.sqrt(variance);

  // Regression: current score < (rolling_avg - 2 * stddev)
  const threshold = mean - 2 * stddev;
  const hasRegression = currentScore < threshold;

  if (!hasRegression) {
    return {
      hasRegression: false,
      currentScore,
      baseline: mean,
    };
  }

  const dropPercent = mean > 0 ? ((mean - currentScore) / mean) * 100 : 0;

  let severity: "critical" | "warning";
  if (dropPercent > 20) {
    severity = "critical";
  } else {
    severity = "warning";
  }

  return {
    hasRegression: true,
    severity,
    details: `Score dropped ${dropPercent.toFixed(1)}% from baseline ${mean.toFixed(3)} to ${currentScore.toFixed(3)} (threshold: ${threshold.toFixed(3)})`,
    currentScore,
    baseline: mean,
    dropPercent,
  };
}

/**
 * Record a training loop iteration as a span for observability.
 */
export async function recordLoopIteration(
  loopId: string,
  stage: string,
  metrics: Record<string, number>,
): Promise<void> {
  const attributes: Record<string, string> = {
    "training.loop_id": loopId,
    "training.stage": stage,
  };

  for (const [key, value] of Object.entries(metrics)) {
    attributes[`training.metric.${key}`] = String(value);
  }

  await emitSpan({
    traceId: `training-loop-${loopId}`,
    spanType: "span",
    name: `training-loop:${stage}`,
    attributes,
  });
}
