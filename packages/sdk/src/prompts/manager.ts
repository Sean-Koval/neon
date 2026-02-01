/**
 * Prompt Manager
 *
 * Handles prompt compilation, variable interpolation, and version management.
 */

import type {
  CompiledPrompt,
  Prompt,
  PromptBase,
  PromptConfig,
  PromptExecutionContext,
  PromptMessage,
  PromptVariable,
} from "./types.js";

/**
 * Variable interpolation pattern: {{variableName}}
 */
const VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Prompt Manager for compiling and managing prompts
 */
export class PromptManager {
  private prompts: Map<string, Prompt[]> = new Map();

  /**
   * Register a prompt locally (for testing/development)
   */
  register(prompt: Prompt): void {
    const versions = this.prompts.get(prompt.name) || [];
    versions.push(prompt);
    // Sort by version descending
    versions.sort((a, b) => b.version - a.version);
    this.prompts.set(prompt.name, versions);
  }

  /**
   * Get a prompt by name and optionally version
   */
  get(name: string, version?: number): Prompt | undefined {
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) {
      return undefined;
    }

    if (version !== undefined) {
      return versions.find((p) => p.version === version);
    }

    // Return latest version
    return versions[0];
  }

  /**
   * Get all versions of a prompt
   */
  getVersions(name: string): Prompt[] {
    return this.prompts.get(name) || [];
  }

  /**
   * Compile a prompt with variables
   */
  compile(prompt: Prompt, context: PromptExecutionContext): CompiledPrompt {
    const usedVariables: string[] = [];

    // Merge configs (context overrides prompt defaults)
    const config: PromptConfig = {
      ...prompt.config,
      ...context.config,
    };

    if (prompt.type === "text") {
      const content = this.interpolate(
        prompt.template || "",
        prompt.variables || [],
        context.variables,
        usedVariables
      );

      return {
        promptId: prompt.id,
        version: prompt.version,
        content,
        config,
        usedVariables,
      };
    }

    // Chat type
    const messages: PromptMessage[] = (prompt.messages || []).map((msg) => ({
      role: msg.role,
      content: this.interpolate(
        msg.content,
        prompt.variables || [],
        context.variables,
        usedVariables
      ),
    }));

    return {
      promptId: prompt.id,
      version: prompt.version,
      messages,
      config,
      usedVariables,
    };
  }

  /**
   * Interpolate variables into a template string
   */
  private interpolate(
    template: string,
    variableDefs: PromptVariable[],
    values: Record<string, unknown>,
    usedVariables: string[]
  ): string {
    return template.replace(VARIABLE_PATTERN, (match, varName) => {
      usedVariables.push(varName);

      // Check if value is provided
      if (varName in values) {
        const value = values[varName];
        return this.stringify(value);
      }

      // Check for default value
      const varDef = variableDefs.find((v) => v.name === varName);
      if (varDef?.default !== undefined) {
        return this.stringify(varDef.default);
      }

      // Check if required
      if (varDef?.required) {
        throw new Error(`Missing required variable: ${varName}`);
      }

      // Return empty string for optional variables without default
      return "";
    });
  }

  /**
   * Convert a value to string for interpolation
   */
  private stringify(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Validate a prompt definition
   */
  validate(prompt: PromptBase): string[] {
    const errors: string[] = [];

    if (!prompt.name || prompt.name.trim() === "") {
      errors.push("Prompt name is required");
    }

    if (!prompt.type || !["text", "chat"].includes(prompt.type)) {
      errors.push("Prompt type must be 'text' or 'chat'");
    }

    if (prompt.type === "text" && !prompt.template) {
      errors.push("Text prompts require a template");
    }

    if (prompt.type === "chat" && (!prompt.messages || prompt.messages.length === 0)) {
      errors.push("Chat prompts require at least one message");
    }

    // Validate variable definitions
    if (prompt.variables) {
      for (const v of prompt.variables) {
        if (!v.name || v.name.trim() === "") {
          errors.push("Variable name is required");
        }
        if (!v.type || !["string", "number", "boolean", "object", "array"].includes(v.type)) {
          errors.push(`Invalid variable type for ${v.name}`);
        }
      }
    }

    return errors;
  }

  /**
   * Extract variables from a template
   */
  extractVariables(template: string): string[] {
    const matches = template.matchAll(VARIABLE_PATTERN);
    const variables = new Set<string>();
    for (const match of matches) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  }

  /**
   * Create a diff between two prompt versions
   */
  diff(oldPrompt: Prompt, newPrompt: Prompt): string[] {
    const changes: string[] = [];

    if (oldPrompt.description !== newPrompt.description) {
      changes.push("description changed");
    }

    if (oldPrompt.template !== newPrompt.template) {
      changes.push("template modified");
    }

    if (JSON.stringify(oldPrompt.messages) !== JSON.stringify(newPrompt.messages)) {
      changes.push("messages modified");
    }

    if (JSON.stringify(oldPrompt.variables) !== JSON.stringify(newPrompt.variables)) {
      changes.push("variables modified");
    }

    if (JSON.stringify(oldPrompt.config) !== JSON.stringify(newPrompt.config)) {
      changes.push("config modified");
    }

    if (JSON.stringify(oldPrompt.tags) !== JSON.stringify(newPrompt.tags)) {
      changes.push("tags modified");
    }

    if (oldPrompt.isProduction !== newPrompt.isProduction) {
      changes.push(newPrompt.isProduction ? "promoted to production" : "demoted from production");
    }

    return changes;
  }
}

/**
 * Define a prompt (helper function)
 */
export function definePrompt(config: PromptBase): PromptBase {
  return {
    ...config,
    variables: config.variables || [],
    tags: config.tags || [],
    isProduction: config.isProduction ?? false,
  };
}

/**
 * Define a text prompt (helper function)
 */
export function defineTextPrompt(
  name: string,
  template: string,
  options?: Omit<PromptBase, "name" | "type" | "template">
): PromptBase {
  return definePrompt({
    name,
    type: "text",
    template,
    ...options,
  });
}

/**
 * Define a chat prompt (helper function)
 */
export function defineChatPrompt(
  name: string,
  messages: PromptMessage[],
  options?: Omit<PromptBase, "name" | "type" | "messages">
): PromptBase {
  return definePrompt({
    name,
    type: "chat",
    messages,
    ...options,
  });
}

// Default instance
export const promptManager = new PromptManager();
