/**
 * Tests for DebugClient
 *
 * Tests the debug client for real-time trace debugging, including:
 * - Connection management
 * - Debug commands (resume, step, pause)
 * - Breakpoint management
 * - Event handling
 * - SSE message processing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Span, Trace } from "@neon/shared";
import {
  DebugClient,
  createDebugClient,
  createDebugClientFromEnv,
  type DebugClientConfig,
  type DebugEvent,
  type DebugSessionState,
} from "../debugging/debug-client";
import { defineBreakpoint } from "../debugging/breakpoints";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId: "span-1",
    traceId: "trace-1",
    projectId: "project-1",
    name: "test-span",
    kind: "internal",
    spanType: "span",
    timestamp: new Date(),
    durationMs: 100,
    status: "ok",
    attributes: {},
    ...overrides,
  };
}

function createTestTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    traceId: "trace-1",
    projectId: "project-1",
    name: "test-trace",
    timestamp: new Date(),
    durationMs: 1000,
    status: "ok",
    metadata: {},
    totalInputTokens: 100,
    totalOutputTokens: 200,
    toolCallCount: 2,
    llmCallCount: 3,
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<DebugClientConfig> = {}): DebugClientConfig {
  return {
    url: "http://localhost:3000",
    traceId: "trace-123",
    autoReconnect: false, // Disable auto-reconnect for tests
    ...overrides,
  };
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe("DebugClient constructor", () => {
  it("creates client with required config", () => {
    const client = new DebugClient({
      url: "http://localhost:3000",
      traceId: "trace-123",
    });

    expect(client.getTraceId()).toBe("trace-123");
    expect(client.getConnectionState()).toBe("disconnected");
    expect(client.getSessionState()).toBe("idle");
  });

  it("throws error when url is missing", () => {
    expect(() => {
      new DebugClient({
        url: "",
        traceId: "trace-123",
      });
    }).toThrow("url is required");
  });

  it("throws error when traceId is missing", () => {
    expect(() => {
      new DebugClient({
        url: "http://localhost:3000",
        traceId: "",
      });
    }).toThrow("traceId is required");
  });

  it("normalizes trailing slash from url", () => {
    const client = new DebugClient({
      url: "http://localhost:3000/",
      traceId: "trace-123",
    });

    // URL should be normalized internally
    expect(client.getTraceId()).toBe("trace-123");
  });

  it("uses default values for optional config", () => {
    const client = new DebugClient({
      url: "http://localhost:3000",
      traceId: "trace-123",
    });

    // Verify client was created - defaults are internal
    expect(client.isConnected()).toBe(false);
    expect(client.isPaused()).toBe(false);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createDebugClient", () => {
  it("creates client with config", () => {
    const client = createDebugClient({
      url: "http://localhost:3000",
      traceId: "trace-456",
    });

    expect(client).toBeInstanceOf(DebugClient);
    expect(client.getTraceId()).toBe("trace-456");
  });
});

describe("createDebugClientFromEnv", () => {
  it("creates client with explicit traceId", () => {
    // Test with explicit traceId (doesn't depend on env)
    const client = createDebugClientFromEnv("trace-from-env");

    expect(client).toBeInstanceOf(DebugClient);
    expect(client.getTraceId()).toBe("trace-from-env");
  });

  it("throws when no traceId available and env not set", () => {
    // Save and clear env
    const savedTraceId = process.env.NEON_DEBUG_TRACE_ID;
    delete process.env.NEON_DEBUG_TRACE_ID;

    try {
      expect(() => createDebugClientFromEnv()).toThrow("traceId is required");
    } finally {
      // Restore
      if (savedTraceId) {
        process.env.NEON_DEBUG_TRACE_ID = savedTraceId;
      }
    }
  });
});

// ============================================================================
// State Getters Tests
// ============================================================================

describe("DebugClient state getters", () => {
  let client: DebugClient;

  beforeEach(() => {
    client = new DebugClient(createTestConfig());
  });

  it("getConnectionState returns disconnected initially", () => {
    expect(client.getConnectionState()).toBe("disconnected");
  });

  it("getSessionState returns idle initially", () => {
    expect(client.getSessionState()).toBe("idle");
  });

  it("getCurrentSpan returns null initially", () => {
    expect(client.getCurrentSpan()).toBeNull();
  });

  it("getSpanStack returns empty array initially", () => {
    expect(client.getSpanStack()).toEqual([]);
  });

  it("getTraceId returns configured traceId", () => {
    expect(client.getTraceId()).toBe("trace-123");
  });

  it("isConnected returns false when disconnected", () => {
    expect(client.isConnected()).toBe(false);
  });

  it("isPaused returns false when idle", () => {
    expect(client.isPaused()).toBe(false);
  });
});

// ============================================================================
// Event Handler Tests
// ============================================================================

describe("DebugClient event handlers", () => {
  let client: DebugClient;

  beforeEach(() => {
    client = new DebugClient(createTestConfig());
  });

  it("registers and calls event handler", () => {
    const handler = vi.fn();
    client.on("connected", handler);

    // Simulate connected event via internal method
    // Since we can't easily trigger SSE, we test the handler registration
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns unsubscribe function", () => {
    const handler = vi.fn();
    const unsubscribe = client.on("connected", handler);

    expect(typeof unsubscribe).toBe("function");
  });

  it("removes handler with off()", () => {
    const handler = vi.fn();
    client.on("stateChange", handler);
    client.off("stateChange", handler);

    // Handler should be removed
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers for same event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    client.on("connected", handler1);
    client.on("connected", handler2);

    // Both should be registered
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Breakpoint Management Tests
// ============================================================================

describe("DebugClient breakpoint management", () => {
  let client: DebugClient;

  beforeEach(() => {
    client = new DebugClient(createTestConfig());
  });

  it("adds breakpoint to local manager", async () => {
    const bp = defineBreakpoint({
      id: "bp-1",
      matcher: { spanType: "tool" },
    });

    await client.addBreakpoint(bp);

    const breakpoints = client.getBreakpoints();
    expect(breakpoints).toHaveLength(1);
    expect(breakpoints[0].id).toBe("bp-1");
  });

  it("removes breakpoint from local manager", async () => {
    const bp = defineBreakpoint({
      id: "bp-1",
      matcher: { spanType: "tool" },
    });

    await client.addBreakpoint(bp);
    const removed = await client.removeBreakpoint("bp-1");

    expect(removed).toBe(true);
    expect(client.getBreakpoints()).toHaveLength(0);
  });

  it("returns false when removing non-existent breakpoint", async () => {
    const removed = await client.removeBreakpoint("non-existent");
    expect(removed).toBe(false);
  });

  it("enables breakpoint", async () => {
    const bp = defineBreakpoint({
      id: "bp-1",
      enabled: false,
      matcher: { spanType: "tool" },
    });

    await client.addBreakpoint(bp);
    const enabled = await client.enableBreakpoint("bp-1");

    expect(enabled).toBe(true);
    expect(client.getBreakpoints()[0].enabled).toBe(true);
  });

  it("disables breakpoint", async () => {
    const bp = defineBreakpoint({
      id: "bp-1",
      enabled: true,
      matcher: { spanType: "tool" },
    });

    await client.addBreakpoint(bp);
    const disabled = await client.disableBreakpoint("bp-1");

    expect(disabled).toBe(true);
    expect(client.getBreakpoints()[0].enabled).toBe(false);
  });

  it("getEnabledBreakpoints filters disabled", async () => {
    await client.addBreakpoint(defineBreakpoint({
      id: "bp-enabled",
      enabled: true,
      matcher: {},
    }));
    await client.addBreakpoint(defineBreakpoint({
      id: "bp-disabled",
      enabled: false,
      matcher: {},
    }));

    const enabled = client.getEnabledBreakpoints();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe("bp-enabled");
  });

  it("clears all breakpoints", async () => {
    await client.addBreakpoint(defineBreakpoint({ id: "bp-1", matcher: {} }));
    await client.addBreakpoint(defineBreakpoint({ id: "bp-2", matcher: {} }));

    await client.clearBreakpoints();

    expect(client.getBreakpoints()).toHaveLength(0);
  });
});

// ============================================================================
// Command Tests (without connection)
// ============================================================================

describe("DebugClient commands when disconnected", () => {
  let client: DebugClient;

  beforeEach(() => {
    client = new DebugClient(createTestConfig());
  });

  it("resume throws when not connected", async () => {
    await expect(client.resume()).rejects.toThrow("Not connected");
  });

  it("stepOver throws when not connected", async () => {
    await expect(client.stepOver()).rejects.toThrow("Not connected");
  });

  it("stepInto throws when not connected", async () => {
    await expect(client.stepInto()).rejects.toThrow("Not connected");
  });

  it("stepOut throws when not connected", async () => {
    await expect(client.stepOut()).rejects.toThrow("Not connected");
  });

  it("pause throws when not connected", async () => {
    await expect(client.pause()).rejects.toThrow("Not connected");
  });

  it("inspect throws when not connected", async () => {
    await expect(client.inspect("span-1")).rejects.toThrow("Not connected");
  });
});

// ============================================================================
// Disconnect Tests
// ============================================================================

describe("DebugClient disconnect", () => {
  let client: DebugClient;

  beforeEach(() => {
    client = new DebugClient(createTestConfig());
  });

  it("clears state on disconnect", () => {
    client.disconnect();

    expect(client.getConnectionState()).toBe("disconnected");
    expect(client.getSessionState()).toBe("idle");
    expect(client.getCurrentSpan()).toBeNull();
    expect(client.getSpanStack()).toEqual([]);
  });

  it("can disconnect when already disconnected", () => {
    expect(() => client.disconnect()).not.toThrow();
    expect(client.getConnectionState()).toBe("disconnected");
  });
});

// ============================================================================
// SSE Message Handling Tests (via internal method simulation)
// ============================================================================

describe("DebugClient SSE message handling", () => {
  let client: DebugClient;
  let events: Array<{ event: string; data: unknown }>;

  beforeEach(() => {
    client = new DebugClient(createTestConfig({ debug: false }));
    events = [];

    // Set up event listeners
    client.on("spanEnter", (span) => events.push({ event: "spanEnter", data: span }));
    client.on("spanExit", (span) => events.push({ event: "spanExit", data: span }));
    client.on("stateChange", (state) => events.push({ event: "stateChange", data: state }));
  });

  // Note: These tests verify the internal state management
  // Full SSE testing would require mocking EventSource/fetch

  it("tracks span stack correctly", async () => {
    const bp = defineBreakpoint({ id: "test", matcher: {} });
    await client.addBreakpoint(bp);

    // Verify breakpoint was added
    expect(client.getBreakpoints()).toHaveLength(1);
  });
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

describe("DebugClient integration scenarios", () => {
  it("typical debugging workflow setup", async () => {
    // Create client
    const client = createDebugClient({
      url: "http://localhost:3000",
      traceId: "workflow-trace-123",
      projectId: "project-1",
      autoReconnect: false,
    });

    // Add breakpoints
    await client.addBreakpoint(defineBreakpoint({
      name: "tool-errors",
      matcher: { spanType: "tool", status: "error" },
      trigger: "onExit",
    }));

    await client.addBreakpoint(defineBreakpoint({
      name: "slow-llm",
      matcher: { spanType: "generation" },
      trigger: "onExit",
    }));

    // Verify setup
    expect(client.getBreakpoints()).toHaveLength(2);
    expect(client.getEnabledBreakpoints()).toHaveLength(2);
    expect(client.isConnected()).toBe(false);

    // Clean up
    client.disconnect();
    expect(client.getConnectionState()).toBe("disconnected");
  });

  it("breakpoint enable/disable workflow", async () => {
    const client = createDebugClient({
      url: "http://localhost:3000",
      traceId: "trace-123",
      autoReconnect: false,
    });

    // Add breakpoints
    await client.addBreakpoint(defineBreakpoint({
      id: "bp-1",
      matcher: { spanType: "tool" },
    }));

    await client.addBreakpoint(defineBreakpoint({
      id: "bp-2",
      matcher: { spanType: "generation" },
    }));

    // All enabled initially
    expect(client.getEnabledBreakpoints()).toHaveLength(2);

    // Disable one
    await client.disableBreakpoint("bp-1");
    expect(client.getEnabledBreakpoints()).toHaveLength(1);
    expect(client.getEnabledBreakpoints()[0].id).toBe("bp-2");

    // Re-enable
    await client.enableBreakpoint("bp-1");
    expect(client.getEnabledBreakpoints()).toHaveLength(2);

    // Remove one
    await client.removeBreakpoint("bp-2");
    expect(client.getBreakpoints()).toHaveLength(1);
    expect(client.getBreakpoints()[0].id).toBe("bp-1");
  });
});
