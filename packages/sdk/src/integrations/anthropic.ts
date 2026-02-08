/**
 * Anthropic Auto-Instrumentation
 *
 * Wraps an Anthropic client to automatically create generation spans
 * for message creation calls, capturing model, tokens, and content.
 *
 * @example
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { instrumentAnthropic } from '@neon/sdk/integrations';
 *
 * const client = new Anthropic();
 * instrumentAnthropic(client);
 *
 * // All message creations are now automatically traced
 * const response = await client.messages.create({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 * ```
 */

import { generation } from "../tracing/index.js";

interface AnthropicLikeClient {
  messages: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface MessageResult {
  content?: ContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  model?: string;
}

/**
 * Instrument an Anthropic client for automatic tracing.
 *
 * Wraps `client.messages.create` to emit generation spans.
 */
export function instrumentAnthropic(
  client: AnthropicLikeClient,
  options?: { captureContent?: boolean }
): void {
  const captureContent = options?.captureContent ?? true;
  const originalCreate = client.messages.create;

  client.messages.create = async function (...args: unknown[]): Promise<unknown> {
    const params = (args[0] as Record<string, unknown>) ?? {};
    const model = String(params.model ?? "unknown");
    const messages = params.messages;
    const system = params.system;

    const attrs: Record<string, string> = { "gen_ai.system": "anthropic" };

    if (captureContent && messages) {
      try {
        const prompt = JSON.stringify(messages);
        attrs["gen_ai.prompt"] = prompt.slice(0, 10000);
      } catch {
        // Ignore serialization errors
      }
    }

    if (captureContent && system) {
      try {
        attrs["gen_ai.system_prompt"] = String(system).slice(0, 5000);
      } catch {
        // Ignore
      }
    }

    return generation(
      `anthropic:${model}`,
      async () => {
        const startTime = Date.now();
        const result = (await originalCreate.apply(
          client.messages,
          args
        )) as MessageResult;
        const durationMs = Date.now() - startTime;

        if (result.usage) {
          if (result.usage.input_tokens != null) {
            attrs["gen_ai.usage.input_tokens"] = String(result.usage.input_tokens);
          }
          if (result.usage.output_tokens != null) {
            attrs["gen_ai.usage.output_tokens"] = String(result.usage.output_tokens);
          }
        }

        if (captureContent && result.content) {
          try {
            const texts = result.content
              .filter((b) => b.type === "text" && b.text)
              .map((b) => b.text!);
            if (texts.length > 0) {
              attrs["gen_ai.completion"] = texts.join("\n").slice(0, 10000);
            }
          } catch {
            // Ignore
          }
        }

        attrs["gen_ai.duration_ms"] = String(durationMs);

        return result;
      },
      { model, attributes: attrs }
    );
  };
}
