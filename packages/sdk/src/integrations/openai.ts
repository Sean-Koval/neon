/**
 * OpenAI Auto-Instrumentation
 *
 * Wraps an OpenAI client to automatically create generation spans
 * for chat completion calls, capturing model, tokens, and content.
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { instrumentOpenAI } from '@neon/sdk/integrations';
 *
 * const client = new OpenAI();
 * instrumentOpenAI(client);
 *
 * // All chat completions are now automatically traced
 * const response = await client.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */

import { generation } from "../tracing/index.js";

interface OpenAILikeClient {
  chat: {
    completions: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
}

interface ChatCompletionResult {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

/**
 * Instrument an OpenAI client for automatic tracing.
 *
 * Wraps `client.chat.completions.create` to emit generation spans.
 */
export function instrumentOpenAI(
  client: OpenAILikeClient,
  options?: { captureContent?: boolean }
): void {
  const captureContent = options?.captureContent ?? true;
  const originalCreate = client.chat.completions.create;

  client.chat.completions.create = async function (...args: unknown[]): Promise<unknown> {
    const params = (args[0] as Record<string, unknown>) ?? {};
    const model = String(params.model ?? "unknown");
    const messages = params.messages;

    const attrs: Record<string, string> = { "gen_ai.system": "openai" };

    if (captureContent && messages) {
      try {
        const prompt = JSON.stringify(messages);
        attrs["gen_ai.prompt"] = prompt.slice(0, 10000);
      } catch {
        // Ignore serialization errors
      }
    }

    return generation(
      `openai:${model}`,
      async () => {
        const startTime = Date.now();
        const result = (await originalCreate.apply(
          client.chat.completions,
          args
        )) as ChatCompletionResult;
        const durationMs = Date.now() - startTime;

        if (result.usage) {
          if (result.usage.prompt_tokens != null) {
            attrs["gen_ai.usage.input_tokens"] = String(result.usage.prompt_tokens);
          }
          if (result.usage.completion_tokens != null) {
            attrs["gen_ai.usage.output_tokens"] = String(result.usage.completion_tokens);
          }
          if (result.usage.total_tokens != null) {
            attrs["gen_ai.usage.total_tokens"] = String(result.usage.total_tokens);
          }
        }

        if (captureContent && result.choices?.[0]?.message?.content) {
          attrs["gen_ai.completion"] = result.choices[0].message.content.slice(0, 10000);
        }

        attrs["gen_ai.duration_ms"] = String(durationMs);

        return result;
      },
      { model, attributes: attrs }
    );
  };
}
