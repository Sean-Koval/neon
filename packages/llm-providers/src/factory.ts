/**
 * Provider Factory
 *
 * Resolves, creates, and caches LLM provider instances.
 * Auto-detects provider from model name or explicit configuration.
 */

import type { LLMProvider, ProviderConfig, ProviderName } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { VertexAIProvider } from "./providers/vertex-ai.js";
import { VertexClaudeProvider } from "./providers/vertex-claude.js";

// Singleton cache keyed by provider name
const providerCache = new Map<string, LLMProvider>();

/**
 * Detect provider from model name prefix
 */
export function detectProvider(model: string): ProviderName {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1-") || model.startsWith("o3-")) return "openai";
  if (model.startsWith("gemini-") || model.startsWith("meta/") || model.startsWith("google/")) return "vertex-ai";
  // Default to anthropic
  return "anthropic";
}

/**
 * Create a provider instance from config
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey);
    case "openai":
      return new OpenAIProvider(config.apiKey, config.baseUrl);
    case "openai-compatible":
      return new OpenAIProvider(config.apiKey, config.baseUrl || process.env.NEON_LLM_BASE_URL);
    case "vertex-ai":
      return new VertexAIProvider(config.projectId, config.region);
    case "vertex-claude":
      return new VertexClaudeProvider(config.projectId, config.region);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Resolve provider name from env var override, explicit config, or model auto-detection
 */
export function resolveProvider(model: string, config?: ProviderConfig): ProviderName {
  // Explicit config takes priority
  if (config?.provider) return config.provider;

  // Env var override
  const envProvider = process.env.NEON_LLM_PROVIDER;
  if (envProvider) {
    const valid: ProviderName[] = ["anthropic", "openai", "vertex-ai", "vertex-claude", "openai-compatible"];
    if (!valid.includes(envProvider as ProviderName)) {
      throw new Error(
        `Invalid NEON_LLM_PROVIDER "${envProvider}". Valid values: ${valid.join(", ")}`
      );
    }
    return envProvider as ProviderName;
  }

  // Auto-detect from model name
  return detectProvider(model);
}

/**
 * Get or create a cached provider for the given model
 */
export function getProvider(model: string, config?: ProviderConfig): LLMProvider {
  const providerName = resolveProvider(model, config);

  // Build cache key from provider name + distinguishing config
  const cacheKey = config?.baseUrl
    ? `${providerName}:${config.baseUrl}`
    : providerName;

  let provider = providerCache.get(cacheKey);
  if (!provider) {
    provider = createProvider({
      provider: providerName,
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      projectId: config?.projectId,
      region: config?.region,
    });
    providerCache.set(cacheKey, provider);
  }

  return provider;
}

/**
 * Check if any LLM provider is configured (has required credentials)
 */
export function hasProviderConfigured(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.NEON_LLM_BASE_URL
  );
}

/**
 * Clear the provider cache (useful for testing)
 */
export function clearProviderCache(): void {
  providerCache.clear();
}
