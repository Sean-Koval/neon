/**
 * LLM Call Activity
 *
 * Makes calls to LLM providers (Anthropic, OpenAI) with automatic retry.
 * Emits generation spans to the data layer.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallParams, LLMCallResult, ToolCall } from "../types";
import { emitSpan } from "./emit-span";

/**
 * Make an LLM call with automatic span emission
 *
 * This activity:
 * 1. Calls the LLM provider
 * 2. Emits a generation span with input/output/tokens
 * 3. Returns the response with any tool calls
 *
 * Temporal handles retries automatically on failure.
 */
export async function llmCall(params: LLMCallParams): Promise<LLMCallResult> {
  const startTime = Date.now();
  const spanId = `span-${crypto.randomUUID()}`;

  try {
    // Currently supports Anthropic (Claude)
    // Can be extended to support OpenAI, etc.
    const result = await callAnthropic(params);

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
 * Call Anthropic Claude API
 */
async function callAnthropic(params: LLMCallParams): Promise<{
  content: string;
  toolCalls?: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}> {
  const anthropic = new Anthropic();

  // Convert messages to Anthropic format
  const messages = params.messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: m.toolCallId!,
            content: m.content,
          },
        ],
      };
    }
    return {
      role: m.role as "user" | "assistant",
      content: m.content,
    };
  });

  // Convert tools to Anthropic format
  const tools = params.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool["input_schema"],
  }));

  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: 4096,
    messages,
    tools: tools.length > 0 ? tools : undefined,
  });

  // Extract text content
  const textContent = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  // Extract tool calls
  const toolCalls = response.content
    .filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use")
    .map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.input as Record<string, unknown>,
    }));

  return {
    content: textContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
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
  // Approximate prices per 1M tokens (as of 2024)
  const prices: Record<string, { input: number; output: number }> = {
    "claude-3-5-sonnet": { input: 3, output: 15 },
    "claude-3-opus": { input: 15, output: 75 },
    "claude-3-sonnet": { input: 3, output: 15 },
    "claude-3-haiku": { input: 0.25, output: 1.25 },
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-4o": { input: 5, output: 15 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
  };

  const price = prices[model] || { input: 1, output: 3 };

  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
