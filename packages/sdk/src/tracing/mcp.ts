/**
 * MCP (Model Context Protocol) Tracing Middleware
 *
 * Provides automatic instrumentation for MCP client calls, enabling
 * comprehensive observability of MCP server interactions.
 */

import type { MCPContext, MCPTransport, SkillCategory } from "@neon/shared";
import { span, type SpanOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * MCP client interface that we can wrap for tracing
 */
export interface MCPClient {
  callTool(toolId: string, params?: unknown): Promise<unknown>;
  listTools?(): Promise<MCPToolInfo[]>;
  getServerInfo?(): Promise<MCPServerInfo>;
}

/**
 * MCP tool information
 */
export interface MCPToolInfo {
  id: string;
  name: string;
  description?: string;
  inputSchema?: object;
}

/**
 * MCP server information
 */
export interface MCPServerInfo {
  name: string;
  version?: string;
  protocolVersion?: string;
  capabilities?: string[];
}

/**
 * Configuration for MCP tracing
 */
export interface MCPTracingConfig {
  /** Unique identifier for this MCP server */
  serverId: string;
  /** Optional server URL */
  serverUrl?: string;
  /** Transport mechanism (stdio, http, websocket) */
  transport?: MCPTransport;
  /** Protocol version */
  protocolVersion?: string;
  /** Server capabilities */
  capabilities?: string[];
  /** Map tool IDs to skill categories for better analytics */
  toolCategoryMap?: Record<string, SkillCategory>;
  /** Whether to capture tool inputs (may contain sensitive data) */
  captureInputs?: boolean;
  /** Whether to capture tool outputs */
  captureOutputs?: boolean;
  /** Maximum size for captured inputs/outputs */
  maxCaptureSize?: number;
  /** Custom attributes to add to all spans */
  attributes?: Record<string, string>;
  /** Callback for connection lifecycle events */
  onConnectionEvent?: (event: MCPConnectionEvent) => void;
}

/**
 * MCP connection lifecycle event
 */
export interface MCPConnectionEvent {
  type: "connect" | "disconnect" | "reconnect" | "error";
  serverId: string;
  timestamp: Date;
  error?: Error;
}

/**
 * MCP tool call result with timing
 */
export interface MCPToolCallResult<T = unknown> {
  result: T;
  durationMs: number;
  mcpContext: MCPContext;
}

// =============================================================================
// MCP Tracing Wrapper
// =============================================================================

/**
 * Wrap an MCP client to automatically trace all tool calls
 *
 * @example
 * ```typescript
 * import { withMCPTracing } from '@neon/sdk';
 *
 * const mcpClient = createMCPClient({ server: 'filesystem' });
 * const tracedClient = withMCPTracing(mcpClient, {
 *   serverId: 'filesystem',
 *   transport: 'stdio',
 *   captureInputs: true,
 *   captureOutputs: true,
 * });
 *
 * // All tool calls are now automatically traced
 * const result = await tracedClient.callTool('read_file', { path: '/etc/hosts' });
 * ```
 */
export function withMCPTracing<T extends MCPClient>(
  client: T,
  config: MCPTracingConfig
): T & { getMCPContext: () => MCPContext } {
  const {
    serverId,
    serverUrl,
    transport = "stdio",
    protocolVersion,
    capabilities,
    toolCategoryMap = {},
    captureInputs = true,
    captureOutputs = true,
    maxCaptureSize = 10000,
    attributes: baseAttributes = {},
    onConnectionEvent,
  } = config;

  // Create base MCP context
  const baseMCPContext: MCPContext = {
    serverId,
    serverUrl,
    toolId: "", // Will be set per call
    protocolVersion,
    transport,
    capabilities,
  };

  // Track connection state
  let isConnected = false;

  // Emit connection event helper
  const emitConnectionEvent = (type: MCPConnectionEvent["type"], error?: Error) => {
    if (onConnectionEvent) {
      onConnectionEvent({
        type,
        serverId,
        timestamp: new Date(),
        error,
      });
    }
  };

  // Create traced callTool method
  const tracedCallTool = async (toolId: string, params?: unknown): Promise<unknown> => {
    const mcpContext: MCPContext = {
      ...baseMCPContext,
      toolId,
    };

    const skillCategory = toolCategoryMap[toolId];
    const spanAttributes: Record<string, string> = {
      ...baseAttributes,
      "mcp.server_id": serverId,
      "mcp.tool_id": toolId,
      "mcp.transport": transport,
    };

    if (serverUrl) {
      spanAttributes["mcp.server_url"] = serverUrl;
    }
    if (protocolVersion) {
      spanAttributes["mcp.protocol_version"] = protocolVersion;
    }
    if (skillCategory) {
      spanAttributes["skill.category"] = skillCategory;
    }

    // Capture input if enabled
    if (captureInputs && params !== undefined) {
      try {
        const inputStr = JSON.stringify(params);
        spanAttributes["mcp.tool_input"] = inputStr.slice(0, maxCaptureSize);
        if (inputStr.length > maxCaptureSize) {
          spanAttributes["mcp.tool_input_truncated"] = "true";
        }
      } catch {
        spanAttributes["mcp.tool_input"] = "[non-serializable]";
      }
    }

    const spanOptions: SpanOptions = {
      type: "tool",
      componentType: "mcp",
      attributes: spanAttributes,
    };

    // Execute with tracing
    return span(`mcp:${serverId}:${toolId}`, async () => {
      const startTime = Date.now();

      try {
        // Track connection on first call
        if (!isConnected) {
          isConnected = true;
          emitConnectionEvent("connect");
        }

        const result = await client.callTool(toolId, params);

        // Capture output if enabled
        if (captureOutputs && result !== undefined) {
          try {
            const outputStr = JSON.stringify(result);
            spanAttributes["mcp.tool_output"] = outputStr.slice(0, maxCaptureSize);
            if (outputStr.length > maxCaptureSize) {
              spanAttributes["mcp.tool_output_truncated"] = "true";
            }
          } catch {
            spanAttributes["mcp.tool_output"] = "[non-serializable]";
          }
        }

        spanAttributes["mcp.duration_ms"] = String(Date.now() - startTime);
        spanAttributes["mcp.status"] = "ok";

        return result;
      } catch (error) {
        spanAttributes["mcp.duration_ms"] = String(Date.now() - startTime);
        spanAttributes["mcp.status"] = "error";

        if (error instanceof Error) {
          mcpContext.errorCode = error.name || "UNKNOWN_ERROR";
          spanAttributes["mcp.error_message"] = error.message;
          spanAttributes["mcp.error_name"] = error.name;
        }

        emitConnectionEvent("error", error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }, spanOptions);
  };

  // Create proxy to intercept method calls
  const handler: ProxyHandler<T> = {
    get(target, prop) {
      if (prop === "callTool") {
        return tracedCallTool;
      }
      if (prop === "getMCPContext") {
        return () => baseMCPContext;
      }
      const value = target[prop as keyof T];
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  };

  return new Proxy(client, handler) as T & { getMCPContext: () => MCPContext };
}

// =============================================================================
// MCP Span Helper
// =============================================================================

/**
 * Create a traced MCP tool call span directly
 *
 * Use this when you don't have an MCP client to wrap, but want to
 * instrument MCP-like operations.
 *
 * @example
 * ```typescript
 * const result = await mcpToolCall({
 *   serverId: 'filesystem',
 *   toolId: 'read_file',
 *   transport: 'stdio',
 * }, async () => {
 *   return await myCustomMCPCall('read_file', { path: '/etc/hosts' });
 * });
 * ```
 */
export async function mcpToolCall<T>(
  context: {
    serverId: string;
    toolId: string;
    serverUrl?: string;
    transport?: MCPTransport;
    protocolVersion?: string;
    input?: unknown;
    attributes?: Record<string, string>;
  },
  fn: () => Promise<T>
): Promise<MCPToolCallResult<T>> {
  const startTime = Date.now();
  const mcpContext: MCPContext = {
    serverId: context.serverId,
    toolId: context.toolId,
    serverUrl: context.serverUrl,
    transport: context.transport,
    protocolVersion: context.protocolVersion,
  };

  const spanAttributes: Record<string, string> = {
    ...context.attributes,
    "mcp.server_id": context.serverId,
    "mcp.tool_id": context.toolId,
  };

  if (context.transport) {
    spanAttributes["mcp.transport"] = context.transport;
  }
  if (context.input !== undefined) {
    try {
      spanAttributes["mcp.tool_input"] = JSON.stringify(context.input).slice(0, 10000);
    } catch {
      // Ignore serialization errors
    }
  }

  const result = await span(
    `mcp:${context.serverId}:${context.toolId}`,
    fn,
    {
      type: "tool",
      componentType: "mcp",
      attributes: spanAttributes,
    }
  );

  return {
    result,
    durationMs: Date.now() - startTime,
    mcpContext,
  };
}

// =============================================================================
// MCP Server Health Tracking
// =============================================================================

/**
 * MCP server health status
 */
export interface MCPServerHealth {
  serverId: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  lastSeen: Date;
  callCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

/**
 * MCP health tracker for monitoring server health
 */
export class MCPHealthTracker {
  private servers: Map<string, {
    calls: Array<{ timestamp: Date; durationMs: number; success: boolean }>;
    maxHistorySize: number;
  }> = new Map();

  constructor(private config: { maxHistorySize?: number } = {}) {}

  /**
   * Record an MCP call for health tracking
   */
  recordCall(serverId: string, durationMs: number, success: boolean): void {
    const maxSize = this.config.maxHistorySize || 1000;

    if (!this.servers.has(serverId)) {
      this.servers.set(serverId, { calls: [], maxHistorySize: maxSize });
    }

    const server = this.servers.get(serverId)!;
    server.calls.push({
      timestamp: new Date(),
      durationMs,
      success,
    });

    // Trim old entries
    if (server.calls.length > maxSize) {
      server.calls = server.calls.slice(-maxSize);
    }
  }

  /**
   * Get health status for a server
   */
  getServerHealth(serverId: string, windowMs: number = 300000): MCPServerHealth {
    const server = this.servers.get(serverId);
    const now = Date.now();

    if (!server || server.calls.length === 0) {
      return {
        serverId,
        status: "unknown",
        lastSeen: new Date(0),
        callCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
      };
    }

    // Filter to window
    const recentCalls = server.calls.filter(
      (c) => now - c.timestamp.getTime() < windowMs
    );

    if (recentCalls.length === 0) {
      return {
        serverId,
        status: "unknown",
        lastSeen: server.calls[server.calls.length - 1].timestamp,
        callCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
      };
    }

    const callCount = recentCalls.length;
    const errorCount = recentCalls.filter((c) => !c.success).length;
    const errorRate = errorCount / callCount;

    const latencies = recentCalls.map((c) => c.durationMs).sort((a, b) => a - b);
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies[p95Index] || latencies[latencies.length - 1];

    // Determine status
    let status: MCPServerHealth["status"];
    if (errorRate > 0.5) {
      status = "unhealthy";
    } else if (errorRate > 0.1 || p95LatencyMs > 5000) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      serverId,
      status,
      lastSeen: recentCalls[recentCalls.length - 1].timestamp,
      callCount,
      errorCount,
      avgLatencyMs: Math.round(avgLatencyMs),
      p95LatencyMs: Math.round(p95LatencyMs),
    };
  }

  /**
   * Get health for all tracked servers
   */
  getAllServerHealth(windowMs: number = 300000): MCPServerHealth[] {
    return Array.from(this.servers.keys()).map((serverId) =>
      this.getServerHealth(serverId, windowMs)
    );
  }
}

// =============================================================================
// Exports
// =============================================================================

export type {
  MCPContext,
  MCPTransport,
};
