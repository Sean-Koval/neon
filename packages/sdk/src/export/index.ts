/**
 * Export Utilities
 *
 * Export traces in various formats for training and analysis.
 *
 * Built-in formats:
 * - `openai-ft` - OpenAI fine-tuning JSONL
 * - `trl-sft` - HuggingFace TRL SFT format
 * - `trl-dpo` - HuggingFace TRL DPO format
 * - `trl-kto` - HuggingFace TRL KTO format
 * - `trl` - Unified TRL format (mode-configurable)
 * - `agent-lightning` - Agent Lightning RL format
 *
 * @example
 * ```typescript
 * import { exportTraces, registerFormat, listFormats } from '@neon/sdk';
 *
 * // Export to OpenAI format
 * const result = exportTraces(traces, 'openai-ft', {
 *   includeSystemPrompt: true,
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * // Export to TRL SFT format
 * const sftResult = exportTraces(traces, 'trl-sft');
 *
 * // List available formats
 * console.log(listFormats());
 * // [{ name: 'openai-ft', ... }, { name: 'trl-sft', ... }, ...]
 *
 * // Register custom format
 * registerFormat({
 *   name: 'my-format',
 *   description: 'My custom format',
 *   extension: '.json',
 *   mimeType: 'application/json',
 *   convert: (ctx, config) => [{ ... }],
 *   serialize: (records) => JSON.stringify(records),
 * });
 * ```
 */

// Generic export system
export {
  // Registry
  exportRegistry,
  registerFormat,
  registerFormatAlias,
  getFormat,
  listFormats,
  // Export functions
  exportTraces,
  exportTracesToFile,
  streamExport,
  validateExport,
  parseExport,
  // Utilities
  extractMessages,
  extractPromptCompletions,
  flattenSpans,
  filterSpans,
  estimateTokenCount,
  truncateText,
  // Types
  type ExportFormat,
  type BaseExportConfig,
  type TraceExportContext,
  type ExportResult,
  type ExportStats,
} from "./generic.js";

// OpenAI fine-tuning format
export {
  openAIFineTuneFormat,
  tracesToOpenAI,
  tracesToOpenAIJSONL,
  parseOpenAIJSONL,
  validateOpenAIExamples,
  type OpenAIRole,
  type OpenAIFunctionCall,
  type OpenAIToolCall,
  type OpenAIMessage,
  type OpenAIFineTuneExample,
  type OpenAIFineTuneConfig,
} from "./openai-ft.js";

// HuggingFace TRL formats
export {
  trlFormat,
  trlSFTFormat,
  trlDPOFormat,
  trlKTOFormat,
  tracesToSFT,
  tracesToDPO,
  tracesToKTO,
  createDPOPairs,
  toTRLJSONL,
  parseTRLJSONL,
  type TRLMode,
  type TRLSFTExample,
  type TRLDPOExample,
  type TRLKTOExample,
  type TRLExample,
  type TRLConfig,
} from "./trl.js";

// Agent Lightning format for RL training
export {
  // Main export functions
  exportToAgentLightning,
  exportBatchToAgentLightning,
  streamExportToAgentLightning,
  // Utility functions
  validateAgentLightningBatch,
  mergeAgentLightningBatches,
  // Types
  type AgentLightningTransition,
  type AgentLightningEpisode,
  type AgentLightningBatch,
  type AgentLightningFilter,
  type AgentLightningExportConfig,
  type ExportContext,
  type ScoreData,
  type StreamExportConfig,
} from "./agent-lightning.js";

// ============================================================================
// Format Registration
// ============================================================================

import { exportRegistry } from "./generic.js";
import { openAIFineTuneFormat } from "./openai-ft.js";
import { trlFormat, trlSFTFormat, trlDPOFormat, trlKTOFormat } from "./trl.js";

// Register built-in formats
exportRegistry.register(openAIFineTuneFormat);
exportRegistry.register(trlFormat);
exportRegistry.register(trlSFTFormat);
exportRegistry.register(trlDPOFormat);
exportRegistry.register(trlKTOFormat);

// Register common aliases
exportRegistry.registerAlias("openai", "openai-ft");
exportRegistry.registerAlias("trl-sftrainer", "trl-sft");
exportRegistry.registerAlias("trl-dpotrainer", "trl-dpo");
exportRegistry.registerAlias("huggingface", "trl-sft");
exportRegistry.registerAlias("hf", "trl-sft");
