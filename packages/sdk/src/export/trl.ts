/**
 * HuggingFace TRL Export Format
 *
 * Export traces in HuggingFace TRL (Transformer Reinforcement Learning) formats
 * for training language models with various techniques.
 *
 * Supports:
 * - SFT (Supervised Fine-Tuning) - prompt/completion pairs
 * - DPO (Direct Preference Optimization) - chosen/rejected pairs
 * - KTO (Kahneman-Tversky Optimization) - binary feedback
 *
 * @see https://huggingface.co/docs/trl/index
 *
 * @example
 * ```typescript
 * import { exportTraces } from '@neon/sdk';
 *
 * // Export for SFT training
 * const sftResult = exportTraces(traces, 'trl-sft', {
 *   includeSystemPrompt: true,
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * // Export for DPO training (requires preference data)
 * const dpoResult = exportTraces(tracesWithPreferences, 'trl-dpo');
 *
 * // Export for KTO training (requires binary feedback)
 * const ktoResult = exportTraces(tracesWithLabels, 'trl-kto');
 * ```
 */

import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";
import type { ExportFormat, BaseExportConfig, TraceExportContext } from "./generic.js";
import { flattenSpans, filterSpans, estimateTokenCount } from "./generic.js";

/**
 * TRL SFT (Supervised Fine-Tuning) example
 * Standard format: prompt + completion
 */
export interface TRLSFTExample {
  /** Input prompt text */
  prompt: string;
  /** Target completion text */
  completion: string;
  /** Optional conversation format (for chat models) */
  messages?: Array<{ role: string; content: string }>;
}

/**
 * TRL DPO (Direct Preference Optimization) example
 * Preference learning: prompt + chosen + rejected
 */
export interface TRLDPOExample {
  /** Input prompt text */
  prompt: string;
  /** Preferred/chosen completion */
  chosen: string;
  /** Rejected/non-preferred completion */
  rejected: string;
}

/**
 * TRL KTO (Kahneman-Tversky Optimization) example
 * Binary feedback: prompt + completion + label
 */
export interface TRLKTOExample {
  /** Input prompt text */
  prompt: string;
  /** Completion text */
  completion: string;
  /** Binary label (true = good, false = bad) */
  label: boolean;
}

/**
 * Union type for all TRL example formats
 */
export type TRLExample = TRLSFTExample | TRLDPOExample | TRLKTOExample;

/**
 * TRL training mode
 */
export type TRLMode = "sft" | "dpo" | "kto";

/**
 * Configuration for TRL export
 */
export interface TRLConfig extends BaseExportConfig {
  /** Training mode: 'sft', 'dpo', or 'kto' */
  mode?: TRLMode;
  /** Include conversation format for chat models */
  includeMessages?: boolean;
  /** Prompt template for wrapping input */
  promptTemplate?: string;
  /** Completion suffix (e.g., end of text token) */
  completionSuffix?: string;
  /** Prompt prefix (e.g., instruction format) */
  promptPrefix?: string;
  /** For DPO: score threshold to mark as "chosen" (default: 0.7) */
  chosenThreshold?: number;
  /** For KTO: score threshold to mark as "good" (default: 0.5) */
  goodThreshold?: number;
  /** Output format: 'jsonl' or 'parquet' metadata (actual parquet requires post-processing) */
  outputFormat?: "jsonl" | "json";
}

/**
 * Apply prompt template
 */
function applyTemplate(
  prompt: string,
  config: TRLConfig
): string {
  let result = prompt;

  if (config.promptTemplate) {
    result = config.promptTemplate.replace("{{prompt}}", result);
  }

  if (config.promptPrefix) {
    result = config.promptPrefix + result;
  }

  return result;
}

/**
 * Apply completion modifications
 */
function applyCompletionFormat(
  completion: string,
  config: TRLConfig
): string {
  let result = completion;

  if (config.completionSuffix) {
    result = result + config.completionSuffix;
  }

  return result;
}

/**
 * Extract the main prompt from a trace (first user input or generation input)
 */
function extractPrompt(
  trace: TraceWithSpans,
  config: TRLConfig
): string | null {
  const allSpans = flattenSpans(trace.spans);
  const filteredSpans = filterSpans(allSpans, {
    ...config,
    spanTypes: config.spanTypes ?? ["generation"],
  });

  for (const span of filteredSpans) {
    if (span.input) {
      let prompt = span.input;

      // Prepend system prompt if configured
      if (config.includeSystemPrompt && config.systemPrompt) {
        prompt = `${config.systemPrompt}\n\n${prompt}`;
      }

      return applyTemplate(prompt, config);
    }
  }

  return null;
}

/**
 * Extract the main completion from a trace (last assistant output)
 */
function extractCompletion(
  trace: TraceWithSpans,
  config: TRLConfig
): string | null {
  const allSpans = flattenSpans(trace.spans);
  const filteredSpans = filterSpans(allSpans, {
    ...config,
    spanTypes: config.spanTypes ?? ["generation"],
  });

  // Get the last generation output
  for (let i = filteredSpans.length - 1; i >= 0; i--) {
    const span = filteredSpans[i];
    if (span.output) {
      return applyCompletionFormat(span.output, config);
    }
  }

  return null;
}

/**
 * Extract conversation messages from a trace
 */
function extractMessages(
  trace: TraceWithSpans,
  config: TRLConfig
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // Add system prompt if configured
  if (config.includeSystemPrompt && config.systemPrompt) {
    messages.push({ role: "system", content: config.systemPrompt });
  }

  const allSpans = flattenSpans(trace.spans);
  const filteredSpans = filterSpans(allSpans, {
    ...config,
    spanTypes: config.spanTypes ?? ["generation"],
  });

  for (const span of filteredSpans) {
    if (span.input) {
      messages.push({ role: "user", content: span.input });
    }
    if (span.output) {
      messages.push({ role: "assistant", content: span.output });
    }
  }

  return messages;
}

/**
 * Determine if a trace should be marked as "chosen" or "good" based on scores
 */
function isTracePositive(
  context: TraceExportContext,
  threshold: number
): boolean {
  // Explicit label takes precedence
  if (context.isGood !== undefined) {
    return context.isGood;
  }

  // Check trace status
  if (context.trace.trace.status === "error") {
    return false;
  }

  // Check scores if available
  if (context.scores && context.scores.length > 0) {
    const avgScore = context.scores.reduce((sum, s) => sum + s.value, 0) / context.scores.length;
    return avgScore >= threshold;
  }

  // Default to positive for successful traces
  return context.trace.trace.status === "ok";
}

// ============================================================================
// SFT Format
// ============================================================================

/**
 * Convert trace to SFT example
 */
function convertToSFT(
  context: TraceExportContext,
  config: TRLConfig
): TRLSFTExample[] {
  const prompt = extractPrompt(context.trace, config);
  const completion = extractCompletion(context.trace, config);

  if (!prompt || !completion) {
    return [];
  }

  const example: TRLSFTExample = { prompt, completion };

  if (config.includeMessages) {
    example.messages = extractMessages(context.trace, config);
  }

  return [example];
}

/**
 * TRL SFT format definition
 */
export const trlSFTFormat: ExportFormat<TRLSFTExample, TRLConfig> = {
  name: "trl-sft",
  description: "HuggingFace TRL SFT format (prompt/completion pairs)",
  extension: ".jsonl",
  mimeType: "application/jsonl",
  convert: convertToSFT,
  serialize: (records, config) => {
    if (config.outputFormat === "json") {
      return JSON.stringify(records, null, 2);
    }
    return records.map((r) => JSON.stringify(r)).join("\n");
  },
  parse: (content) => {
    // Try JSONL first
    if (content.trim().startsWith("[")) {
      return JSON.parse(content) as TRLSFTExample[];
    }
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TRLSFTExample);
  },
  validate: (record) => {
    const errors: string[] = [];
    if (!record.prompt) errors.push("missing prompt");
    if (!record.completion) errors.push("missing completion");
    return { valid: errors.length === 0, errors };
  },
  estimateTokens: (record) => {
    let total = estimateTokenCount(record.prompt);
    total += estimateTokenCount(record.completion);
    if (record.messages) {
      for (const msg of record.messages) {
        total += estimateTokenCount(msg.content) + 4; // role overhead
      }
    }
    return total;
  },
};

// ============================================================================
// DPO Format
// ============================================================================

/**
 * Convert trace to DPO example
 * Requires either explicit chosen/rejected outputs or paired traces with different scores
 */
function convertToDPO(
  context: TraceExportContext,
  config: TRLConfig
): TRLDPOExample[] {
  const prompt = extractPrompt(context.trace, config);

  if (!prompt) {
    return [];
  }

  // Check for explicit chosen/rejected outputs
  if (context.chosenOutput && context.rejectedOutput) {
    return [{
      prompt,
      chosen: applyCompletionFormat(context.chosenOutput, config),
      rejected: applyCompletionFormat(context.rejectedOutput, config),
    }];
  }

  // Single trace mode: we need the completion and determine if it's chosen or rejected
  // This typically requires a pair of traces to compare, so single trace returns empty
  // unless metadata indicates this is part of a preference pair
  const completion = extractCompletion(context.trace, config);
  if (!completion) {
    return [];
  }

  // If we have metadata indicating the rejected output
  if (context.metadata?.rejectedOutput) {
    return [{
      prompt,
      chosen: completion,
      rejected: applyCompletionFormat(String(context.metadata.rejectedOutput), config),
    }];
  }

  // Cannot create DPO example from single trace without preference data
  return [];
}

/**
 * TRL DPO format definition
 */
export const trlDPOFormat: ExportFormat<TRLDPOExample, TRLConfig> = {
  name: "trl-dpo",
  description: "HuggingFace TRL DPO format (preference pairs)",
  extension: ".jsonl",
  mimeType: "application/jsonl",
  convert: convertToDPO,
  serialize: (records, config) => {
    if (config.outputFormat === "json") {
      return JSON.stringify(records, null, 2);
    }
    return records.map((r) => JSON.stringify(r)).join("\n");
  },
  parse: (content) => {
    if (content.trim().startsWith("[")) {
      return JSON.parse(content) as TRLDPOExample[];
    }
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TRLDPOExample);
  },
  validate: (record) => {
    const errors: string[] = [];
    if (!record.prompt) errors.push("missing prompt");
    if (!record.chosen) errors.push("missing chosen");
    if (!record.rejected) errors.push("missing rejected");
    if (record.chosen === record.rejected) {
      errors.push("chosen and rejected must be different");
    }
    return { valid: errors.length === 0, errors };
  },
  estimateTokens: (record) => {
    return (
      estimateTokenCount(record.prompt) +
      estimateTokenCount(record.chosen) +
      estimateTokenCount(record.rejected)
    );
  },
};

// ============================================================================
// KTO Format
// ============================================================================

/**
 * Convert trace to KTO example
 */
function convertToKTO(
  context: TraceExportContext,
  config: TRLConfig
): TRLKTOExample[] {
  const prompt = extractPrompt(context.trace, config);
  const completion = extractCompletion(context.trace, config);

  if (!prompt || !completion) {
    return [];
  }

  const goodThreshold = config.goodThreshold ?? 0.5;
  const label = isTracePositive(context, goodThreshold);

  return [{
    prompt,
    completion,
    label,
  }];
}

/**
 * TRL KTO format definition
 */
export const trlKTOFormat: ExportFormat<TRLKTOExample, TRLConfig> = {
  name: "trl-kto",
  description: "HuggingFace TRL KTO format (binary feedback)",
  extension: ".jsonl",
  mimeType: "application/jsonl",
  convert: convertToKTO,
  serialize: (records, config) => {
    if (config.outputFormat === "json") {
      return JSON.stringify(records, null, 2);
    }
    return records.map((r) => JSON.stringify(r)).join("\n");
  },
  parse: (content) => {
    if (content.trim().startsWith("[")) {
      return JSON.parse(content) as TRLKTOExample[];
    }
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TRLKTOExample);
  },
  validate: (record) => {
    const errors: string[] = [];
    if (!record.prompt) errors.push("missing prompt");
    if (!record.completion) errors.push("missing completion");
    if (typeof record.label !== "boolean") errors.push("label must be a boolean");
    return { valid: errors.length === 0, errors };
  },
  estimateTokens: (record) => {
    return estimateTokenCount(record.prompt) + estimateTokenCount(record.completion);
  },
};

// ============================================================================
// Unified TRL Format (auto-detects mode)
// ============================================================================

/**
 * Convert trace to TRL example based on configured mode
 */
function convertToTRL(
  context: TraceExportContext,
  config: TRLConfig
): TRLExample[] {
  const mode = config.mode ?? "sft";

  switch (mode) {
    case "sft":
      return convertToSFT(context, config);
    case "dpo":
      return convertToDPO(context, config);
    case "kto":
      return convertToKTO(context, config);
    default:
      return convertToSFT(context, config);
  }
}

/**
 * Unified TRL format (mode-configurable)
 */
export const trlFormat: ExportFormat<TRLExample, TRLConfig> = {
  name: "trl",
  description: "HuggingFace TRL format (configurable: sft/dpo/kto)",
  extension: ".jsonl",
  mimeType: "application/jsonl",
  convert: convertToTRL,
  serialize: (records, config) => {
    if (config.outputFormat === "json") {
      return JSON.stringify(records, null, 2);
    }
    return records.map((r) => JSON.stringify(r)).join("\n");
  },
  parse: (content) => {
    if (content.trim().startsWith("[")) {
      return JSON.parse(content) as TRLExample[];
    }
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TRLExample);
  },
  estimateTokens: (record) => {
    let total = 0;
    if ("prompt" in record) {
      total += estimateTokenCount(record.prompt);
    }
    if ("completion" in record) {
      total += estimateTokenCount(record.completion);
    }
    if ("chosen" in record) {
      total += estimateTokenCount(record.chosen);
    }
    if ("rejected" in record) {
      total += estimateTokenCount(record.rejected);
    }
    return total;
  },
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Convert traces to TRL SFT examples
 *
 * @example
 * ```typescript
 * const examples = tracesToSFT(traces, {
 *   systemPrompt: 'You are a helpful assistant.',
 *   includeMessages: true,
 * });
 * ```
 */
export function tracesToSFT(
  traces: TraceWithSpans[],
  config: TRLConfig = {}
): TRLSFTExample[] {
  const examples: TRLSFTExample[] = [];

  for (const trace of traces) {
    if (config.successOnly && trace.trace.status !== "ok") {
      continue;
    }
    examples.push(...convertToSFT({ trace }, config));
  }

  return examples;
}

/**
 * Convert traces to TRL DPO examples
 * Requires traces with preference data (chosen/rejected outputs)
 *
 * @example
 * ```typescript
 * const examples = tracesToDPO(traces, {
 *   chosenThreshold: 0.8,
 * });
 * ```
 */
export function tracesToDPO(
  contexts: TraceExportContext[],
  config: TRLConfig = {}
): TRLDPOExample[] {
  const examples: TRLDPOExample[] = [];

  for (const context of contexts) {
    if (config.successOnly && context.trace.trace.status !== "ok") {
      continue;
    }
    examples.push(...convertToDPO(context, config));
  }

  return examples;
}

/**
 * Convert traces to TRL KTO examples
 *
 * @example
 * ```typescript
 * const examples = tracesToKTO(contexts, {
 *   goodThreshold: 0.6,
 * });
 * ```
 */
export function tracesToKTO(
  contexts: TraceExportContext[],
  config: TRLConfig = {}
): TRLKTOExample[] {
  const examples: TRLKTOExample[] = [];

  for (const context of contexts) {
    if (config.successOnly && context.trace.trace.status !== "ok") {
      continue;
    }
    examples.push(...convertToKTO(context, config));
  }

  return examples;
}

/**
 * Create DPO examples from paired traces
 * Pairs traces by their input prompt and uses scores to determine chosen/rejected
 *
 * @example
 * ```typescript
 * const pairs = createDPOPairs(traces, scores, {
 *   chosenThreshold: 0.8,
 * });
 * ```
 */
export function createDPOPairs(
  contexts: TraceExportContext[],
  config: TRLConfig = {}
): TRLDPOExample[] {
  const examples: TRLDPOExample[] = [];
  const chosenThreshold = config.chosenThreshold ?? 0.7;

  // Group traces by prompt
  const promptGroups = new Map<string, TraceExportContext[]>();

  for (const context of contexts) {
    const prompt = extractPrompt(context.trace, config);
    if (!prompt) continue;

    const group = promptGroups.get(prompt) ?? [];
    group.push(context);
    promptGroups.set(prompt, group);
  }

  // For each group with 2+ traces, create preference pairs
  for (const [prompt, group] of promptGroups) {
    if (group.length < 2) continue;

    // Sort by score (highest first)
    const sorted = group
      .map((ctx) => ({
        ctx,
        score: ctx.scores?.length
          ? ctx.scores.reduce((sum, s) => sum + s.value, 0) / ctx.scores.length
          : ctx.trace.trace.status === "ok" ? 0.5 : 0,
      }))
      .sort((a, b) => b.score - a.score);

    // Create pairs from high-scoring (chosen) and low-scoring (rejected)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const chosen = sorted[i];
        const rejected = sorted[j];

        // Only create pair if there's a meaningful difference
        if (chosen.score < chosenThreshold) continue;
        if (chosen.score - rejected.score < 0.1) continue;

        const chosenCompletion = extractCompletion(chosen.ctx.trace, config);
        const rejectedCompletion = extractCompletion(rejected.ctx.trace, config);

        if (chosenCompletion && rejectedCompletion && chosenCompletion !== rejectedCompletion) {
          examples.push({
            prompt,
            chosen: chosenCompletion,
            rejected: rejectedCompletion,
          });
        }
      }
    }
  }

  return examples;
}

/**
 * Convert TRL examples to JSONL string
 */
export function toTRLJSONL(examples: TRLExample[]): string {
  return examples.map((e) => JSON.stringify(e)).join("\n");
}

/**
 * Parse TRL JSONL content
 */
export function parseTRLJSONL<T extends TRLExample>(content: string): T[] {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}
