/**
 * Framework Auto-Instrumentation
 *
 * Provides automatic tracing for popular AI framework clients.
 * Import individual integrations or use this barrel export.
 *
 * @example
 * ```typescript
 * import { instrumentOpenAI, instrumentAnthropic } from '@neon/sdk/integrations';
 *
 * instrumentOpenAI(openaiClient);
 * instrumentAnthropic(anthropicClient);
 * ```
 */

export { instrumentOpenAI } from "./openai.js";
export { instrumentAnthropic } from "./anthropic.js";
