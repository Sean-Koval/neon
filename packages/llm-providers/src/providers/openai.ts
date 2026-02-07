/**
 * OpenAI Provider
 *
 * Supports OpenAI API and OpenAI-compatible endpoints
 * (vLLM, Ollama, LiteLLM, etc.) via baseUrl override.
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
} from "../types.js";

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  private client: unknown;

  constructor(
    private apiKey?: string,
    private baseUrl?: string,
  ) {
    this.name = baseUrl ? "openai-compatible" : "openai";
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const OpenAI = await this.loadSDK();
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey || process.env.OPENAI_API_KEY,
        baseURL: this.baseUrl || process.env.OPENAI_BASE_URL || undefined,
      });
    }
    const openai = this.client as any;

    // Build messages array
    const messages: any[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const m of request.messages) {
      if (m.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.content,
        });
      } else {
        messages.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    // Convert tools to OpenAI format
    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const createParams: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    if (request.maxTokens !== undefined) {
      createParams.max_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      createParams.temperature = request.temperature;
    }

    if (tools && tools.length > 0) {
      createParams.tools = tools;
    }

    const response = await openai.chat.completions.create(createParams);

    const choice = response.choices[0];
    const content = choice.message.content || "";

    // Extract tool calls
    let toolCalls: LLMToolCall[] | undefined;
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map((tc: any) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { _raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        };
      });
    }

    return {
      content,
      toolCalls,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: request.model,
    };
  }

  private async loadSDK() {
    try {
      // @ts-expect-error - openai is an optional peer dependency
      const mod = await import("openai");
      return mod.default;
    } catch {
      throw new Error(
        'OpenAI provider requires the "openai" package. Install it: bun add openai'
      );
    }
  }
}
