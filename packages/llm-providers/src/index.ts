/**
 * @neon/llm-providers
 *
 * Multi-provider LLM abstraction for Neon.
 * Provider SDKs are optional peer dependencies loaded dynamically.
 */

// Types
export type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  LLMToolDefinition,
  LLMToolCall,
  ProviderConfig,
  ProviderName,
} from "./types.js";

// Factory
export {
  detectProvider,
  resolveProvider,
  createProvider,
  getProvider,
  hasProviderConfigured,
  clearProviderCache,
} from "./factory.js";

// Providers (for direct instantiation)
export { AnthropicProvider } from "./providers/anthropic.js";
export { OpenAIProvider } from "./providers/openai.js";
export { VertexAIProvider } from "./providers/vertex-ai.js";
export { VertexClaudeProvider } from "./providers/vertex-claude.js";
