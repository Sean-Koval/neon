/**
 * LLM Call Activity
 *
 * Makes calls to LLM providers with automatic retry.
 * Emits generation spans to the data layer.
 *
 * Supports Anthropic, OpenAI, Google Vertex AI (Gemini), and
 * OpenAI-compatible endpoints via @neon/llm-providers.
 */

import { getProvider } from "@neon/llm-providers";
import type { LLMCallParams, LLMCallResult } from "../types";
import { emitSpan } from "./emit-span";

/**
 * Make an LLM call with automatic span emission
 *
 * This activity:
 * 1. Calls the LLM provider (auto-detected from model name)
 * 2. Emits a generation span with input/output/tokens
 * 3. Returns the response with any tool calls
 *
 * Temporal handles retries automatically on failure.
 */
export async function llmCall(params: LLMCallParams): Promise<LLMCallResult> {
  const startTime = Date.now();
  const spanId = `span-${crypto.randomUUID()}`;

  try {
    const provider = getProvider(params.model);
    const result = await provider.chat({
      model: params.model,
      messages: params.messages,
      tools: params.tools.length > 0 ? params.tools : undefined,
      maxTokens: 4096,
    });

    // Emit success span
    await emitSpan({
      traceId: params.traceId,
      spanId,
      spanType: "generation",
      name: `llm:${params.model}`,
      input: JSON.stringify(params.messages),
      output: result.content,
      model: params.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: Date.now() - startTime,
      status: "ok",
    });

    return {
      content: result.content,
      toolCalls: result.toolCalls,
    };
  } catch (error) {
    // Emit error span
    await emitSpan({
      traceId: params.traceId,
      spanId,
      spanType: "generation",
      name: `llm:${params.model}`,
      input: JSON.stringify(params.messages),
      durationMs: Date.now() - startTime,
      status: "error",
      statusMessage: error instanceof Error ? error.message : "Unknown error",
    });

    // Re-throw for Temporal to handle retry
    throw error;
  }
}

/**
 * Estimate cost for LLM call
 *
 * Prices are approximate and should be updated periodically
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Approximate prices per 1M tokens
  const prices: Record<string, { input: number; output: number }> = {
    // Anthropic
    "claude-3-5-sonnet": { input: 3, output: 15 },
    "claude-3-opus": { input: 15, output: 75 },
    "claude-3-sonnet": { input: 3, output: 15 },
    "claude-3-haiku": { input: 0.25, output: 1.25 },
    // OpenAI
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-4o": { input: 5, output: 15 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    // Google Gemini
    "gemini-1.5-pro": { input: 3.5, output: 10.5 },
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  };

  const price = prices[model] || { input: 1, output: 3 };

  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
