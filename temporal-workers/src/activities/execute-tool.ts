/**
 * Execute Tool Activity
 *
 * Executes tool/function calls with automatic span emission.
 * Supports MCP-compatible tools and custom tool registries.
 */

import type { ToolExecuteParams } from "../types";
import { emitSpan } from "./emit-span";

/**
 * Tool registry for looking up and executing tools
 */
interface ToolRegistry {
  execute(name: string, input: Record<string, unknown>): Promise<unknown>;
  has(name: string): boolean;
}

/**
 * Default tool registry with built-in tools
 */
class DefaultToolRegistry implements ToolRegistry {
  private tools: Map<string, (input: Record<string, unknown>) => Promise<unknown>> = new Map();

  constructor() {
    // Register built-in tools
    this.register("echo", async (input) => input);
    this.register("sleep", async (input) => {
      const ms = (input.ms as number) || 1000;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { slept: ms };
    });
    this.register("http_get", async (input) => {
      const url = input.url as string;
      const response = await fetch(url);
      return {
        status: response.status,
        body: await response.text(),
      };
    });
    this.register("http_post", async (input) => {
      const url = input.url as string;
      const body = input.body as Record<string, unknown>;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: await response.text(),
      };
    });
  }

  register(name: string, fn: (input: Record<string, unknown>) => Promise<unknown>): void {
    this.tools.set(name, fn);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    const fn = this.tools.get(name);
    if (!fn) {
      throw new Error(`Tool not found: ${name}`);
    }
    return fn(input);
  }
}

// Global tool registry instance
const toolRegistry = new DefaultToolRegistry();

/**
 * Execute a tool with automatic span emission
 *
 * This activity:
 * 1. Looks up the tool in the registry
 * 2. Executes it with the provided input
 * 3. Emits a tool span with input/output
 * 4. Returns the result
 *
 * Temporal handles retries automatically on failure.
 */
export async function executeTool(params: ToolExecuteParams): Promise<unknown> {
  const startTime = Date.now();
  const spanId = `span-${crypto.randomUUID()}`;

  try {
    // Execute the tool
    const result = await toolRegistry.execute(params.toolName, params.toolInput);

    // Emit success span
    await emitSpan({
      traceId: params.traceId,
      spanId,
      spanType: "tool",
      name: `tool:${params.toolName}`,
      toolName: params.toolName,
      toolInput: JSON.stringify(params.toolInput),
      toolOutput: JSON.stringify(result),
      durationMs: Date.now() - startTime,
      status: "ok",
    });

    return result;
  } catch (error) {
    // Emit error span
    await emitSpan({
      traceId: params.traceId,
      spanId,
      spanType: "tool",
      name: `tool:${params.toolName}`,
      toolName: params.toolName,
      toolInput: JSON.stringify(params.toolInput),
      durationMs: Date.now() - startTime,
      status: "error",
      statusMessage: error instanceof Error ? error.message : "Unknown error",
    });

    // Re-throw for Temporal to handle retry
    throw error;
  }
}

/**
 * Register a custom tool
 *
 * Tools can be registered at worker startup for project-specific tools.
 */
export function registerTool(
  name: string,
  fn: (input: Record<string, unknown>) => Promise<unknown>
): void {
  toolRegistry.register(name, fn);
}

/**
 * Check if a tool is registered
 */
export function hasTool(name: string): boolean {
  return toolRegistry.has(name);
}

/**
 * Execute a tool via MCP (Model Context Protocol)
 *
 * This allows integration with MCP servers for additional tools.
 */
export async function executeMCPTool(
  serverUrl: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${serverUrl}/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MCP tool execution failed: ${error}`);
  }

  return response.json();
}
