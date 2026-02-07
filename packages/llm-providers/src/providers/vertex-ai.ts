/**
 * Google Vertex AI Provider
 *
 * Supports Gemini, Llama, and Gemma models on Google Cloud Vertex AI.
 * Uses @google-cloud/vertexai SDK.
 */

import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
} from "../types.js";

export class VertexAIProvider implements LLMProvider {
  readonly name = "vertex-ai";
  private client: unknown;

  constructor(
    private projectId?: string,
    private region?: string,
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const { VertexAI } = await this.loadSDK();

    const project = this.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID;
    const location = this.region || process.env.GOOGLE_CLOUD_REGION || "us-central1";

    if (!project) {
      throw new Error(
        "Vertex AI provider requires a GCP project ID. " +
        "Set GOOGLE_CLOUD_PROJECT env var or pass projectId in config."
      );
    }

    if (!this.client) {
      this.client = new VertexAI({ project, location });
    }
    const vertexAI = this.client as any;

    const generativeModel = vertexAI.getGenerativeModel({
      model: request.model,
    });

    // Build contents array
    const contents: any[] = [];

    for (const m of request.messages) {
      if (m.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: m.content }],
        });
      } else if (m.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text: m.content }],
        });
      } else if (m.role === "tool") {
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.toolCallId || "tool_response",
                response: { content: m.content },
              },
            },
          ],
        });
      }
    }

    // Convert tools to Vertex AI format
    const tools = request.tools?.length
      ? [
          {
            functionDeclarations: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

    const generateParams: Record<string, unknown> = { contents };

    if (tools) {
      generateParams.tools = tools;
    }

    if (request.systemPrompt) {
      generateParams.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (Object.keys(generationConfig).length > 0) {
      generateParams.generationConfig = generationConfig;
    }

    const response = await generativeModel.generateContent(generateParams);
    const result = response.response;

    // Extract text and tool calls
    let content = "";
    const toolCalls: LLMToolCall[] = [];

    const candidates = result.candidates || [];
    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.text) {
          content += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `fc-${crypto.randomUUID()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }
    }

    // Token usage from metadata
    const usageMetadata = result.usageMetadata || {};

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: usageMetadata.promptTokenCount ?? 0,
      outputTokens: usageMetadata.candidatesTokenCount ?? 0,
      model: request.model,
    };
  }

  private async loadSDK(): Promise<any> {
    try {
      // @ts-expect-error - @google-cloud/vertexai is an optional peer dependency
      return await import("@google-cloud/vertexai");
    } catch {
      throw new Error(
        'Vertex AI provider requires the "@google-cloud/vertexai" package. Install it: bun add @google-cloud/vertexai'
      );
    }
  }
}
