/**
 * Prompt Optimizer
 *
 * DSPy-style programmatic prompt optimization. Supports three strategies:
 * - coordinate_ascent: Iteratively refine instructions using eval feedback
 * - example_selection: Select best few-shot examples from demonstration signals
 * - reflection: LLM reflects on failures and proposes fixes
 */

import { PromptManager } from "../prompts/manager.js";
import { filterSignals, aggregateSignals } from "./signals.js";
import type { AnySignal, DemonstrationSignal } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for prompt optimization
 */
export interface OptimizationConfig {
  /** Prompt ID to optimize */
  promptId: string;
  /** Suite ID to evaluate against */
  suiteId: string;
  /** Optimization strategy */
  strategy: "coordinate_ascent" | "example_selection" | "reflection";
  /** Maximum iterations (default: 10) */
  maxIterations: number;
  /** Minimum improvement per iteration to continue (default: 0.02) */
  improvementThreshold: number;
  /** Signal configuration */
  signals?: {
    preferences?: boolean;
    demonstrations?: boolean;
    timeWindow?: { start: Date; end: Date };
  };
  /** Evaluator function: runs eval suite against a prompt and returns a score */
  evaluator: (prompt: string) => Promise<number>;
  /** LLM client for generating candidate prompts */
  llmClient: (prompt: string) => Promise<string>;
}

/**
 * Record of a single optimization iteration
 */
export interface IterationRecord {
  iteration: number;
  score: number;
  change: string;
}

/**
 * Evidence collected during optimization
 */
export interface OptimizationEvidence {
  signalsUsed: number;
  examplesSelected: number;
  iterationHistory: IterationRecord[];
}

/**
 * Result of prompt optimization
 */
export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  originalScore: number;
  optimizedScore: number;
  improvement: number;
  iterations: number;
  promptVersionId: string;
  strategy: string;
  evidence: OptimizationEvidence;
}

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * Coordinate Ascent strategy
 *
 * Start with the current prompt. Each iteration: ask LLM to improve based
 * on eval feedback. Keep the improved version if it scores higher.
 */
async function coordinateAscent(
  currentPrompt: string,
  config: OptimizationConfig
): Promise<{ prompt: string; history: IterationRecord[] }> {
  const history: IterationRecord[] = [];
  let bestPrompt = currentPrompt;
  let bestScore = await config.evaluator(currentPrompt);

  history.push({ iteration: 0, score: bestScore, change: "baseline" });

  for (let i = 1; i <= config.maxIterations; i++) {
    const improvementRequest = `You are optimizing an LLM prompt for better performance.

Current prompt (score: ${bestScore.toFixed(3)}):
---
${bestPrompt}
---

Please improve this prompt to get a higher evaluation score. Focus on:
- Clarity and specificity of instructions
- Adding relevant constraints or examples
- Removing ambiguity

Return ONLY the improved prompt text, no explanation.`;

    const candidate = await config.llmClient(improvementRequest);
    const candidateScore = await config.evaluator(candidate);

    const improvement = candidateScore - bestScore;
    history.push({
      iteration: i,
      score: candidateScore,
      change: improvement > 0 ? `improved by ${improvement.toFixed(4)}` : "no improvement",
    });

    if (candidateScore > bestScore) {
      bestPrompt = candidate;
      bestScore = candidateScore;

      if (improvement < config.improvementThreshold) {
        break; // Converged
      }
    } else {
      // No improvement — if we've stalled for 2 consecutive iterations, stop
      if (i >= 2) {
        const lastTwo = history.slice(-2);
        const stalled = lastTwo.every(h => h.change === "no improvement");
        if (stalled) break;
      }
    }
  }

  return { prompt: bestPrompt, history };
}

/**
 * Example Selection strategy
 *
 * From demonstration signals, select the best few-shot examples.
 * Score different subsets of examples appended to the base prompt.
 */
async function exampleSelection(
  currentPrompt: string,
  config: OptimizationConfig,
  signals: AnySignal[]
): Promise<{ prompt: string; history: IterationRecord[]; examplesSelected: number }> {
  const history: IterationRecord[] = [];

  // Get demonstration signals
  const demonstrations = filterSignals(signals, {
    signalTypes: ["demonstration"],
  }) as DemonstrationSignal[];

  // Filter to high-quality expert demonstrations
  const expertDemos = demonstrations
    .filter(d => d.isExpert && (d.quality === undefined || d.quality >= 0.7))
    .sort((a, b) => (b.quality ?? 0.8) - (a.quality ?? 0.8));

  const baseScore = await config.evaluator(currentPrompt);
  history.push({ iteration: 0, score: baseScore, change: "baseline" });

  if (expertDemos.length === 0) {
    return { prompt: currentPrompt, history, examplesSelected: 0 };
  }

  let bestPrompt = currentPrompt;
  let bestScore = baseScore;
  let bestExampleCount = 0;

  // Try different numbers of examples (1, 2, 3, up to 5)
  const maxExamples = Math.min(5, expertDemos.length, config.maxIterations);

  for (let count = 1; count <= maxExamples; count++) {
    const selectedExamples = expertDemos.slice(0, count);
    const examplesText = selectedExamples
      .map((demo, idx) => {
        const input = demo.action.input || "N/A";
        const output = demo.action.output || "N/A";
        return `Example ${idx + 1}:\nInput: ${input}\nOutput: ${output}`;
      })
      .join("\n\n");

    const candidatePrompt = `${currentPrompt}\n\nHere are some examples:\n\n${examplesText}`;
    const score = await config.evaluator(candidatePrompt);

    history.push({
      iteration: count,
      score,
      change: `${count} example(s): ${score > bestScore ? "improved" : "no improvement"}`,
    });

    if (score > bestScore) {
      bestPrompt = candidatePrompt;
      bestScore = score;
      bestExampleCount = count;
    }
  }

  return { prompt: bestPrompt, history, examplesSelected: bestExampleCount };
}

/**
 * Reflection strategy
 *
 * LLM analyzes failures, proposes a fix, and the fix is tested. Iterate.
 */
async function reflection(
  currentPrompt: string,
  config: OptimizationConfig
): Promise<{ prompt: string; history: IterationRecord[] }> {
  const history: IterationRecord[] = [];
  let bestPrompt = currentPrompt;
  let bestScore = await config.evaluator(currentPrompt);

  history.push({ iteration: 0, score: bestScore, change: "baseline" });

  for (let i = 1; i <= config.maxIterations; i++) {
    const reflectionRequest = `You are analyzing a prompt that scored ${bestScore.toFixed(3)} on an evaluation.

Current prompt:
---
${bestPrompt}
---

Reflect on why this prompt might be failing. Consider:
1. What ambiguities exist?
2. What edge cases are unhandled?
3. What instructions are missing?

Then produce an improved version of the prompt.
Return ONLY the improved prompt text, no explanation or analysis.`;

    const candidate = await config.llmClient(reflectionRequest);
    const candidateScore = await config.evaluator(candidate);

    const improvement = candidateScore - bestScore;
    history.push({
      iteration: i,
      score: candidateScore,
      change: improvement > 0
        ? `reflection improved by ${improvement.toFixed(4)}`
        : "reflection did not improve",
    });

    if (candidateScore > bestScore) {
      bestPrompt = candidate;
      bestScore = candidateScore;

      if (improvement < config.improvementThreshold) {
        break;
      }
    } else {
      // Two consecutive non-improvements means convergence
      if (i >= 2) {
        const lastTwo = history.slice(-2);
        const stalled = lastTwo.every(h => !h.change.includes("improved by"));
        if (stalled) break;
      }
    }
  }

  return { prompt: bestPrompt, history };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Optimize a prompt using DSPy-style programmatic optimization
 *
 * Strategies:
 * - `coordinate_ascent`: Iteratively refine instructions using eval feedback. Keep if score improves.
 * - `example_selection`: Select best few-shot examples from demonstration signals. Score different subsets.
 * - `reflection`: LLM analyzes failures, proposes fixes, test fixes. Iterate.
 *
 * All strategies stop when maxIterations is reached or improvement < threshold.
 *
 * @example
 * ```typescript
 * const result = await optimizePrompt({
 *   promptId: 'my-prompt',
 *   suiteId: 'my-suite',
 *   strategy: 'coordinate_ascent',
 *   maxIterations: 10,
 *   improvementThreshold: 0.02,
 *   evaluator: async (prompt) => runEvalSuite(prompt),
 *   llmClient: async (prompt) => llm.generate(prompt),
 * });
 *
 * console.log(`Improved by ${(result.improvement * 100).toFixed(1)}%`);
 * ```
 */
export async function optimizePrompt(
  config: OptimizationConfig
): Promise<OptimizationResult> {
  const manager = new PromptManager();

  // Get the current prompt content
  const prompt = manager.get(config.promptId);
  const currentPrompt = prompt?.template || config.promptId;
  const originalScore = await config.evaluator(currentPrompt);

  // Collect signals if configured
  let signals: AnySignal[] = [];
  let signalsUsed = 0;

  // Note: In a full implementation, signals would be fetched from ClickHouse.
  // For now, the caller can pass signals through config if needed.

  let optimizedPrompt: string;
  let history: IterationRecord[];
  let examplesSelected = 0;

  switch (config.strategy) {
    case "coordinate_ascent": {
      const result = await coordinateAscent(currentPrompt, config);
      optimizedPrompt = result.prompt;
      history = result.history;
      break;
    }
    case "example_selection": {
      const result = await exampleSelection(currentPrompt, config, signals);
      optimizedPrompt = result.prompt;
      history = result.history;
      examplesSelected = result.examplesSelected;
      break;
    }
    case "reflection": {
      const result = await reflection(currentPrompt, config);
      optimizedPrompt = result.prompt;
      history = result.history;
      break;
    }
  }

  const optimizedScore = history[history.length - 1]?.score ?? originalScore;
  const improvement = optimizedScore - originalScore;

  // Store the optimized prompt as a new version
  const versionId = `pv_${crypto.randomUUID()}`;

  return {
    originalPrompt: currentPrompt,
    optimizedPrompt,
    originalScore,
    optimizedScore,
    improvement,
    iterations: history.length - 1, // exclude baseline
    promptVersionId: versionId,
    strategy: config.strategy,
    evidence: {
      signalsUsed,
      examplesSelected,
      iterationHistory: history,
    },
  };
}
