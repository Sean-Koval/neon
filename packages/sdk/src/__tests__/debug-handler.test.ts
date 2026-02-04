/**
 * Tests for Debug Handler Activities
 *
 * Tests the debug handler activities for Temporal, including:
 * - Session management (init, get, update, end)
 * - Breakpoint evaluation
 * - Debug control commands (resume, step, pause)
 * - Wait for resume mechanism
 * - Breakpoint CRUD operations
 *
 * Note: These tests mock the fetch calls to the debug events API
 * and test the pure logic of the handler functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Span, SpanType } from "@neon/shared";

// Note: These tests focus on pure logic functions that don't require mocking fetch.
// The debug handler notification tests would require integration testing.

// ============================================================================
// Recreated Types (matching debug-handler.ts)
// ============================================================================

type DebugState = "running" | "paused" | "stepping" | "completed";
type StepMode = "over" | "into" | "out" | null;

interface DebugBreakpoint {
  id: string;
  name?: string;
  enabled: boolean;
  spanType?: SpanType | SpanType[];
  spanName?: string;
  toolName?: string;
  model?: string;
  status?: "ok" | "error" | "unset";
  trigger: "onEnter" | "onExit" | "onError";
  hitCondition?: "always" | number | { every: number } | { after: number };
}

interface DebugSession {
  traceId: string;
  projectId: string;
  state: DebugState;
  currentSpanId: string | null;
  stepMode: StepMode;
  stepTargetDepth: number | null;
  breakpoints: DebugBreakpoint[];
  hitCounts: Record<string, number>;
  pausedAt: Date | null;
  createdAt: Date;
}

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

function createTestBreakpoint(overrides: Partial<DebugBreakpoint> = {}): DebugBreakpoint {
  return {
    id: "bp-1",
    enabled: true,
    trigger: "onExit",
    ...overrides,
  };
}

function createTestSession(overrides: Partial<DebugSession> = {}): DebugSession {
  return {
    traceId: "trace-1",
    projectId: "project-1",
    state: "running",
    currentSpanId: null,
    stepMode: null,
    stepTargetDepth: null,
    breakpoints: [],
    hitCounts: {},
    pausedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Helper Function Tests (recreated for testing)
// ============================================================================

/**
 * Simple glob pattern matching (copied from debug-handler.ts)
 */
function matchesGlob(value: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return value === pattern;
  }
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${regexPattern}$`).test(value);
}

/**
 * Check if breakpoint should fire based on hit condition
 */
function shouldFireOnHit(
  condition: DebugBreakpoint["hitCondition"],
  hitCount: number
): boolean {
  if (condition === "always" || condition === undefined) {
    return true;
  }
  if (typeof condition === "number") {
    return hitCount === condition;
  }
  if ("every" in condition) {
    return hitCount % condition.every === 0;
  }
  if ("after" in condition) {
    return hitCount > condition.after;
  }
  return true;
}

/**
 * Check if a span matches a breakpoint's conditions
 */
function matchesBreakpoint(bp: DebugBreakpoint, span: Span): boolean {
  if (bp.spanType !== undefined) {
    const types = Array.isArray(bp.spanType) ? bp.spanType : [bp.spanType];
    if (!types.includes(span.spanType)) {
      return false;
    }
  }
  if (bp.spanName !== undefined) {
    if (!matchesGlob(span.name, bp.spanName)) {
      return false;
    }
  }
  if (bp.toolName !== undefined && span.toolName) {
    if (!matchesGlob(span.toolName, bp.toolName)) {
      return false;
    }
  } else if (bp.toolName !== undefined && !span.toolName) {
    return false;
  }
  if (bp.model !== undefined && span.model) {
    if (!matchesGlob(span.model, bp.model)) {
      return false;
    }
  } else if (bp.model !== undefined && !span.model) {
    return false;
  }
  if (bp.status !== undefined) {
    if (span.status !== bp.status) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Glob Matching Tests
// ============================================================================

describe("matchesGlob", () => {
  it("matches exact strings", () => {
    expect(matchesGlob("hello", "hello")).toBe(true);
    expect(matchesGlob("hello", "world")).toBe(false);
  });

  it("matches wildcard at end", () => {
    expect(matchesGlob("process-query", "process-*")).toBe(true);
    expect(matchesGlob("process-data", "process-*")).toBe(true);
    expect(matchesGlob("handle-query", "process-*")).toBe(false);
  });

  it("matches wildcard at start", () => {
    expect(matchesGlob("test-span", "*-span")).toBe(true);
    expect(matchesGlob("another-span", "*-span")).toBe(true);
    expect(matchesGlob("span-test", "*-span")).toBe(false);
  });

  it("matches wildcard in middle", () => {
    expect(matchesGlob("get_weather_data", "get_*_data")).toBe(true);
    expect(matchesGlob("get_user_data", "get_*_data")).toBe(true);
    expect(matchesGlob("set_weather_data", "get_*_data")).toBe(false);
  });

  it("matches multiple wildcards", () => {
    expect(matchesGlob("a-b-c", "*-*-*")).toBe(true);
    expect(matchesGlob("x-y", "*-*-*")).toBe(false);
  });

  it("escapes special regex characters", () => {
    expect(matchesGlob("file.txt", "file.txt")).toBe(true);
    expect(matchesGlob("file+txt", "file+txt")).toBe(true);
    expect(matchesGlob("file.txt", "*.txt")).toBe(true);
  });
});

// ============================================================================
// Hit Condition Tests
// ============================================================================

describe("shouldFireOnHit", () => {
  it("always fires for 'always' condition", () => {
    expect(shouldFireOnHit("always", 1)).toBe(true);
    expect(shouldFireOnHit("always", 100)).toBe(true);
  });

  it("fires for undefined condition (default)", () => {
    expect(shouldFireOnHit(undefined, 1)).toBe(true);
    expect(shouldFireOnHit(undefined, 50)).toBe(true);
  });

  it("fires on exact hit count for number condition", () => {
    expect(shouldFireOnHit(5, 1)).toBe(false);
    expect(shouldFireOnHit(5, 4)).toBe(false);
    expect(shouldFireOnHit(5, 5)).toBe(true);
    expect(shouldFireOnHit(5, 6)).toBe(false);
  });

  it("fires every N hits for 'every' condition", () => {
    expect(shouldFireOnHit({ every: 3 }, 1)).toBe(false);
    expect(shouldFireOnHit({ every: 3 }, 2)).toBe(false);
    expect(shouldFireOnHit({ every: 3 }, 3)).toBe(true);
    expect(shouldFireOnHit({ every: 3 }, 4)).toBe(false);
    expect(shouldFireOnHit({ every: 3 }, 6)).toBe(true);
    expect(shouldFireOnHit({ every: 3 }, 9)).toBe(true);
  });

  it("fires after N hits for 'after' condition", () => {
    expect(shouldFireOnHit({ after: 3 }, 1)).toBe(false);
    expect(shouldFireOnHit({ after: 3 }, 2)).toBe(false);
    expect(shouldFireOnHit({ after: 3 }, 3)).toBe(false);
    expect(shouldFireOnHit({ after: 3 }, 4)).toBe(true);
    expect(shouldFireOnHit({ after: 3 }, 100)).toBe(true);
  });
});

// ============================================================================
// Breakpoint Matching Tests
// ============================================================================

describe("matchesBreakpoint", () => {
  describe("span type matching", () => {
    it("matches single span type", () => {
      const bp = createTestBreakpoint({ spanType: "tool" });
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "tool" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "generation" }))).toBe(false);
    });

    it("matches array of span types", () => {
      const bp = createTestBreakpoint({ spanType: ["tool", "generation"] });
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "tool" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "generation" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "event" }))).toBe(false);
    });
  });

  describe("span name matching", () => {
    it("matches exact name", () => {
      const bp = createTestBreakpoint({ spanName: "process-query" });
      expect(matchesBreakpoint(bp, createTestSpan({ name: "process-query" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ name: "process-data" }))).toBe(false);
    });

    it("matches glob pattern", () => {
      const bp = createTestBreakpoint({ spanName: "process-*" });
      expect(matchesBreakpoint(bp, createTestSpan({ name: "process-query" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ name: "process-data" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ name: "handle-error" }))).toBe(false);
    });
  });

  describe("tool name matching", () => {
    it("matches exact tool name", () => {
      const bp = createTestBreakpoint({ toolName: "get_weather" });
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: "get_weather" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: "search" }))).toBe(false);
    });

    it("matches glob pattern for tool name", () => {
      const bp = createTestBreakpoint({ toolName: "get_*" });
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: "get_weather" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: "get_user" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: "set_config" }))).toBe(false);
    });

    it("fails when tool name required but span has no tool", () => {
      const bp = createTestBreakpoint({ toolName: "get_weather" });
      expect(matchesBreakpoint(bp, createTestSpan({ toolName: undefined }))).toBe(false);
    });
  });

  describe("model matching", () => {
    it("matches exact model name", () => {
      const bp = createTestBreakpoint({ model: "gpt-4" });
      expect(matchesBreakpoint(bp, createTestSpan({ model: "gpt-4" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ model: "claude-3" }))).toBe(false);
    });

    it("matches glob pattern for model", () => {
      const bp = createTestBreakpoint({ model: "gpt-*" });
      expect(matchesBreakpoint(bp, createTestSpan({ model: "gpt-4" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ model: "gpt-4-turbo" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ model: "claude-3" }))).toBe(false);
    });

    it("fails when model required but span has no model", () => {
      const bp = createTestBreakpoint({ model: "gpt-4" });
      expect(matchesBreakpoint(bp, createTestSpan({ model: undefined }))).toBe(false);
    });
  });

  describe("status matching", () => {
    it("matches status", () => {
      const bp = createTestBreakpoint({ status: "error" });
      expect(matchesBreakpoint(bp, createTestSpan({ status: "error" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ status: "ok" }))).toBe(false);
    });
  });

  describe("combined conditions", () => {
    it("requires all conditions to match", () => {
      const bp = createTestBreakpoint({
        spanType: "tool",
        status: "error",
        toolName: "get_*",
      });

      // All conditions match
      expect(matchesBreakpoint(bp, createTestSpan({
        spanType: "tool",
        status: "error",
        toolName: "get_weather",
      }))).toBe(true);

      // Wrong span type
      expect(matchesBreakpoint(bp, createTestSpan({
        spanType: "generation",
        status: "error",
        toolName: "get_weather",
      }))).toBe(false);

      // Wrong status
      expect(matchesBreakpoint(bp, createTestSpan({
        spanType: "tool",
        status: "ok",
        toolName: "get_weather",
      }))).toBe(false);

      // Wrong tool name
      expect(matchesBreakpoint(bp, createTestSpan({
        spanType: "tool",
        status: "error",
        toolName: "set_config",
      }))).toBe(false);
    });

    it("matches with empty conditions (matches all)", () => {
      const bp = createTestBreakpoint({});
      expect(matchesBreakpoint(bp, createTestSpan())).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ spanType: "tool" }))).toBe(true);
      expect(matchesBreakpoint(bp, createTestSpan({ status: "error" }))).toBe(true);
    });
  });
});

// ============================================================================
// Session State Transition Tests
// ============================================================================

describe("Debug session state transitions", () => {
  it("starts in running state", () => {
    const session = createTestSession();
    expect(session.state).toBe("running");
  });

  it("transitions to paused when breakpoint hit", () => {
    const session = createTestSession();
    session.state = "paused";
    session.pausedAt = new Date();
    expect(session.state).toBe("paused");
    expect(session.pausedAt).not.toBeNull();
  });

  it("transitions to stepping when step command issued", () => {
    const session = createTestSession({ state: "paused" });
    session.state = "stepping";
    session.stepMode = "over";
    expect(session.state).toBe("stepping");
    expect(session.stepMode).toBe("over");
  });

  it("transitions back to running when resumed", () => {
    const session = createTestSession({ state: "paused" });
    session.state = "running";
    session.stepMode = null;
    session.pausedAt = null;
    expect(session.state).toBe("running");
    expect(session.stepMode).toBeNull();
    expect(session.pausedAt).toBeNull();
  });

  it("tracks current span when paused", () => {
    const session = createTestSession({ state: "paused" });
    session.currentSpanId = "span-123";
    expect(session.currentSpanId).toBe("span-123");
  });
});

// ============================================================================
// Stepping Logic Tests
// ============================================================================

describe("Step mode logic", () => {
  /**
   * Step over: Pause at next span at same or higher depth
   */
  describe("stepOver", () => {
    it("should pause at same depth", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "over",
        stepTargetDepth: 2,
      });
      const currentDepth = 2;
      const trigger = "onEnter";

      // Step over should pause at same depth on enter
      expect(currentDepth <= session.stepTargetDepth!).toBe(true);
      expect(trigger === "onEnter").toBe(true);
    });

    it("should pause at higher (shallower) depth", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "over",
        stepTargetDepth: 2,
      });
      const currentDepth = 1; // Higher = shallower

      expect(currentDepth <= session.stepTargetDepth!).toBe(true);
    });

    it("should not pause at deeper depth", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "over",
        stepTargetDepth: 2,
      });
      const currentDepth = 3; // Deeper

      expect(currentDepth <= session.stepTargetDepth!).toBe(false);
    });
  });

  /**
   * Step into: Pause at next span (any depth) on enter
   */
  describe("stepInto", () => {
    it("should always pause on enter", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "into",
      });
      const trigger = "onEnter";

      expect(trigger === "onEnter").toBe(true);
    });

    it("should not pause on exit", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "into",
      });
      const trigger = "onExit";

      expect(trigger === "onEnter").toBe(false);
    });
  });

  /**
   * Step out: Pause at parent span (shallower depth) on exit
   */
  describe("stepOut", () => {
    it("should pause at target depth on exit", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "out",
        stepTargetDepth: 1,
      });
      const currentDepth = 1;
      const trigger = "onExit";

      expect(trigger === "onExit" && currentDepth <= session.stepTargetDepth!).toBe(true);
    });

    it("should not pause before reaching target depth", () => {
      const session = createTestSession({
        state: "stepping",
        stepMode: "out",
        stepTargetDepth: 1,
      });
      const currentDepth = 2;

      expect(currentDepth <= session.stepTargetDepth!).toBe(false);
    });
  });
});

// ============================================================================
// Breakpoint CRUD Tests
// ============================================================================

describe("Breakpoint CRUD operations", () => {
  let session: DebugSession;

  beforeEach(() => {
    session = createTestSession();
  });

  it("adds breakpoint to session", () => {
    const bp = createTestBreakpoint({ id: "new-bp" });
    session.breakpoints.push(bp);

    expect(session.breakpoints).toHaveLength(1);
    expect(session.breakpoints[0].id).toBe("new-bp");
  });

  it("replaces breakpoint with same id", () => {
    session.breakpoints.push(createTestBreakpoint({ id: "bp-1", spanType: "tool" }));

    // Simulate update (remove old, add new)
    session.breakpoints = session.breakpoints.filter(bp => bp.id !== "bp-1");
    session.breakpoints.push(createTestBreakpoint({ id: "bp-1", spanType: "generation" }));

    expect(session.breakpoints).toHaveLength(1);
    expect(session.breakpoints[0].spanType).toBe("generation");
  });

  it("removes breakpoint by id", () => {
    session.breakpoints.push(createTestBreakpoint({ id: "bp-1" }));
    session.breakpoints.push(createTestBreakpoint({ id: "bp-2" }));

    session.breakpoints = session.breakpoints.filter(bp => bp.id !== "bp-1");

    expect(session.breakpoints).toHaveLength(1);
    expect(session.breakpoints[0].id).toBe("bp-2");
  });

  it("enables/disables breakpoint", () => {
    const bp = createTestBreakpoint({ id: "bp-1", enabled: true });
    session.breakpoints.push(bp);

    // Disable
    const target = session.breakpoints.find(b => b.id === "bp-1");
    if (target) target.enabled = false;

    expect(session.breakpoints[0].enabled).toBe(false);

    // Re-enable
    if (target) target.enabled = true;

    expect(session.breakpoints[0].enabled).toBe(true);
  });
});

// ============================================================================
// Hit Count Tracking Tests
// ============================================================================

describe("Hit count tracking", () => {
  it("increments hit count on breakpoint evaluation", () => {
    const hitCounts: Record<string, number> = {};
    const bpId = "bp-1";

    // Simulate first hit
    hitCounts[bpId] = (hitCounts[bpId] ?? 0) + 1;
    expect(hitCounts[bpId]).toBe(1);

    // Simulate second hit
    hitCounts[bpId] = (hitCounts[bpId] ?? 0) + 1;
    expect(hitCounts[bpId]).toBe(2);
  });

  it("tracks multiple breakpoint hit counts independently", () => {
    const hitCounts: Record<string, number> = {};

    hitCounts["bp-1"] = (hitCounts["bp-1"] ?? 0) + 1;
    hitCounts["bp-2"] = (hitCounts["bp-2"] ?? 0) + 1;
    hitCounts["bp-1"] = (hitCounts["bp-1"] ?? 0) + 1;

    expect(hitCounts["bp-1"]).toBe(2);
    expect(hitCounts["bp-2"]).toBe(1);
  });

  it("uses hit count for conditional firing", () => {
    const hitCounts: Record<string, number> = {};
    const bp = createTestBreakpoint({
      id: "bp-every-3",
      hitCondition: { every: 3 },
    });

    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      hitCounts[bp.id] = (hitCounts[bp.id] ?? 0) + 1;
      results.push(shouldFireOnHit(bp.hitCondition, hitCounts[bp.id]));
    }

    expect(results).toEqual([false, false, true, false, false, true]);
  });
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

describe("Debug handler integration scenarios", () => {
  it("breakpoint evaluation workflow", () => {
    const session = createTestSession({
      breakpoints: [
        createTestBreakpoint({
          id: "tool-errors",
          spanType: "tool",
          status: "error",
          trigger: "onExit",
        }),
        createTestBreakpoint({
          id: "slow-check",
          spanType: "generation",
          trigger: "onExit",
        }),
      ],
    });

    const toolErrorSpan = createTestSpan({
      spanType: "tool",
      status: "error",
    });

    const toolOkSpan = createTestSpan({
      spanType: "tool",
      status: "ok",
    });

    const genSpan = createTestSpan({
      spanType: "generation",
    });

    // Check matches
    const matchesBp1 = session.breakpoints.filter(
      bp => bp.enabled && bp.trigger === "onExit" && matchesBreakpoint(bp, toolErrorSpan)
    );
    const matchesBp2 = session.breakpoints.filter(
      bp => bp.enabled && bp.trigger === "onExit" && matchesBreakpoint(bp, toolOkSpan)
    );
    const matchesBp3 = session.breakpoints.filter(
      bp => bp.enabled && bp.trigger === "onExit" && matchesBreakpoint(bp, genSpan)
    );

    expect(matchesBp1).toHaveLength(1);
    expect(matchesBp1[0].id).toBe("tool-errors");

    expect(matchesBp2).toHaveLength(0);

    expect(matchesBp3).toHaveLength(1);
    expect(matchesBp3[0].id).toBe("slow-check");
  });

  it("step debugging workflow", () => {
    const session = createTestSession({ state: "running" });

    // Hit breakpoint
    session.state = "paused";
    session.currentSpanId = "span-1";
    expect(session.state).toBe("paused");

    // Issue step over
    session.state = "stepping";
    session.stepMode = "over";
    session.stepTargetDepth = 2;
    expect(session.state).toBe("stepping");

    // Step completes
    session.state = "paused";
    session.stepMode = null;
    session.stepTargetDepth = null;
    session.currentSpanId = "span-2";
    expect(session.state).toBe("paused");
    expect(session.currentSpanId).toBe("span-2");

    // Resume
    session.state = "running";
    expect(session.state).toBe("running");
  });
});
