/**
 * Generic Training Data Export System
 *
 * A pluggable, extensible export format system that supports multiple
 * training data formats for fine-tuning AI models.
 *
 * Built-in formats:
 * - OpenAI fine-tuning (JSONL)
 * - HuggingFace TRL (SFT, DPO, KTO)
 * - Agent Lightning (RL training)
 *
 * @example
 * ```typescript
 * import {
 *   exportRegistry,
 *   exportTraces,
 *   exportTracesToFile,
 *   registerFormat
 * } from '@neon/sdk';
 *
 * // Export to OpenAI format
 * const jsonl = exportTraces(traces, 'openai-ft');
 *
 * // Export to file
 * await exportTracesToFile(traces, 'training.jsonl', 'openai-ft');
 *
 * // Register custom format
 * registerFormat({
 *   name: 'my-format',
 *   extension: '.json',
 *   convert: (trace, config) => ({ ... }),
 *   serialize: (records) => JSON.stringify(records),
 * });
 * ```
 */

import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";

// Re-export from other format modules for convenience
export type { OpenAIFineTuneConfig, OpenAIFineTuneExample } from "./openai-ft.js";
export type {
  TRLConfig,
  TRLSFTExample,
  TRLDPOExample,
  TRLKTOExample,
  TRLExample,
} from "./trl.js";

/**
 * Base configuration for all export formats
 */
export interface BaseExportConfig {
  /** Include system prompts in the output */
  includeSystemPrompt?: boolean;
  /** System prompt to prepend (if not in trace) */
  systemPrompt?: string;
  /** Filter spans by type */
  spanTypes?: string[];
  /** Filter spans by component type */
  componentTypes?: string[];
  /** Only include successful traces */
  successOnly?: boolean;
  /** Maximum sequence length (in characters, for truncation) */
  maxLength?: number;
  /** Custom metadata to include */
  metadata?: Record<string, unknown>;
}

/**
 * Context for a single trace export
 */
export interface TraceExportContext {
  /** The trace to export */
  trace: TraceWithSpans;
  /** Optional scores for the trace */
  scores?: Array<{ name: string; value: number; spanId?: string }>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Chosen/preferred output (for preference learning) */
  chosenOutput?: string;
  /** Rejected output (for preference learning) */
  rejectedOutput?: string;
  /** Binary label for KTO (true = good, false = bad) */
  isGood?: boolean;
}

/**
 * Result of a batch export operation
 */
export interface ExportResult<T = unknown> {
  /** The exported records */
  records: T[];
  /** Serialized output (ready to write to file) */
  serialized: string;
  /** Statistics about the export */
  stats: ExportStats;
  /** Format name used */
  format: string;
  /** File extension for the format */
  extension: string;
}

/**
 * Statistics about an export operation
 */
export interface ExportStats {
  /** Total traces processed */
  totalTraces: number;
  /** Traces successfully exported */
  exportedTraces: number;
  /** Traces skipped (filtered out) */
  skippedTraces: number;
  /** Total examples/records generated */
  totalExamples: number;
  /** Total tokens (estimated) */
  estimatedTokens?: number;
  /** Warnings generated during export */
  warnings: string[];
}

/**
 * Export format definition
 *
 * Implement this interface to create a custom export format.
 */
export interface ExportFormat<TRecord = unknown, TConfig extends BaseExportConfig = BaseExportConfig> {
  /** Unique format identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** File extension (e.g., '.jsonl', '.json') */
  extension: string;
  /** MIME type for the format */
  mimeType: string;
  /**
   * Convert a single trace to one or more records
   * @param context - The trace context to convert
   * @param config - Format-specific configuration
   * @returns Array of records (may be empty if trace is filtered out)
   */
  convert(context: TraceExportContext, config: TConfig): TRecord[];
  /**
   * Serialize records to string output
   * @param records - All records to serialize
   * @param config - Format-specific configuration
   * @returns Serialized string ready for file output
   */
  serialize(records: TRecord[], config: TConfig): string;
  /**
   * Parse serialized string back to records (optional)
   * @param content - Serialized content
   * @returns Parsed records
   */
  parse?(content: string): TRecord[];
  /**
   * Validate a single record (optional)
   * @param record - Record to validate
   * @returns Validation result with errors if invalid
   */
  validate?(record: TRecord): { valid: boolean; errors: string[] };
  /**
   * Estimate token count for a record (optional)
   * @param record - Record to estimate
   * @returns Estimated token count
   */
  estimateTokens?(record: TRecord): number;
}

/**
 * Format registry for managing export formats
 */
class FormatRegistry {
  private formats = new Map<string, ExportFormat>();
  private aliases = new Map<string, string>();

  /**
   * Register a new export format
   */
  register<TRecord, TConfig extends BaseExportConfig>(
    format: ExportFormat<TRecord, TConfig>
  ): void {
    if (this.formats.has(format.name)) {
      throw new Error(`Export format '${format.name}' is already registered`);
    }
    this.formats.set(format.name, format as ExportFormat);
  }

  /**
   * Register an alias for a format
   */
  registerAlias(alias: string, formatName: string): void {
    if (!this.formats.has(formatName)) {
      throw new Error(`Cannot create alias: format '${formatName}' not found`);
    }
    this.aliases.set(alias, formatName);
  }

  /**
   * Get a format by name or alias
   */
  get<TRecord = unknown, TConfig extends BaseExportConfig = BaseExportConfig>(
    name: string
  ): ExportFormat<TRecord, TConfig> | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.formats.get(resolvedName) as ExportFormat<TRecord, TConfig> | undefined;
  }

  /**
   * Check if a format exists
   */
  has(name: string): boolean {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.formats.has(resolvedName);
  }

  /**
   * List all registered formats
   */
  list(): Array<{ name: string; description: string; extension: string }> {
    return Array.from(this.formats.values()).map((f) => ({
      name: f.name,
      description: f.description,
      extension: f.extension,
    }));
  }

  /**
   * Unregister a format
   */
  unregister(name: string): boolean {
    // Remove any aliases pointing to this format
    for (const [alias, target] of this.aliases) {
      if (target === name) {
        this.aliases.delete(alias);
      }
    }
    return this.formats.delete(name);
  }

  /**
   * Clear all formats (useful for testing)
   */
  clear(): void {
    this.formats.clear();
    this.aliases.clear();
  }
}

/**
 * Global format registry instance
 */
export const exportRegistry = new FormatRegistry();

/**
 * Register a new export format
 *
 * @example
 * ```typescript
 * registerFormat({
 *   name: 'custom-sft',
 *   description: 'Custom SFT format for internal training',
 *   extension: '.jsonl',
 *   mimeType: 'application/jsonl',
 *   convert: (ctx, config) => [{
 *     instruction: extractInstruction(ctx.trace),
 *     response: extractResponse(ctx.trace),
 *   }],
 *   serialize: (records) => records.map(r => JSON.stringify(r)).join('\n'),
 * });
 * ```
 */
export function registerFormat<TRecord, TConfig extends BaseExportConfig>(
  format: ExportFormat<TRecord, TConfig>
): void {
  exportRegistry.register(format);
}

/**
 * Register an alias for a format name
 *
 * @example
 * ```typescript
 * registerFormatAlias('openai', 'openai-ft');
 * registerFormatAlias('trl-sft', 'trl');
 * ```
 */
export function registerFormatAlias(alias: string, formatName: string): void {
  exportRegistry.registerAlias(alias, formatName);
}

/**
 * Get a registered format by name
 */
export function getFormat<TRecord = unknown, TConfig extends BaseExportConfig = BaseExportConfig>(
  name: string
): ExportFormat<TRecord, TConfig> | undefined {
  return exportRegistry.get<TRecord, TConfig>(name);
}

/**
 * List all registered export formats
 */
export function listFormats(): Array<{ name: string; description: string; extension: string }> {
  return exportRegistry.list();
}

/**
 * Export traces to a specific format
 *
 * @example
 * ```typescript
 * // Export for OpenAI fine-tuning
 * const result = exportTraces(traces, 'openai-ft', {
 *   includeSystemPrompt: true,
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * // Write to file
 * fs.writeFileSync('training.jsonl', result.serialized);
 *
 * // Check stats
 * console.log(`Exported ${result.stats.exportedTraces} traces`);
 * ```
 */
export function exportTraces<TRecord = unknown>(
  contexts: TraceExportContext[],
  formatName: string,
  config: BaseExportConfig = {}
): ExportResult<TRecord> {
  const format = exportRegistry.get<TRecord>(formatName);
  if (!format) {
    const available = exportRegistry.list().map((f) => f.name).join(", ");
    throw new Error(
      `Unknown export format '${formatName}'. Available formats: ${available}`
    );
  }

  const records: TRecord[] = [];
  const warnings: string[] = [];
  let skippedTraces = 0;
  let estimatedTokens = 0;

  for (const context of contexts) {
    // Apply global filters
    if (config.successOnly && context.trace.trace.status !== "ok") {
      skippedTraces++;
      continue;
    }

    try {
      const converted = format.convert(context, config);
      if (converted.length === 0) {
        skippedTraces++;
      } else {
        records.push(...converted);
        // Estimate tokens if available
        if (format.estimateTokens) {
          for (const record of converted) {
            estimatedTokens += format.estimateTokens(record);
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to convert trace ${context.trace.trace.traceId}: ${msg}`);
      skippedTraces++;
    }
  }

  const serialized = format.serialize(records, config);

  return {
    records,
    serialized,
    stats: {
      totalTraces: contexts.length,
      exportedTraces: contexts.length - skippedTraces,
      skippedTraces,
      totalExamples: records.length,
      estimatedTokens: format.estimateTokens ? estimatedTokens : undefined,
      warnings,
    },
    format: format.name,
    extension: format.extension,
  };
}

/**
 * Export traces and write to a file (Node.js only)
 *
 * @example
 * ```typescript
 * await exportTracesToFile(traces, 'output/training.jsonl', 'openai-ft');
 * ```
 */
export async function exportTracesToFile(
  contexts: TraceExportContext[],
  filePath: string,
  formatName: string,
  config: BaseExportConfig = {}
): Promise<ExportResult> {
  const result = exportTraces(contexts, formatName, config);

  // Dynamic import for Node.js fs module
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, result.serialized, "utf-8");

  return result;
}

/**
 * Stream export for large datasets
 *
 * @example
 * ```typescript
 * const stream = streamExport(traces, 'openai-ft', {
 *   onRecord: (record) => writer.write(JSON.stringify(record) + '\n'),
 *   onProgress: (current, total) => console.log(`${current}/${total}`),
 * });
 *
 * const stats = await stream;
 * ```
 */
export async function streamExport<TRecord = unknown>(
  contexts: TraceExportContext[],
  formatName: string,
  options: {
    config?: BaseExportConfig;
    onRecord?: (record: TRecord, index: number) => void | Promise<void>;
    onProgress?: (current: number, total: number) => void;
    batchSize?: number;
  } = {}
): Promise<ExportStats> {
  const { config = {}, onRecord, onProgress, batchSize = 100 } = options;

  const format = exportRegistry.get<TRecord>(formatName);
  if (!format) {
    throw new Error(`Unknown export format '${formatName}'`);
  }

  const warnings: string[] = [];
  let exportedTraces = 0;
  let skippedTraces = 0;
  let totalExamples = 0;
  let estimatedTokens = 0;

  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i];

    // Apply global filters
    if (config.successOnly && context.trace.trace.status !== "ok") {
      skippedTraces++;
      continue;
    }

    try {
      const converted = format.convert(context, config);
      if (converted.length === 0) {
        skippedTraces++;
      } else {
        exportedTraces++;
        for (const record of converted) {
          if (onRecord) {
            await onRecord(record, totalExamples);
          }
          totalExamples++;
          if (format.estimateTokens) {
            estimatedTokens += format.estimateTokens(record);
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to convert trace ${context.trace.trace.traceId}: ${msg}`);
      skippedTraces++;
    }

    if (onProgress) {
      onProgress(i + 1, contexts.length);
    }

    // Yield to event loop for large batches
    if ((i + 1) % batchSize === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    totalTraces: contexts.length,
    exportedTraces,
    skippedTraces,
    totalExamples,
    estimatedTokens: format.estimateTokens ? estimatedTokens : undefined,
    warnings,
  };
}

/**
 * Validate export records
 *
 * @example
 * ```typescript
 * const result = exportTraces(traces, 'openai-ft');
 * const validation = validateExport(result.records, 'openai-ft');
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */
export function validateExport<TRecord>(
  records: TRecord[],
  formatName: string
): { valid: boolean; errors: string[]; invalidIndices: number[] } {
  const format = exportRegistry.get<TRecord>(formatName);
  if (!format) {
    throw new Error(`Unknown export format '${formatName}'`);
  }

  if (!format.validate) {
    return { valid: true, errors: [], invalidIndices: [] };
  }

  const errors: string[] = [];
  const invalidIndices: number[] = [];

  for (let i = 0; i < records.length; i++) {
    const result = format.validate(records[i]);
    if (!result.valid) {
      invalidIndices.push(i);
      for (const error of result.errors) {
        errors.push(`Record ${i}: ${error}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    invalidIndices,
  };
}

/**
 * Parse exported content back to records
 *
 * @example
 * ```typescript
 * const content = fs.readFileSync('training.jsonl', 'utf-8');
 * const records = parseExport(content, 'openai-ft');
 * ```
 */
export function parseExport<TRecord>(
  content: string,
  formatName: string
): TRecord[] {
  const format = exportRegistry.get<TRecord>(formatName);
  if (!format) {
    throw new Error(`Unknown export format '${formatName}'`);
  }

  if (!format.parse) {
    throw new Error(`Format '${formatName}' does not support parsing`);
  }

  return format.parse(content);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract messages from a trace for conversation-based formats
 */
export function extractMessages(
  trace: TraceWithSpans,
  config: BaseExportConfig = {}
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // Add system prompt if configured
  if (config.includeSystemPrompt && config.systemPrompt) {
    messages.push({ role: "system", content: config.systemPrompt });
  }

  // Flatten and sort spans by timestamp
  const allSpans = flattenSpans(trace.spans);
  const filteredSpans = filterSpans(allSpans, config);

  for (const span of filteredSpans) {
    if (span.spanType === "generation") {
      if (span.input) {
        messages.push({ role: "user", content: span.input });
      }
      if (span.output) {
        messages.push({ role: "assistant", content: span.output });
      }
    }
  }

  return messages;
}

/**
 * Extract prompt-completion pairs from a trace
 */
export function extractPromptCompletions(
  trace: TraceWithSpans,
  config: BaseExportConfig = {}
): Array<{ prompt: string; completion: string }> {
  const pairs: Array<{ prompt: string; completion: string }> = [];

  const allSpans = flattenSpans(trace.spans);
  const filteredSpans = filterSpans(allSpans, config);

  for (const span of filteredSpans) {
    if (span.spanType === "generation" && span.input && span.output) {
      let prompt = span.input;

      // Prepend system prompt if configured
      if (config.includeSystemPrompt && config.systemPrompt) {
        prompt = `${config.systemPrompt}\n\n${prompt}`;
      }

      pairs.push({ prompt, completion: span.output });
    }
  }

  return pairs;
}

/**
 * Flatten span tree into ordered array by timestamp
 */
export function flattenSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
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

  return result.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Filter spans based on configuration
 */
export function filterSpans(
  spans: SpanWithChildren[],
  config: BaseExportConfig = {}
): SpanWithChildren[] {
  return spans.filter((span) => {
    if (config.spanTypes && !config.spanTypes.includes(span.spanType)) {
      return false;
    }
    if (config.componentTypes && span.componentType) {
      if (!config.componentTypes.includes(span.componentType)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Estimate token count using a simple heuristic
 * (approximately 4 characters per token for English text)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to a maximum length while preserving word boundaries
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}
