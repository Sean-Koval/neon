/**
 * Debug Client
 *
 * Client for connecting to the Neon debug stream endpoint for real-time
 * trace debugging with breakpoint support.
 *
 * Uses Server-Sent Events (SSE) for receiving debug events and HTTP POST
 * for sending commands. Works in both browser and Node.js environments.
 *
 * @example
 * ```typescript
 * import { DebugClient, defineBreakpoint, onSpanType, onError, and } from '@neon/sdk';
 *
 * const client = new DebugClient({
 *   url: 'http://localhost:3000/api/debug/stream',
 *   traceId: 'trace-123',
 * });
 *
 * // Set up breakpoints
 * client.addBreakpoint(defineBreakpoint({
 *   name: 'tool-errors',
 *   matcher: and(onSpanType('tool'), onError()),
 *   trigger: 'onExit',
 * }));
 *
 * // Listen for debug events
 * client.on('breakpointHit', ({ span, breakpoint }) => {
 *   console.log(`Hit breakpoint ${breakpoint.name} on span ${span.name}`);
 * });
 *
 * // Connect and start debugging
 * await client.connect();
 *
 * // Control execution
 * await client.resume();
 * await client.stepOver();
 * ```
 */

import type { Span, Trace } from "@neon/shared";
import {
  type Breakpoint,
  type BreakpointContext,
  BreakpointManager,
} from "./breakpoints.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Debug client connection state
 */
export type DebugConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Debug session state
 */
export type DebugSessionState =
  | "idle"       // Connected but not actively debugging
  | "running"    // Trace is executing normally
  | "paused"     // Execution paused at breakpoint
  | "stepping"   // Stepping through execution
  | "completed"; // Trace finished

/**
 * Debug command types sent to server
 */
export type DebugCommand =
  | "resume"
  | "stepOver"
  | "stepInto"
  | "stepOut"
  | "pause"
  | "inspect"
  | "setBreakpoint"
  | "removeBreakpoint"
  | "enableBreakpoint"
  | "disableBreakpoint";

/**
 * Debug event types received from server
 */
export type DebugEventType =
  | "connected"
  | "traceStarted"
  | "spanEnter"
  | "spanExit"
  | "breakpointHit"
  | "paused"
  | "resumed"
  | "stepCompleted"
  | "inspectResult"
  | "traceCompleted"
  | "error"
  | "ping";

/**
 * Command payload for debug commands
 */
export interface DebugCommandPayload {
  spanId?: string;
  breakpointId?: string;
  breakpoint?: Breakpoint;
}

/**
 * Message sent to debug server via POST
 */
export interface DebugCommandMessage {
  command: DebugCommand;
  traceId: string;
  payload?: DebugCommandPayload;
  requestId?: string;
}

/**
 * Event received from debug server via SSE
 */
export interface DebugEvent {
  type: DebugEventType;
  traceId: string;
  timestamp: string;
  payload: {
    span?: Span;
    trace?: Trace;
    breakpoint?: Breakpoint;
    breakpointContext?: BreakpointContext;
    error?: string;
    message?: string;
    data?: Record<string, unknown>;
    connectionId?: string;
    sessionState?: {
      state: DebugSessionState;
      currentSpanId: string | null;
    };
  };
}

/**
 * Debug client configuration
 */
export interface DebugClientConfig {
  /** Base URL for the debug API (e.g., 'http://localhost:3000') */
  url: string;
  /** Trace ID to debug */
  traceId: string;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Reconnect interval in ms (default: 1000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Project ID for authentication */
  projectId?: string;
  /** API key for authentication (passed via header, not URL) */
  apiKey?: string;
}

/**
 * Event handler types
 */
export interface DebugEventHandlers {
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
  traceStarted: (trace: Trace) => void;
  spanEnter: (span: Span) => void;
  spanExit: (span: Span) => void;
  breakpointHit: (context: BreakpointContext) => void;
  paused: (span: Span) => void;
  resumed: () => void;
  stepCompleted: (span: Span) => void;
  inspectResult: (data: Record<string, unknown>) => void;
  traceCompleted: (trace: Trace) => void;
  stateChange: (state: DebugSessionState) => void;
}

type EventHandler<K extends keyof DebugEventHandlers> = DebugEventHandlers[K];

// ============================================================================
// Debug Client
// ============================================================================

/**
 * Debug client for real-time trace debugging.
 *
 * Uses Server-Sent Events (SSE) for receiving events and HTTP POST for commands.
 * Works in both browser (using EventSource) and Node.js (using fetch streaming).
 */
export class DebugClient {
  private config: Required<DebugClientConfig>;
  private eventSource: EventSource | null = null;
  private abortController: AbortController | null = null;
  private connectionState: DebugConnectionState = "disconnected";
  private sessionState: DebugSessionState = "idle";
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers: Map<keyof DebugEventHandlers, Set<(...args: unknown[]) => void>> = new Map();
  private pendingRequests: Map<string, { 
    resolve: (data: Record<string, unknown>) => void; 
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private requestIdCounter = 0;
  private breakpointManager: BreakpointManager = new BreakpointManager();
  private currentSpan: Span | null = null;
  private spanStack: Span[] = [];

  constructor(config: DebugClientConfig) {
    if (!config.url) {
      throw new Error("DebugClient: url is required");
    }
    if (!config.traceId) {
      throw new Error("DebugClient: traceId is required");
    }

    this.config = {
      url: config.url.replace(/\/$/, ""), // Remove trailing slash
      traceId: config.traceId,
      autoReconnect: config.autoReconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      debug: config.debug ?? false,
      projectId: config.projectId ?? "",
      apiKey: config.apiKey ?? "",
    };
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to the debug server
   */
  async connect(): Promise<void> {
    if (this.connectionState === "connected") {
      return;
    }

    this.setConnectionState("connecting");

    // Build SSE URL
    const sseUrl = new URL(`${this.config.url}/api/debug/stream`);
    sseUrl.searchParams.set("traceId", this.config.traceId);
    if (this.config.projectId) {
      sseUrl.searchParams.set("projectId", this.config.projectId);
    }

    // Use EventSource if available (browser), otherwise use fetch streaming (Node.js)
    if (typeof EventSource !== "undefined") {
      return this.connectWithEventSource(sseUrl.toString());
    } else {
      return this.connectWithFetch(sseUrl.toString());
    }
  }

  /**
   * Connect using browser EventSource
   */
  private connectWithEventSource(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          this.log("Connected via EventSource");
          this.setConnectionState("connected");
          this.reconnectAttempts = 0;
          this.emit("connected");
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          this.handleSSEMessage(event.data);
        };

        this.eventSource.onerror = () => {
          const wasConnecting = this.connectionState === "connecting";
          this.eventSource?.close();
          this.eventSource = null;
          
          if (wasConnecting) {
            this.setConnectionState("error");
            reject(new Error("Failed to connect to debug server"));
          } else {
            this.handleDisconnect("EventSource error");
          }
        };
      } catch (error) {
        this.setConnectionState("error");
        reject(error);
      }
    });
  }

  /**
   * Connect using fetch streaming (for Node.js)
   */
  private async connectWithFetch(url: string): Promise<void> {
    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      };

      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      this.log("Connected via fetch streaming");
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;
      this.emit("connected");

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              this.handleDisconnect("Stream ended");
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                this.handleSSEMessage(line.slice(6));
              }
            }
          }
        } catch (error) {
          if ((error as Error).name !== "AbortError") {
            this.handleDisconnect((error as Error).message);
          }
        }
      };

      // Start processing in background
      processStream();
    } catch (error) {
      this.setConnectionState("error");
      throw error;
    }
  }

  /**
   * Disconnect from the debug server
   */
  disconnect(): void {
    // Clear reconnect timer
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Abort fetch stream
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clean up pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Client disconnected"));
    }
    this.pendingRequests.clear();

    this.setConnectionState("disconnected");
    this.setSessionState("idle");
    this.currentSpan = null;
    this.spanStack = [];
  }

  /**
   * Handle disconnection and potential reconnect
   */
  private handleDisconnect(reason?: string): void {
    this.eventSource = null;
    this.abortController = null;

    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.setConnectionState("reconnecting");
      this.reconnectAttempts++;
      this.log(`Reconnecting (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch((error) => {
          this.log("Reconnect failed:", error);
        });
      }, this.config.reconnectInterval * this.reconnectAttempts);
    } else {
      this.setConnectionState("disconnected");
      this.emit("disconnected", reason);
    }
  }

  // ===========================================================================
  // Debug Commands
  // ===========================================================================

  /**
   * Resume execution after breakpoint
   */
  async resume(): Promise<void> {
    await this.sendCommand("resume");
    this.setSessionState("running");
  }

  /**
   * Step over to next span at same level
   */
  async stepOver(): Promise<void> {
    await this.sendCommand("stepOver");
    this.setSessionState("stepping");
  }

  /**
   * Step into child span
   */
  async stepInto(): Promise<void> {
    await this.sendCommand("stepInto");
    this.setSessionState("stepping");
  }

  /**
   * Step out to parent span
   */
  async stepOut(): Promise<void> {
    await this.sendCommand("stepOut");
    this.setSessionState("stepping");
  }

  /**
   * Pause execution
   */
  async pause(): Promise<void> {
    await this.sendCommand("pause");
  }

  /**
   * Request inspection data for a span
   */
  async inspect(spanId: string): Promise<Record<string, unknown>> {
    const result = await this.sendCommand("inspect", { spanId });
    return (result.data as Record<string, unknown>) ?? {};
  }

  /**
   * Send a debug command via HTTP POST
   */
  private async sendCommand(
    command: DebugCommand,
    payload?: DebugCommandPayload
  ): Promise<Record<string, unknown>> {
    this.ensureConnected();

    const requestId = `req-${++this.requestIdCounter}-${Date.now()}`;

    const message: DebugCommandMessage = {
      command,
      traceId: this.config.traceId,
      payload,
      requestId,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.projectId) {
      headers["X-Project-ID"] = this.config.projectId;
    }

    const response = await fetch(`${this.config.url}/api/debug/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error ?? `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ===========================================================================
  // Breakpoint Management
  // ===========================================================================

  /**
   * Add a breakpoint
   */
  async addBreakpoint(breakpoint: Breakpoint): Promise<void> {
    this.breakpointManager.register(breakpoint);

    if (this.connectionState === "connected") {
      await this.sendCommand("setBreakpoint", { breakpoint });
    }
  }

  /**
   * Remove a breakpoint by ID
   */
  async removeBreakpoint(id: string): Promise<boolean> {
    const removed = this.breakpointManager.unregister(id);

    if (removed && this.connectionState === "connected") {
      await this.sendCommand("removeBreakpoint", { breakpointId: id });
    }

    return removed;
  }

  /**
   * Enable a breakpoint
   */
  async enableBreakpoint(id: string): Promise<boolean> {
    const enabled = this.breakpointManager.enable(id);

    if (enabled && this.connectionState === "connected") {
      await this.sendCommand("enableBreakpoint", { breakpointId: id });
    }

    return enabled;
  }

  /**
   * Disable a breakpoint
   */
  async disableBreakpoint(id: string): Promise<boolean> {
    const disabled = this.breakpointManager.disable(id);

    if (disabled && this.connectionState === "connected") {
      await this.sendCommand("disableBreakpoint", { breakpointId: id });
    }

    return disabled;
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): Breakpoint[] {
    return this.breakpointManager.getAll();
  }

  /**
   * Get enabled breakpoints only
   */
  getEnabledBreakpoints(): Breakpoint[] {
    return this.breakpointManager.getEnabled();
  }

  /**
   * Clear all breakpoints
   */
  async clearBreakpoints(): Promise<void> {
    const breakpoints = this.breakpointManager.getAll();
    this.breakpointManager.clear();

    if (this.connectionState === "connected") {
      for (const bp of breakpoints) {
        await this.sendCommand("removeBreakpoint", { breakpointId: bp.id });
      }
    }
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register an event handler
   */
  on<K extends keyof DebugEventHandlers>(
    event: K,
    handler: EventHandler<K>
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as (...args: unknown[]) => void);

    return () => {
      this.eventHandlers.get(event)?.delete(handler as (...args: unknown[]) => void);
    };
  }

  /**
   * Remove an event handler
   */
  off<K extends keyof DebugEventHandlers>(
    event: K,
    handler: EventHandler<K>
  ): void {
    this.eventHandlers.get(event)?.delete(handler as (...args: unknown[]) => void);
  }

  /**
   * Emit an event to handlers
   */
  private emit<K extends keyof DebugEventHandlers>(
    event: K,
    ...args: Parameters<EventHandler<K>>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      }
    }
  }

  // ===========================================================================
  // SSE Message Handling
  // ===========================================================================

  /**
   * Handle incoming SSE message
   */
  private handleSSEMessage(data: string): void {
    try {
      const event: DebugEvent = JSON.parse(data);
      this.log("Received event:", event.type);

      switch (event.type) {
        case "connected":
          if (event.payload.sessionState) {
            this.setSessionState(event.payload.sessionState.state);
          }
          break;

        case "traceStarted":
          if (event.payload.trace) {
            this.setSessionState("running");
            this.emit("traceStarted", event.payload.trace);
          }
          break;

        case "spanEnter":
          if (event.payload.span) {
            this.spanStack.push(event.payload.span);
            this.currentSpan = event.payload.span;
            this.emit("spanEnter", event.payload.span);
          }
          break;

        case "spanExit":
          if (event.payload.span) {
            this.spanStack.pop();
            this.currentSpan = this.spanStack[this.spanStack.length - 1] ?? null;
            this.emit("spanExit", event.payload.span);
          }
          break;

        case "breakpointHit":
          if (event.payload.breakpointContext) {
            this.setSessionState("paused");
            this.emit("breakpointHit", event.payload.breakpointContext);
          }
          break;

        case "paused":
          if (event.payload.span) {
            this.setSessionState("paused");
            this.emit("paused", event.payload.span);
          }
          break;

        case "resumed":
          this.setSessionState("running");
          this.emit("resumed");
          break;

        case "stepCompleted":
          if (event.payload.span) {
            this.setSessionState("paused");
            this.currentSpan = event.payload.span;
            this.emit("stepCompleted", event.payload.span);
          }
          break;

        case "inspectResult":
          if (event.payload.data) {
            this.emit("inspectResult", event.payload.data);
          }
          break;

        case "traceCompleted":
          if (event.payload.trace) {
            this.setSessionState("completed");
            this.emit("traceCompleted", event.payload.trace);
          }
          break;

        case "error":
          this.emit("error", new Error(event.payload.error ?? "Unknown error"));
          break;

        case "ping":
          // Keepalive, ignore
          break;
      }
    } catch (error) {
      this.log("Error parsing SSE message:", error);
    }
  }

  // ===========================================================================
  // State Getters
  // ===========================================================================

  getConnectionState(): DebugConnectionState {
    return this.connectionState;
  }

  getSessionState(): DebugSessionState {
    return this.sessionState;
  }

  getCurrentSpan(): Span | null {
    return this.currentSpan;
  }

  getTraceId(): string {
    return this.config.traceId;
  }

  getSpanStack(): Span[] {
    return [...this.spanStack];
  }

  isPaused(): boolean {
    return this.sessionState === "paused";
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private setConnectionState(state: DebugConnectionState): void {
    this.connectionState = state;
  }

  private setSessionState(state: DebugSessionState): void {
    const previousState = this.sessionState;
    this.sessionState = state;
    if (previousState !== state) {
      this.emit("stateChange", state);
    }
  }

  private ensureConnected(): void {
    if (this.connectionState !== "connected") {
      throw new Error("Not connected to debug server");
    }
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log("[DebugClient]", ...args);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a debug client with configuration
 */
export function createDebugClient(config: DebugClientConfig): DebugClient {
  return new DebugClient(config);
}

/**
 * Create a debug client from environment variables
 *
 * Required: NEON_DEBUG_TRACE_ID
 * Optional: NEON_API_URL, NEON_PROJECT_ID, NEON_API_KEY
 */
export function createDebugClientFromEnv(
  traceId?: string,
  options?: Partial<Omit<DebugClientConfig, "url" | "traceId">>
): DebugClient {
  const url = process.env.NEON_API_URL ?? "http://localhost:3000";
  const projectId = process.env.NEON_PROJECT_ID ?? "";
  const apiKey = process.env.NEON_API_KEY ?? "";
  const resolvedTraceId = traceId ?? process.env.NEON_DEBUG_TRACE_ID;

  if (!resolvedTraceId) {
    throw new Error("traceId is required (provide as argument or set NEON_DEBUG_TRACE_ID)");
  }

  return new DebugClient({
    url,
    traceId: resolvedTraceId,
    projectId,
    apiKey,
    ...options,
  });
}
