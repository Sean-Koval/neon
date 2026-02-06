/**
 * Tests for Debug Handler Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initDebugSession,
  getDebugSession,
  updateDebugSession,
  endDebugSession,
  evaluateBreakpoints,
  handleDebugControl,
  checkStepPause,
  addBreakpoint,
  removeBreakpoint,
  setBreakpointEnabled,
  waitForResume,
  type DebugBreakpoint,
  type DebugSession,
} from "../activities/debug-handler";
import type { Span, SpanType } from "@neon/shared";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a mock span
function createMockSpan(options: Partial<Span> = {}): Span {
  return {
    spanId: options.spanId ?? "span-123",
    traceId: options.traceId ?? "trace-123",
    projectId: options.projectId ?? "project-1",
    name: options.name ?? "test-span",
    kind: options.kind ?? "internal",
    spanType: options.spanType ?? "generation",
    timestamp: options.timestamp ?? new Date(),
    durationMs: options.durationMs ?? 100,
    status: options.status ?? "ok",
    attributes: options.attributes ?? {},
    ...options,
  };
}

describe("initDebugSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("creates a new debug session", async () => {
    const session = await initDebugSession({
      traceId: "trace-123",
      projectId: "project-1",
    });

    expect(session.traceId).toBe("trace-123");
    expect(session.projectId).toBe("project-1");
    expect(session.state).toBe("running");
    expect(session.breakpoints).toEqual([]);
    expect(session.hitCounts).toEqual({});
    expect(session.createdAt).toBeInstanceOf(Date);
  });

  it("creates session with breakpoints", async () => {
    const breakpoints: DebugBreakpoint[] = [
      { id: "bp-1", enabled: true, spanType: "tool", trigger: "onEnter" },
    ];

    const session = await initDebugSession({
      traceId: "trace-123",
      projectId: "project-1",
      breakpoints,
    });

    expect(session.breakpoints).toHaveLength(1);
    expect(session.breakpoints[0].id).toBe("bp-1");
  });

  it("emits sessionStarted event", async () => {
    await initDebugSession({
      traceId: "trace-event-test",
      projectId: "project-1",
    });

    const eventCall = mockFetch.mock.calls.find(
      (call) => (call[0] as string).includes("/api/debug/events")
    );

    expect(eventCall).toBeDefined();
    const body = JSON.parse(eventCall![1].body);
    expect(body.type).toBe("sessionStarted");
    expect(body.traceId).toBe("trace-event-test");
  });
});

describe("getDebugSession", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("returns session if exists", async () => {
    await initDebugSession({
      traceId: "trace-get-test",
      projectId: "project-1",
    });

    const session = await getDebugSession("trace-get-test");

    expect(session).not.toBeNull();
    expect(session?.traceId).toBe("trace-get-test");
  });

  it("returns null for non-existent session", async () => {
    const session = await getDebugSession("nonexistent-trace");

    expect(session).toBeNull();
  });
});

describe("updateDebugSession", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("updates session state", async () => {
    await initDebugSession({
      traceId: "trace-update-test",
      projectId: "project-1",
    });

    const updated = await updateDebugSession("trace-update-test", {
      state: "paused",
      currentSpanId: "span-456",
    });

    expect(updated?.state).toBe("paused");
    expect(updated?.currentSpanId).toBe("span-456");
  });

  it("returns null for non-existent session", async () => {
    const result = await updateDebugSession("nonexistent", { state: "paused" });

    expect(result).toBeNull();
  });
});

describe("endDebugSession", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("removes session and emits event", async () => {
    await initDebugSession({
      traceId: "trace-end-test",
      projectId: "project-1",
    });

    await endDebugSession("trace-end-test");

    const session = await getDebugSession("trace-end-test");
    expect(session).toBeNull();

    const eventCall = mockFetch.mock.calls.find(
      (call) =>
        (call[0] as string).includes("/api/debug/events") &&
        JSON.parse(call[1].body).type === "sessionEnded"
    );
    expect(eventCall).toBeDefined();
  });

  it("handles non-existent session gracefully", async () => {
    await expect(endDebugSession("nonexistent")).resolves.not.toThrow();
  });
});

describe("evaluateBreakpoints", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("returns shouldPause: false when no breakpoints match", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-1",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, spanType: "tool", trigger: "onEnter" },
      ],
    });

    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-1",
      span: createMockSpan({ spanType: "generation" }),
      trigger: "onEnter",
    });

    expect(result.shouldPause).toBe(false);
    expect(result.matchedBreakpoints).toHaveLength(0);
  });

  it("returns shouldPause: true when breakpoint matches", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-2",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, spanType: "tool", trigger: "onEnter" },
      ],
    });

    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-2",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });

    expect(result.shouldPause).toBe(true);
    expect(result.matchedBreakpoints).toHaveLength(1);
    expect(result.matchedBreakpoints[0].id).toBe("bp-1");
  });

  it("respects disabled breakpoints", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-3",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: false, spanType: "tool", trigger: "onEnter" },
      ],
    });

    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-3",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });

    expect(result.shouldPause).toBe(false);
  });

  it("respects trigger type", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-4",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, spanType: "tool", trigger: "onExit" },
      ],
    });

    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-4",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });

    expect(result.shouldPause).toBe(false);
  });

  it("matches span name with glob pattern", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-5",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, spanName: "llm:*", trigger: "onEnter" },
      ],
    });

    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-5",
      span: createMockSpan({ name: "llm:claude-3" }),
      trigger: "onEnter",
    });

    expect(result.shouldPause).toBe(true);
  });

  it("tracks hit counts", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-6",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, spanType: "tool", trigger: "onEnter" },
      ],
    });

    await evaluateBreakpoints({
      traceId: "trace-bp-test-6",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });

    await evaluateBreakpoints({
      traceId: "trace-bp-test-6",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });

    const session = await getDebugSession("trace-bp-test-6");
    expect(session?.hitCounts["bp-1"]).toBe(2);
  });

  it("respects hitCondition: number", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-7",
      projectId: "project-1",
      breakpoints: [
        {
          id: "bp-1",
          enabled: true,
          spanType: "tool",
          trigger: "onEnter",
          hitCondition: 3,
        },
      ],
    });

    // First two hits should not pause
    for (let i = 0; i < 2; i++) {
      const result = await evaluateBreakpoints({
        traceId: "trace-bp-test-7",
        span: createMockSpan({ spanType: "tool" }),
        trigger: "onEnter",
      });
      expect(result.shouldPause).toBe(false);
    }

    // Third hit should pause
    const result = await evaluateBreakpoints({
      traceId: "trace-bp-test-7",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });
    expect(result.shouldPause).toBe(true);
  });

  it("respects hitCondition: { every: n }", async () => {
    await initDebugSession({
      traceId: "trace-bp-test-8",
      projectId: "project-1",
      breakpoints: [
        {
          id: "bp-1",
          enabled: true,
          spanType: "tool",
          trigger: "onEnter",
          hitCondition: { every: 2 },
        },
      ],
    });

    // Hit 1 - no pause (1 % 2 != 0)
    let result = await evaluateBreakpoints({
      traceId: "trace-bp-test-8",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });
    expect(result.shouldPause).toBe(false);

    // Hit 2 - pause (2 % 2 == 0)
    result = await evaluateBreakpoints({
      traceId: "trace-bp-test-8",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });
    expect(result.shouldPause).toBe(true);

    // Hit 3 - no pause
    result = await evaluateBreakpoints({
      traceId: "trace-bp-test-8",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });
    expect(result.shouldPause).toBe(false);

    // Hit 4 - pause
    result = await evaluateBreakpoints({
      traceId: "trace-bp-test-8",
      span: createMockSpan({ spanType: "tool" }),
      trigger: "onEnter",
    });
    expect(result.shouldPause).toBe(true);
  });
});

describe("handleDebugControl", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("handles resume command", async () => {
    await initDebugSession({
      traceId: "trace-control-1",
      projectId: "project-1",
    });

    await updateDebugSession("trace-control-1", { state: "paused" });

    const result = await handleDebugControl({
      traceId: "trace-control-1",
      command: "resume",
    });

    expect(result?.state).toBe("running");
    expect(result?.stepMode).toBeNull();
  });

  it("handles stepOver command", async () => {
    await initDebugSession({
      traceId: "trace-control-2",
      projectId: "project-1",
    });

    const result = await handleDebugControl({
      traceId: "trace-control-2",
      command: "stepOver",
      currentSpanDepth: 2,
    });

    expect(result?.state).toBe("stepping");
    expect(result?.stepMode).toBe("over");
    expect(result?.stepTargetDepth).toBe(2);
  });

  it("handles stepInto command", async () => {
    await initDebugSession({
      traceId: "trace-control-3",
      projectId: "project-1",
    });

    const result = await handleDebugControl({
      traceId: "trace-control-3",
      command: "stepInto",
      currentSpanDepth: 2,
    });

    expect(result?.state).toBe("stepping");
    expect(result?.stepMode).toBe("into");
    expect(result?.stepTargetDepth).toBe(3);
  });

  it("handles stepOut command", async () => {
    await initDebugSession({
      traceId: "trace-control-4",
      projectId: "project-1",
    });

    const result = await handleDebugControl({
      traceId: "trace-control-4",
      command: "stepOut",
      currentSpanDepth: 2,
    });

    expect(result?.state).toBe("stepping");
    expect(result?.stepMode).toBe("out");
    expect(result?.stepTargetDepth).toBe(1);
  });

  it("handles pause command", async () => {
    await initDebugSession({
      traceId: "trace-control-5",
      projectId: "project-1",
    });

    const result = await handleDebugControl({
      traceId: "trace-control-5",
      command: "pause",
    });

    expect(result?.state).toBe("paused");
    expect(result?.pausedAt).toBeInstanceOf(Date);
  });

  it("returns null for non-existent session", async () => {
    const result = await handleDebugControl({
      traceId: "nonexistent",
      command: "resume",
    });

    expect(result).toBeNull();
  });
});

describe("checkStepPause", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("returns false when not stepping", async () => {
    await initDebugSession({
      traceId: "trace-step-1",
      projectId: "project-1",
    });

    const result = await checkStepPause(
      "trace-step-1",
      createMockSpan({}),
      1,
      "onEnter"
    );

    expect(result).toBe(false);
  });

  it("pauses on stepOver at same or shallower depth", async () => {
    await initDebugSession({
      traceId: "trace-step-2",
      projectId: "project-1",
    });

    await handleDebugControl({
      traceId: "trace-step-2",
      command: "stepOver",
      currentSpanDepth: 2,
    });

    const result = await checkStepPause(
      "trace-step-2",
      createMockSpan({}),
      2,
      "onEnter"
    );

    expect(result).toBe(true);

    const session = await getDebugSession("trace-step-2");
    expect(session?.state).toBe("paused");
    expect(session?.stepMode).toBeNull();
  });

  it("pauses on stepInto immediately", async () => {
    await initDebugSession({
      traceId: "trace-step-3",
      projectId: "project-1",
    });

    await handleDebugControl({
      traceId: "trace-step-3",
      command: "stepInto",
      currentSpanDepth: 1,
    });

    const result = await checkStepPause(
      "trace-step-3",
      createMockSpan({}),
      2,
      "onEnter"
    );

    expect(result).toBe(true);
  });

  it("pauses on stepOut at parent level", async () => {
    await initDebugSession({
      traceId: "trace-step-4",
      projectId: "project-1",
    });

    await handleDebugControl({
      traceId: "trace-step-4",
      command: "stepOut",
      currentSpanDepth: 3,
    });

    const result = await checkStepPause(
      "trace-step-4",
      createMockSpan({}),
      2,
      "onExit"
    );

    expect(result).toBe(true);
  });
});

describe("breakpoint CRUD", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("adds a breakpoint", async () => {
    await initDebugSession({
      traceId: "trace-crud-1",
      projectId: "project-1",
    });

    const added = await addBreakpoint("trace-crud-1", {
      id: "bp-new",
      enabled: true,
      spanType: "tool",
      trigger: "onEnter",
    });

    expect(added).toBe(true);

    const session = await getDebugSession("trace-crud-1");
    expect(session?.breakpoints).toHaveLength(1);
    expect(session?.breakpoints[0].id).toBe("bp-new");
  });

  it("removes a breakpoint", async () => {
    await initDebugSession({
      traceId: "trace-crud-2",
      projectId: "project-1",
      breakpoints: [
        { id: "bp-1", enabled: true, trigger: "onEnter" },
        { id: "bp-2", enabled: true, trigger: "onExit" },
      ],
    });

    const removed = await removeBreakpoint("trace-crud-2", "bp-1");

    expect(removed).toBe(true);

    const session = await getDebugSession("trace-crud-2");
    expect(session?.breakpoints).toHaveLength(1);
    expect(session?.breakpoints[0].id).toBe("bp-2");
  });

  it("enables/disables a breakpoint", async () => {
    await initDebugSession({
      traceId: "trace-crud-3",
      projectId: "project-1",
      breakpoints: [{ id: "bp-1", enabled: true, trigger: "onEnter" }],
    });

    await setBreakpointEnabled("trace-crud-3", "bp-1", false);

    const session = await getDebugSession("trace-crud-3");
    expect(session?.breakpoints[0].enabled).toBe(false);

    await setBreakpointEnabled("trace-crud-3", "bp-1", true);

    const updated = await getDebugSession("trace-crud-3");
    expect(updated?.breakpoints[0].enabled).toBe(true);
  });

  it("returns false for operations on non-existent session", async () => {
    expect(await addBreakpoint("nonexistent", { id: "bp", enabled: true, trigger: "onEnter" })).toBe(false);
    expect(await removeBreakpoint("nonexistent", "bp")).toBe(false);
    expect(await setBreakpointEnabled("nonexistent", "bp", true)).toBe(false);
  });
});

describe("waitForResume", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("returns immediately when session is running", async () => {
    await initDebugSession({
      traceId: "trace-wait-1",
      projectId: "project-1",
    });

    const startTime = Date.now();
    const result = await waitForResume("trace-wait-1");
    const elapsed = Date.now() - startTime;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });

  it("returns false for non-existent session", async () => {
    const result = await waitForResume("nonexistent");

    expect(result).toBe(false);
  });

  it("returns false for completed session", async () => {
    await initDebugSession({
      traceId: "trace-wait-2",
      projectId: "project-1",
    });

    await updateDebugSession("trace-wait-2", { state: "completed" });

    const result = await waitForResume("trace-wait-2");

    expect(result).toBe(false);
  });

  it("resolves when resume command is sent", async () => {
    await initDebugSession({
      traceId: "trace-wait-3",
      projectId: "project-1",
    });

    await updateDebugSession("trace-wait-3", { state: "paused" });

    // Start waiting (with short timeout)
    const waitPromise = waitForResume("trace-wait-3", 5000);

    // Resume after a short delay
    setTimeout(async () => {
      await handleDebugControl({
        traceId: "trace-wait-3",
        command: "resume",
      });
    }, 50);

    const result = await waitPromise;
    expect(result).toBe(true);
  });

  it("times out and auto-resumes", async () => {
    await initDebugSession({
      traceId: "trace-wait-4",
      projectId: "project-1",
    });

    await updateDebugSession("trace-wait-4", { state: "paused" });

    const startTime = Date.now();
    const result = await waitForResume("trace-wait-4", 100); // Short timeout
    const elapsed = Date.now() - startTime;

    expect(result).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(95);

    // Session should be auto-resumed
    const session = await getDebugSession("trace-wait-4");
    expect(session?.state).toBe("running");
  });
});
