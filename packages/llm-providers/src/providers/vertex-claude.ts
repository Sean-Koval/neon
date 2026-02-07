/**
 * Vertex Claude Provider
 *
 * Claude models on Google Cloud Vertex AI via @anthropic-ai/vertex-sdk.
 * Same Anthropic message format, but authenticated via GCP.
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
} from "../types.js";

export class VertexClaudeProvider implements LLMProvider {
  readonly name = "vertex-claude";
  private client: unknown;

  constructor(
    private projectId?: string,
    private region?: string,
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const AnthropicVertex = await this.loadSDK();

    const project = this.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID;
    const location = this.region || process.env.GOOGLE_CLOUD_REGION || "us-central1";

    if (!project) {
      throw new Error(
        "Vertex Claude provider requires a GCP project ID. " +
        "Set GOOGLE_CLOUD_PROJECT env var or pass projectId in config."
      );
    }

    if (!this.client) {
      this.client = new AnthropicVertex({
        projectId: project,
        region: location,
      });
    }
    const anthropic = this.client as any;

    // Convert messages to Anthropic format (same as direct Anthropic)
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

    const response = await anthropic.messages.create(createParams);

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
      // @ts-expect-error - @anthropic-ai/vertex-sdk is an optional peer dependency
      const mod = await import("@anthropic-ai/vertex-sdk");
      return mod.default;
    } catch {
      throw new Error(
        'Vertex Claude provider requires the "@anthropic-ai/vertex-sdk" package. Install it: bun add @anthropic-ai/vertex-sdk'
      );
    }
  }
}
