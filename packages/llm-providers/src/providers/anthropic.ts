/**
 * Anthropic Provider
 *
 * Extracted from temporal-workers/src/activities/llm-call.ts.
 * Uses @anthropic-ai/sdk for direct Anthropic API access.
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
} from "../types.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: unknown;

  constructor(private apiKey?: string) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const Anthropic = await this.loadSDK();
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.apiKey || process.env.ANTHROPIC_API_KEY,
      });
    }
    const anthropic = this.client as InstanceType<typeof Anthropic>;

    // Convert messages to Anthropic format
    const messages = request.messages.map((m) => {
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
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Record<string, unknown>,
    }));

    const createParams: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };

    if (request.temperature !== undefined) {
      createParams.temperature = request.temperature;
    }

    if (request.systemPrompt) {
      createParams.system = request.systemPrompt;
    }

    if (tools && tools.length > 0) {
      createParams.tools = tools;
    }

    const response = await (anthropic as any).messages.create(createParams);

    // Extract text content
    const textContent = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    // Extract tool calls
    const toolCalls: LLMToolCall[] = response.content
      .filter((c: any) => c.type === "tool_use")
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        arguments: c.input as Record<string, unknown>,
      }));

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: request.model,
    };
  }

  private async loadSDK() {
    try {
      const mod = await import("@anthropic-ai/sdk");
      return mod.default;
    } catch {
      throw new Error(
        'Anthropic provider requires the "@anthropic-ai/sdk" package. Install it: bun add @anthropic-ai/sdk'
      );
    }
  }
}
