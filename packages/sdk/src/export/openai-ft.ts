/**
 * OpenAI Fine-Tuning Export Format
 *
 * Export traces in OpenAI's fine-tuning JSONL format for training
 * custom models via the OpenAI API.
 *
 * Supports:
 * - Chat completions format (GPT-3.5-turbo, GPT-4)
 * - Function/tool calling format
 * - Multi-turn conversations
 *
 * @see https://platform.openai.com/docs/guides/fine-tuning
 *
 * @example
 * ```typescript
 * import { exportTraces } from '@neon/sdk';
 *
 * const result = exportTraces(traces, 'openai-ft', {
 *   includeSystemPrompt: true,
 *   systemPrompt: 'You are a helpful assistant.',
 *   includeToolCalls: true,
 * });
 *
 * // Write JSONL file for fine-tuning
 * fs.writeFileSync('training.jsonl', result.serialized);
 *
 * // Upload to OpenAI
 * const file = await openai.files.create({
 *   file: fs.createReadStream('training.jsonl'),
 *   purpose: 'fine-tune',
 * });
 * ```
 */

import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";
import type { ExportFormat, BaseExportConfig, TraceExportContext } from "./generic.js";
import { flattenSpans, filterSpans, estimateTokenCount } from "./generic.js";

/**
 * OpenAI message role
 */
export type OpenAIRole = "system" | "user" | "assistant" | "tool";

/**
 * OpenAI function call in a message
 */
export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
}

/**
 * OpenAI tool call in a message
 */
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: OpenAIFunctionCall;
}

/**
 * OpenAI chat message
 */
export interface OpenAIMessage {
  role: OpenAIRole;
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI fine-tuning example (single training example)
 */
export interface OpenAIFineTuneExample {
  messages: OpenAIMessage[];
}

/**
 * Configuration for OpenAI fine-tuning export
 */
export interface OpenAIFineTuneConfig extends BaseExportConfig {
  /** Include tool/function calls in the output */
  includeToolCalls?: boolean;
  /** Include tool outputs/results */
  includeToolOutputs?: boolean;
  /** Extract multi-turn conversations from spans */
  extractConversations?: boolean;
  /** Minimum messages required for a valid example */
  minMessages?: number;
  /** Maximum messages per example (truncate if exceeded) */
  maxMessages?: number;
  /** Model type for format compatibility ('gpt-3.5-turbo' | 'gpt-4') */
  modelType?: "gpt-3.5-turbo" | "gpt-4" | "gpt-4o";
  /** Custom tool name prefix (for namespacing) */
  toolNamePrefix?: string;
}

/**
 * Convert a tool span to OpenAI tool call messages
 */
function toolSpanToMessages(
  span: SpanWithChildren,
  config: OpenAIFineTuneConfig
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  const toolName = config.toolNamePrefix
    ? `${config.toolNamePrefix}_${span.toolName || span.name}`
    : span.toolName || span.name;

  const toolCallId = `call_${span.spanId.slice(0, 24)}`;

  // Assistant message with tool call
  if (config.includeToolCalls !== false) {
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          type: "function",
          function: {
            name: toolName,
            arguments: span.toolInput || span.input || "{}",
          },
        },
      ],
    });
  }

  // Tool output message
  if (config.includeToolOutputs !== false && (span.toolOutput || span.output)) {
    messages.push({
      role: "tool",
      content: span.toolOutput || span.output || "",
      tool_call_id: toolCallId,
    });
  }

  return messages;
}

/**
 * Convert a generation span to OpenAI messages
 */
function generationSpanToMessages(
  span: SpanWithChildren,
  _config: OpenAIFineTuneConfig
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  if (span.input) {
    messages.push({
      role: "user",
      content: span.input,
    });
  }

  if (span.output) {
    messages.push({
      role: "assistant",
      content: span.output,
    });
  }

  return messages;
}

/**
 * Convert a trace to OpenAI fine-tuning example(s)
 */
function convertTrace(
  context: TraceExportContext,
  config: OpenAIFineTuneConfig
): OpenAIFineTuneExample[] {
  const { trace } = context;
  const messages: OpenAIMessage[] = [];

  // Add system prompt if configured
  if (config.includeSystemPrompt && config.systemPrompt) {
    messages.push({
      role: "system",
      content: config.systemPrompt,
    });
  }

  // Flatten and filter spans
  const allSpans = flattenSpans(trace.spans);
  const defaultSpanTypes = config.includeToolCalls !== false
    ? ["generation", "tool"]
    : ["generation"];
  const filteredSpans = filterSpans(allSpans, {
    ...config,
    spanTypes: config.spanTypes ?? defaultSpanTypes,
  });

  // Convert spans to messages
  for (const span of filteredSpans) {
    if (span.spanType === "tool") {
      messages.push(...toolSpanToMessages(span, config));
    } else if (span.spanType === "generation") {
      messages.push(...generationSpanToMessages(span, config));
    }
  }

  // Apply minimum message filter
  const minMessages = config.minMessages ?? 2;
  if (messages.length < minMessages) {
    return [];
  }

  // Apply maximum message limit
  const maxMessages = config.maxMessages;
  const finalMessages = maxMessages && messages.length > maxMessages
    ? messages.slice(0, maxMessages)
    : messages;

  // Validate we have at least user + assistant
  const hasUser = finalMessages.some((m) => m.role === "user");
  const hasAssistant = finalMessages.some(
    (m) => m.role === "assistant" && (m.content || m.tool_calls)
  );

  if (!hasUser || !hasAssistant) {
    return [];
  }

  return [{ messages: finalMessages }];
}

/**
 * Serialize examples to JSONL format
 */
function serialize(
  records: OpenAIFineTuneExample[],
  _config: OpenAIFineTuneConfig
): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

/**
 * Parse JSONL content back to examples
 */
function parse(content: string): OpenAIFineTuneExample[] {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as OpenAIFineTuneExample);
}

/**
 * Validate a single example
 */
function validate(
  record: OpenAIFineTuneExample
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record.messages || !Array.isArray(record.messages)) {
    errors.push("messages must be an array");
    return { valid: false, errors };
  }

  if (record.messages.length < 2) {
    errors.push("messages must have at least 2 entries");
  }

  const hasUser = record.messages.some((m) => m.role === "user");
  const hasAssistant = record.messages.some((m) => m.role === "assistant");

  if (!hasUser) {
    errors.push("messages must include at least one user message");
  }

  if (!hasAssistant) {
    errors.push("messages must include at least one assistant message");
  }

  // Validate individual messages
  for (let i = 0; i < record.messages.length; i++) {
    const msg = record.messages[i];

    if (!msg.role) {
      errors.push(`messages[${i}]: missing role`);
    }

    if (msg.role === "assistant" && msg.content === undefined && !msg.tool_calls) {
      errors.push(`messages[${i}]: assistant message must have content or tool_calls`);
    }

    if (msg.role === "tool" && !msg.tool_call_id) {
      errors.push(`messages[${i}]: tool message must have tool_call_id`);
    }

    // Validate tool_calls structure
    if (msg.tool_calls) {
      for (let j = 0; j < msg.tool_calls.length; j++) {
        const tc = msg.tool_calls[j];
        if (!tc.id) {
          errors.push(`messages[${i}].tool_calls[${j}]: missing id`);
        }
        if (tc.type !== "function") {
          errors.push(`messages[${i}].tool_calls[${j}]: type must be 'function'`);
        }
        if (!tc.function?.name) {
          errors.push(`messages[${i}].tool_calls[${j}]: missing function.name`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Estimate token count for an example
 */
function estimateTokens(record: OpenAIFineTuneExample): number {
  let total = 0;

  for (const msg of record.messages) {
    // Role overhead (~4 tokens)
    total += 4;

    if (msg.content) {
      total += estimateTokenCount(msg.content);
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokenCount(tc.function.name);
        total += estimateTokenCount(tc.function.arguments);
      }
    }
  }

  // Format overhead
  total += 3;

  return total;
}

/**
 * OpenAI fine-tuning format definition
 */
export const openAIFineTuneFormat: ExportFormat<OpenAIFineTuneExample, OpenAIFineTuneConfig> = {
  name: "openai-ft",
  description: "OpenAI fine-tuning JSONL format for chat completions",
  extension: ".jsonl",
  mimeType: "application/jsonl",
  convert: convertTrace,
  serialize,
  parse,
  validate,
  estimateTokens,
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Convert traces directly to OpenAI fine-tuning examples
 *
 * @example
 * ```typescript
 * const examples = tracesToOpenAI(traces, {
 *   systemPrompt: 'You are a helpful assistant.',
 *   includeToolCalls: true,
 * });
 * ```
 */
export function tracesToOpenAI(
  traces: TraceWithSpans[],
  config: OpenAIFineTuneConfig = {}
): OpenAIFineTuneExample[] {
  const examples: OpenAIFineTuneExample[] = [];

  for (const trace of traces) {
    if (config.successOnly && trace.trace.status !== "ok") {
      continue;
    }
    examples.push(...convertTrace({ trace }, config));
  }

  return examples;
}

/**
 * Convert traces to JSONL string for OpenAI fine-tuning
 *
 * @example
 * ```typescript
 * const jsonl = tracesToOpenAIJSONL(traces, {
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * fs.writeFileSync('training.jsonl', jsonl);
 * ```
 */
export function tracesToOpenAIJSONL(
  traces: TraceWithSpans[],
  config: OpenAIFineTuneConfig = {}
): string {
  const examples = tracesToOpenAI(traces, config);
  return serialize(examples, config);
}

/**
 * Parse OpenAI JSONL content
 */
export function parseOpenAIJSONL(content: string): OpenAIFineTuneExample[] {
  return parse(content);
}

/**
 * Validate OpenAI fine-tuning examples
 */
export function validateOpenAIExamples(
  examples: OpenAIFineTuneExample[]
): { valid: boolean; errors: string[]; invalidIndices: number[] } {
  const errors: string[] = [];
  const invalidIndices: number[] = [];

  for (let i = 0; i < examples.length; i++) {
    const result = validate(examples[i]);
    if (!result.valid) {
      invalidIndices.push(i);
      for (const error of result.errors) {
        errors.push(`Example ${i}: ${error}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, invalidIndices };
}
