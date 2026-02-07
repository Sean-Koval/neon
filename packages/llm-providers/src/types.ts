/**
 * LLM Provider Types
 *
 * Shared interfaces for multi-provider LLM abstraction.
 * These types mirror the existing Message/ToolDefinition/ToolCall types
 * in temporal-workers/src/types.ts for zero-conversion at call sites.
 */

/**
 * Message in a conversation (same shape as temporal-workers Message)
 */
export interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

/**
 * Tool definition (same shape as temporal-workers ToolDefinition)
 */
export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Tool call from LLM response (same shape as temporal-workers ToolCall)
 */
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Request to an LLM provider
 */
export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Response from an LLM provider
 */
export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
}

/**
 * Supported provider identifiers
 */
export type ProviderName =
  | "anthropic"
  | "openai"
  | "vertex-ai"
  | "vertex-claude"
  | "openai-compatible";

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  projectId?: string;
  region?: string;
  defaultModel?: string;
}
