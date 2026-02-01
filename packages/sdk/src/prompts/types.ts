/**
 * Prompt Types
 *
 * Types for prompt versioning and management.
 */

/**
 * Prompt variable definition
 */
export interface PromptVariable {
  name: string;
  description?: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  default?: unknown;
}

/**
 * Prompt message in a chat prompt
 */
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Prompt configuration
 */
export interface PromptConfig {
  /** Model to use (optional, can be overridden at runtime) */
  model?: string;
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Additional model parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Base prompt definition
 */
export interface PromptBase {
  /** Unique name for the prompt */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Template type: "text" for simple string, "chat" for message array */
  type: "text" | "chat";
  /** Template content (for text type) */
  template?: string;
  /** Messages (for chat type) */
  messages?: PromptMessage[];
  /** Variables that can be interpolated */
  variables?: PromptVariable[];
  /** Default model configuration */
  config?: PromptConfig;
  /** Tags for categorization */
  tags?: string[];
  /** Whether this is a production-ready prompt */
  isProduction?: boolean;
}

/**
 * Prompt with version info
 */
export interface Prompt extends PromptBase {
  /** Unique identifier */
  id: string;
  /** Project ID */
  projectId: string;
  /** Version number (incrementing) */
  version: number;
  /** Commit message for this version */
  commitMessage?: string;
  /** Who created this version */
  createdBy?: string;
  /** When this version was created */
  createdAt: Date;
  /** When this version was last updated */
  updatedAt: Date;
  /** Parent version ID (for version history) */
  parentVersionId?: string;
  /** A/B testing variant name */
  variant?: string;
}

/**
 * Create prompt request
 */
export interface CreatePromptRequest extends PromptBase {
  /** Project ID (optional, defaults to configured project) */
  projectId?: string;
  /** Initial commit message */
  commitMessage?: string;
}

/**
 * Update prompt request (creates a new version)
 */
export interface UpdatePromptRequest {
  /** Prompt name or ID */
  nameOrId: string;
  /** Updated fields */
  updates: Partial<PromptBase>;
  /** Commit message for this version */
  commitMessage?: string;
}

/**
 * Get prompt request
 */
export interface GetPromptRequest {
  /** Prompt name or ID */
  nameOrId: string;
  /** Specific version (optional, defaults to latest) */
  version?: number;
  /** A/B testing variant (optional, defaults to 'control') */
  variant?: string;
}

/**
 * List prompts request
 */
export interface ListPromptsRequest {
  /** Project ID (optional) */
  projectId?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by production status */
  isProduction?: boolean;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Prompt version history entry
 */
export interface PromptVersionEntry {
  id: string;
  version: number;
  commitMessage?: string;
  createdBy?: string;
  createdAt: Date;
  changes?: string[];
}

/**
 * Prompt execution context
 */
export interface PromptExecutionContext {
  /** Variable values */
  variables: Record<string, unknown>;
  /** Optional config overrides */
  config?: Partial<PromptConfig>;
  /** Trace ID for linking to evaluations */
  traceId?: string;
}

/**
 * Compiled prompt ready for execution
 */
export interface CompiledPrompt {
  /** Prompt ID */
  promptId: string;
  /** Prompt version */
  version: number;
  /** Resolved content (for text type) */
  content?: string;
  /** Resolved messages (for chat type) */
  messages?: PromptMessage[];
  /** Resolved config */
  config: PromptConfig;
  /** Variables that were used */
  usedVariables: string[];
}
