/**
 * Tests for Breakpoint Definition API
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Span, Trace, SpanWithChildren } from "@neon/shared";
import {
  defineBreakpoint,
  resetBreakpointIdCounter,
  onSpanType,
  onComponentType,
  onSpanName,
  onSpanNameGlob,
  onTool,
  onModel,
  onError,
  onSuccess,
  onAttribute,
  onCondition,
  and,
  or,
  not,
  matchesSpan,
  shouldFire,
  BreakpointManager,
  getBreakpointManager,
  resetBreakpointManager,
  addBreakpoint,
  removeBreakpoint,
  evaluateBreakpoints,
  type Breakpoint,
  type SpanMatcher,
  type BreakpointContext,
} from "../debugging/breakpoints";

// Test fixtures
function createSpan(overrides: Partial<Span> = {}): Span {
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

function createTrace(overrides: Partial<Trace> = {}): Trace {
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

function createSpanWithChildren(
  overrides: Partial<Span> = {},
  children: SpanWithChildren[] = []
): SpanWithChildren {
  return {
    ...createSpan(overrides),
    children,
  };
}

describe("defineBreakpoint", () => {
  beforeEach(() => {
    resetBreakpointIdCounter();
    resetBreakpointManager();
  });

  it("creates a breakpoint with default values", () => {
    const bp = defineBreakpoint({
      matcher: { spanType: "tool" },
    });

    expect(bp.id).toBe("bp-1");
    expect(bp.enabled).toBe(true);
    expect(bp.triggers).toEqual(["onExit"]);
    expect(bp.action).toEqual({ type: "log" });
    expect(bp.hitCondition).toBe("always");
  });

  it("creates a breakpoint with custom ID and name", () => {
    const bp = defineBreakpoint({
      id: "custom-id",
      name: "Tool Error Breakpoint",
      description: "Fires on tool errors",
      matcher: { spanType: "tool", status: "error" },
    });

    expect(bp.id).toBe("custom-id");
    expect(bp.name).toBe("Tool Error Breakpoint");
    expect(bp.description).toBe("Fires on tool errors");
  });

  it("normalizes single trigger to array", () => {
    const bp = defineBreakpoint({
      matcher: { spanType: "generation" },
      trigger: "onEnter",
    });

    expect(bp.triggers).toEqual(["onEnter"]);
  });

  it("preserves trigger array", () => {
    const bp = defineBreakpoint({
      matcher: { spanType: "generation" },
      trigger: ["onEnter", "onExit", "onError"],
    });

    expect(bp.triggers).toEqual(["onEnter", "onExit", "onError"]);
  });

  it("auto-increments IDs", () => {
    const bp1 = defineBreakpoint({ matcher: {} });
    const bp2 = defineBreakpoint({ matcher: {} });
    const bp3 = defineBreakpoint({ matcher: {} });

    expect(bp1.id).toBe("bp-1");
    expect(bp2.id).toBe("bp-2");
    expect(bp3.id).toBe("bp-3");
  });
});

describe("Matcher Factories", () => {
  describe("onSpanType", () => {
    it("creates matcher for single span type", () => {
      const matcher = onSpanType("tool");
      expect(matcher).toEqual({ spanType: "tool" });
    });

    it("creates matcher for multiple span types", () => {
      const matcher = onSpanType(["tool", "generation"]);
      expect(matcher).toEqual({ spanType: ["tool", "generation"] });
    });
  });

  describe("onComponentType", () => {
    it("creates matcher for single component type", () => {
      const matcher = onComponentType("reasoning");
      expect(matcher).toEqual({ componentType: "reasoning" });
    });

    it("creates matcher for multiple component types", () => {
      const matcher = onComponentType(["planning", "reasoning"]);
      expect(matcher).toEqual({ componentType: ["planning", "reasoning"] });
    });
  });

  describe("onSpanName", () => {
    it("creates matcher for exact name", () => {
      const matcher = onSpanName("process-query");
      expect(matcher).toEqual({ name: "process-query" });
    });

    it("creates matcher for regex pattern", () => {
      const pattern = /^process-.+/;
      const matcher = onSpanName(pattern);
      expect(matcher).toEqual({ name: pattern });
    });
  });

  describe("onSpanNameGlob", () => {
    it("creates matcher with glob pattern", () => {
      const matcher = onSpanNameGlob("process-*");
      expect(matcher).toEqual({ nameGlob: "process-*" });
    });
  });

  describe("onTool", () => {
    it("creates matcher for tool name", () => {
      const matcher = onTool("get_weather");
      expect(matcher).toEqual({ spanType: "tool", toolName: "get_weather" });
    });

    it("creates matcher for tool name regex", () => {
      const pattern = /^get_/;
      const matcher = onTool(pattern);
      expect(matcher).toEqual({ spanType: "tool", toolName: pattern });
    });
  });

  describe("onModel", () => {
    it("creates matcher for model name", () => {
      const matcher = onModel("gpt-4");
      expect(matcher).toEqual({ spanType: "generation", model: "gpt-4" });
    });
  });

  describe("onError and onSuccess", () => {
    it("creates error matcher", () => {
      const matcher = onError();
      expect(matcher).toEqual({ status: "error" });
    });

    it("creates success matcher", () => {
      const matcher = onSuccess();
      expect(matcher).toEqual({ status: "ok" });
    });
  });

  describe("onAttribute", () => {
    it("creates attribute matcher", () => {
      const matcher = onAttribute("env", "production");
      expect(matcher).toEqual({ attributes: { env: "production" } });
    });

    it("creates attribute matcher with regex", () => {
      const pattern = /^req-/;
      const matcher = onAttribute("request_id", pattern);
      expect(matcher).toEqual({ attributes: { request_id: pattern } });
    });
  });

  describe("onCondition", () => {
    it("creates condition matcher", () => {
      const predicate = (span: Span) => span.durationMs > 1000;
      const matcher = onCondition(predicate);
      expect(matcher.condition).toBe(predicate);
    });
  });
});

describe("Matcher Combinators", () => {
  describe("and", () => {
    it("combines matchers with AND logic", () => {
      const matcher = and(onSpanType("tool"), onError());
      const toolError = createSpan({ spanType: "tool", status: "error" });
      const toolSuccess = createSpan({ spanType: "tool", status: "ok" });
      const genError = createSpan({ spanType: "generation", status: "error" });

      expect(matchesSpan(matcher, toolError)).toBe(true);
      expect(matchesSpan(matcher, toolSuccess)).toBe(false);
      expect(matchesSpan(matcher, genError)).toBe(false);
    });
  });

  describe("or", () => {
    it("combines matchers with OR logic", () => {
      const matcher = or(onSpanType("tool"), onSpanType("generation"));
      const toolSpan = createSpan({ spanType: "tool" });
      const genSpan = createSpan({ spanType: "generation" });
      const eventSpan = createSpan({ spanType: "event" });

      expect(matchesSpan(matcher, toolSpan)).toBe(true);
      expect(matchesSpan(matcher, genSpan)).toBe(true);
      expect(matchesSpan(matcher, eventSpan)).toBe(false);
    });
  });

  describe("not", () => {
    it("negates a matcher", () => {
      const matcher = not(onError());
      const successSpan = createSpan({ status: "ok" });
      const errorSpan = createSpan({ status: "error" });

      expect(matchesSpan(matcher, successSpan)).toBe(true);
      expect(matchesSpan(matcher, errorSpan)).toBe(false);
    });
  });

  it("supports complex combinations", () => {
    // (tool AND error) OR (generation AND slow)
    const matcher = or(
      and(onSpanType("tool"), onError()),
      and(onSpanType("generation"), onCondition((s) => s.durationMs > 5000))
    );

    expect(matchesSpan(matcher, createSpan({ spanType: "tool", status: "error" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "generation", durationMs: 6000 }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "tool", status: "ok" }))).toBe(false);
    expect(matchesSpan(matcher, createSpan({ spanType: "generation", durationMs: 1000 }))).toBe(false);
  });
});

describe("matchesSpan", () => {
  it("matches by span type (single)", () => {
    const matcher: SpanMatcher = { spanType: "tool" };
    expect(matchesSpan(matcher, createSpan({ spanType: "tool" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "generation" }))).toBe(false);
  });

  it("matches by span type (multiple)", () => {
    const matcher: SpanMatcher = { spanType: ["tool", "generation"] };
    expect(matchesSpan(matcher, createSpan({ spanType: "tool" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "generation" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "event" }))).toBe(false);
  });

  it("matches by component type", () => {
    const matcher: SpanMatcher = { componentType: "reasoning" };
    expect(matchesSpan(matcher, createSpan({ componentType: "reasoning" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ componentType: "tool" }))).toBe(false);
    expect(matchesSpan(matcher, createSpan({}))).toBe(false);
  });

  it("matches by name (exact string)", () => {
    const matcher: SpanMatcher = { name: "process-query" };
    expect(matchesSpan(matcher, createSpan({ name: "process-query" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "process-data" }))).toBe(false);
  });

  it("matches by name (regex)", () => {
    const matcher: SpanMatcher = { name: /^process-.+/ };
    expect(matchesSpan(matcher, createSpan({ name: "process-query" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "process-data" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "handle-error" }))).toBe(false);
  });

  it("matches by name glob pattern", () => {
    const matcher: SpanMatcher = { nameGlob: "process-*" };
    expect(matchesSpan(matcher, createSpan({ name: "process-query" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "process-data" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "handle-error" }))).toBe(false);
  });

  it("matches by glob with question mark", () => {
    const matcher: SpanMatcher = { nameGlob: "step-?" };
    expect(matchesSpan(matcher, createSpan({ name: "step-1" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "step-A" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ name: "step-10" }))).toBe(false);
  });

  it("matches by status", () => {
    const matcher: SpanMatcher = { status: "error" };
    expect(matchesSpan(matcher, createSpan({ status: "error" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ status: "ok" }))).toBe(false);
  });

  it("matches by tool name", () => {
    const matcher: SpanMatcher = { toolName: "get_weather" };
    expect(matchesSpan(matcher, createSpan({ toolName: "get_weather" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ toolName: "search" }))).toBe(false);
    expect(matchesSpan(matcher, createSpan({}))).toBe(false);
  });

  it("matches by model name", () => {
    const matcher: SpanMatcher = { model: /^gpt-4/ };
    expect(matchesSpan(matcher, createSpan({ model: "gpt-4" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ model: "gpt-4-turbo" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ model: "claude-3" }))).toBe(false);
  });

  it("matches by attributes", () => {
    const matcher: SpanMatcher = { attributes: { env: "production" } };
    expect(matchesSpan(matcher, createSpan({ attributes: { env: "production" } }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ attributes: { env: "staging" } }))).toBe(false);
    expect(matchesSpan(matcher, createSpan({ attributes: {} }))).toBe(false);
  });

  it("matches by attributes with regex", () => {
    const matcher: SpanMatcher = { attributes: { request_id: /^req-\d+$/ } };
    expect(matchesSpan(matcher, createSpan({ attributes: { request_id: "req-123" } }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ attributes: { request_id: "id-123" } }))).toBe(false);
  });

  it("matches by custom condition", () => {
    const matcher: SpanMatcher = { condition: (span) => span.durationMs > 1000 };
    expect(matchesSpan(matcher, createSpan({ durationMs: 2000 }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ durationMs: 500 }))).toBe(false);
  });

  it("matches with multiple criteria (all must match)", () => {
    const matcher: SpanMatcher = {
      spanType: "generation",
      model: /^gpt/,
      status: "ok",
    };
    expect(
      matchesSpan(matcher, createSpan({ spanType: "generation", model: "gpt-4", status: "ok" }))
    ).toBe(true);
    expect(
      matchesSpan(matcher, createSpan({ spanType: "generation", model: "claude-3", status: "ok" }))
    ).toBe(false);
    expect(
      matchesSpan(matcher, createSpan({ spanType: "tool", model: "gpt-4", status: "ok" }))
    ).toBe(false);
  });

  it("matches empty matcher (matches all spans)", () => {
    const matcher: SpanMatcher = {};
    expect(matchesSpan(matcher, createSpan())).toBe(true);
    expect(matchesSpan(matcher, createSpan({ spanType: "tool" }))).toBe(true);
    expect(matchesSpan(matcher, createSpan({ status: "error" }))).toBe(true);
  });
});

describe("shouldFire (hit conditions)", () => {
  it("always fires for 'always' condition", () => {
    expect(shouldFire("always", 1)).toBe(true);
    expect(shouldFire("always", 100)).toBe(true);
  });

  it("fires only on specific hit count for number condition", () => {
    expect(shouldFire(5, 1)).toBe(false);
    expect(shouldFire(5, 5)).toBe(true);
    expect(shouldFire(5, 10)).toBe(false);
  });

  it("fires every N hits for 'every' condition", () => {
    expect(shouldFire({ every: 3 }, 1)).toBe(false);
    expect(shouldFire({ every: 3 }, 2)).toBe(false);
    expect(shouldFire({ every: 3 }, 3)).toBe(true);
    expect(shouldFire({ every: 3 }, 4)).toBe(false);
    expect(shouldFire({ every: 3 }, 6)).toBe(true);
  });

  it("fires after N hits for 'after' condition", () => {
    expect(shouldFire({ after: 3 }, 1)).toBe(false);
    expect(shouldFire({ after: 3 }, 2)).toBe(false);
    expect(shouldFire({ after: 3 }, 3)).toBe(false);
    expect(shouldFire({ after: 3 }, 4)).toBe(true);
    expect(shouldFire({ after: 3 }, 100)).toBe(true);
  });

  it("fires until N hits for 'until' condition", () => {
    expect(shouldFire({ until: 3 }, 1)).toBe(true);
    expect(shouldFire({ until: 3 }, 2)).toBe(true);
    expect(shouldFire({ until: 3 }, 3)).toBe(true);
    expect(shouldFire({ until: 3 }, 4)).toBe(false);
    expect(shouldFire({ until: 3 }, 100)).toBe(false);
  });
});

describe("BreakpointManager", () => {
  let manager: BreakpointManager;

  beforeEach(() => {
    manager = new BreakpointManager();
    resetBreakpointIdCounter();
  });

  describe("registration", () => {
    it("registers and retrieves breakpoints", () => {
      const bp = defineBreakpoint({ id: "test", matcher: { spanType: "tool" } });
      manager.register(bp);

      expect(manager.get("test")).toBe(bp);
      expect(manager.getAll()).toHaveLength(1);
    });

    it("registers multiple breakpoints", () => {
      const bp1 = defineBreakpoint({ id: "bp1", matcher: {} });
      const bp2 = defineBreakpoint({ id: "bp2", matcher: {} });

      manager.registerAll([bp1, bp2]);

      expect(manager.getAll()).toHaveLength(2);
    });

    it("unregisters breakpoints", () => {
      const bp = defineBreakpoint({ id: "test", matcher: {} });
      manager.register(bp);

      expect(manager.unregister("test")).toBe(true);
      expect(manager.get("test")).toBeUndefined();
      expect(manager.unregister("nonexistent")).toBe(false);
    });

    it("clears all breakpoints", () => {
      manager.register(defineBreakpoint({ matcher: {} }));
      manager.register(defineBreakpoint({ matcher: {} }));

      manager.clear();

      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe("enable/disable", () => {
    it("enables and disables breakpoints", () => {
      const bp = defineBreakpoint({ id: "test", enabled: true, matcher: {} });
      manager.register(bp);

      expect(manager.disable("test")).toBe(true);
      expect(manager.get("test")?.enabled).toBe(false);

      expect(manager.enable("test")).toBe(true);
      expect(manager.get("test")?.enabled).toBe(true);
    });

    it("returns false for nonexistent breakpoint", () => {
      expect(manager.enable("nonexistent")).toBe(false);
      expect(manager.disable("nonexistent")).toBe(false);
    });

    it("getEnabled filters disabled breakpoints", () => {
      const bp1 = defineBreakpoint({ id: "enabled", enabled: true, matcher: {} });
      const bp2 = defineBreakpoint({ id: "disabled", enabled: false, matcher: {} });

      manager.registerAll([bp1, bp2]);

      const enabled = manager.getEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe("enabled");
    });
  });

  describe("evaluation", () => {
    it("evaluates breakpoints against spans", async () => {
      const handler = vi.fn();
      const bp = defineBreakpoint({
        id: "tool-bp",
        matcher: { spanType: "tool" },
        trigger: "onExit",
        action: { type: "notify", handler },
      });
      manager.register(bp);

      const span = createSpan({ spanType: "tool" });
      const trace = createTrace();

      const fired = await manager.evaluate(span, trace, "onExit");

      expect(fired).toHaveLength(1);
      expect(fired[0].id).toBe("tool-bp");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not fire for non-matching spans", async () => {
      const handler = vi.fn();
      const bp = defineBreakpoint({
        matcher: { spanType: "tool" },
        action: { type: "notify", handler },
      });
      manager.register(bp);

      const span = createSpan({ spanType: "generation" });
      const fired = await manager.evaluate(span, createTrace(), "onExit");

      expect(fired).toHaveLength(0);
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not fire for non-matching triggers", async () => {
      const handler = vi.fn();
      const bp = defineBreakpoint({
        matcher: { spanType: "tool" },
        trigger: "onError",
        action: { type: "notify", handler },
      });
      manager.register(bp);

      const span = createSpan({ spanType: "tool" });
      const fired = await manager.evaluate(span, createTrace(), "onExit");

      expect(fired).toHaveLength(0);
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not fire for disabled breakpoints", async () => {
      const handler = vi.fn();
      const bp = defineBreakpoint({
        matcher: { spanType: "tool" },
        enabled: false,
        action: { type: "notify", handler },
      });
      manager.register(bp);

      const span = createSpan({ spanType: "tool" });
      const fired = await manager.evaluate(span, createTrace(), "onExit");

      expect(fired).toHaveLength(0);
      expect(handler).not.toHaveBeenCalled();
    });

    it("tracks hit counts", async () => {
      const bp = defineBreakpoint({
        id: "test-bp",
        matcher: {},
        action: { type: "log" },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");
      expect(manager.getHitCount("test-bp")).toBe(1);

      await manager.evaluate(createSpan(), createTrace(), "onExit");
      expect(manager.getHitCount("test-bp")).toBe(2);
    });

    it("respects hit conditions", async () => {
      const handler = vi.fn();
      const bp = defineBreakpoint({
        id: "conditional",
        matcher: {},
        hitCondition: { every: 2 },
        action: { type: "notify", handler },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit"); // hit 1
      expect(handler).not.toHaveBeenCalled();

      await manager.evaluate(createSpan(), createTrace(), "onExit"); // hit 2
      expect(handler).toHaveBeenCalledTimes(1);

      await manager.evaluate(createSpan(), createTrace(), "onExit"); // hit 3
      expect(handler).toHaveBeenCalledTimes(1);

      await manager.evaluate(createSpan(), createTrace(), "onExit"); // hit 4
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("resets hit counts", async () => {
      const bp = defineBreakpoint({ id: "test", matcher: {} });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");
      await manager.evaluate(createSpan(), createTrace(), "onExit");
      expect(manager.getHitCount("test")).toBe(2);

      manager.resetHitCounts();
      expect(manager.getHitCount("test")).toBe(0);
    });
  });

  describe("actions", () => {
    it("executes log action", async () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      const bp = defineBreakpoint({
        id: "log-bp",
        matcher: {},
        action: { type: "log", message: "Test message" },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");

      expect(consoleSpy).toHaveBeenCalledWith("[Breakpoint log-bp] Test message");
      consoleSpy.mockRestore();
    });

    it("executes log action with interpolation", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const bp = defineBreakpoint({
        id: "log-bp",
        matcher: {},
        action: {
          type: "log",
          level: "warn",
          message: "Span: {{span.name}}, Duration: {{span.durationMs}}ms",
        },
      });
      manager.register(bp);

      await manager.evaluate(
        createSpan({ name: "test-op", durationMs: 500 }),
        createTrace(),
        "onExit"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Breakpoint log-bp] Span: test-op, Duration: 500ms"
      );
      consoleSpy.mockRestore();
    });

    it("executes capture action", async () => {
      const bp = defineBreakpoint({
        id: "capture-bp",
        matcher: {},
        action: { type: "capture" },
      });
      manager.register(bp);

      const span = createSpan({ name: "captured-span" });
      await manager.evaluate(span, createTrace(), "onExit");

      const captured = manager.getCaptured("capture-bp");
      expect(captured).toHaveLength(1);
      expect(captured[0].span.name).toBe("captured-span");
    });

    it("clears captured contexts", async () => {
      const bp = defineBreakpoint({
        id: "capture-bp",
        matcher: {},
        action: { type: "capture" },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");
      expect(manager.getCaptured("capture-bp")).toHaveLength(1);

      manager.clearCaptured("capture-bp");
      expect(manager.getCaptured("capture-bp")).toHaveLength(0);
    });

    it("executes custom action", async () => {
      const customHandler = vi.fn();

      const bp = defineBreakpoint({
        matcher: {},
        action: { type: "custom", handler: customHandler },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");

      expect(customHandler).toHaveBeenCalledTimes(1);
      expect(customHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          span: expect.any(Object),
          trace: expect.any(Object),
          breakpoint: expect.any(Object),
          hitCount: 1,
          trigger: "onExit",
        })
      );
    });

    it("handles async actions", async () => {
      const results: number[] = [];
      const asyncHandler = vi.fn(async (ctx: BreakpointContext) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(ctx.hitCount);
      });

      const bp = defineBreakpoint({
        matcher: {},
        action: { type: "notify", handler: asyncHandler },
      });
      manager.register(bp);

      await manager.evaluate(createSpan(), createTrace(), "onExit");
      await manager.evaluate(createSpan(), createTrace(), "onExit");

      expect(results).toEqual([1, 2]);
    });
  });
});

describe("Global Manager", () => {
  beforeEach(() => {
    resetBreakpointManager();
    resetBreakpointIdCounter();
  });

  it("provides singleton instance", () => {
    const m1 = getBreakpointManager();
    const m2 = getBreakpointManager();
    expect(m1).toBe(m2);
  });

  it("resets global manager", () => {
    const m1 = getBreakpointManager();
    resetBreakpointManager();
    const m2 = getBreakpointManager();
    expect(m1).not.toBe(m2);
  });

  it("addBreakpoint registers with global manager", () => {
    const bp = addBreakpoint({ matcher: { spanType: "tool" } });

    expect(getBreakpointManager().get(bp.id)).toBe(bp);
  });

  it("removeBreakpoint removes from global manager", () => {
    const bp = addBreakpoint({ id: "to-remove", matcher: {} });

    expect(removeBreakpoint("to-remove")).toBe(true);
    expect(getBreakpointManager().get("to-remove")).toBeUndefined();
  });
});

describe("Integration Scenarios", () => {
  beforeEach(() => {
    resetBreakpointIdCounter();
  });

  it("monitors slow LLM generations", async () => {
    const slowCalls: Span[] = [];
    const manager = new BreakpointManager();

    manager.register(
      defineBreakpoint({
        name: "slow-generations",
        matcher: {
          spanType: "generation",
          condition: (span) => span.durationMs > 5000,
        },
        action: {
          type: "notify",
          handler: (ctx) => slowCalls.push(ctx.span),
        },
      })
    );

    // Fast call - should not trigger
    await manager.evaluate(
      createSpan({ spanType: "generation", durationMs: 1000 }),
      createTrace(),
      "onExit"
    );

    // Slow call - should trigger
    await manager.evaluate(
      createSpan({ spanType: "generation", durationMs: 6000, name: "slow-gen" }),
      createTrace(),
      "onExit"
    );

    expect(slowCalls).toHaveLength(1);
    expect(slowCalls[0].name).toBe("slow-gen");
  });

  it("tracks tool errors with context", async () => {
    const errors: BreakpointContext[] = [];
    const manager = new BreakpointManager();

    manager.register(
      defineBreakpoint({
        name: "tool-errors",
        matcher: and(onSpanType("tool"), onError()),
        trigger: "onError",
        action: {
          type: "notify",
          handler: (ctx) => errors.push(ctx),
        },
      })
    );

    // Successful tool - should not trigger
    await manager.evaluate(
      createSpan({ spanType: "tool", status: "ok", toolName: "search" }),
      createTrace(),
      "onError"
    );

    // Failed tool - should trigger
    await manager.evaluate(
      createSpan({ spanType: "tool", status: "error", toolName: "api_call" }),
      createTrace(),
      "onError"
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].span.toolName).toBe("api_call");
  });

  it("samples every Nth request for analysis", async () => {
    const sampled: Span[] = [];
    const manager = new BreakpointManager();

    manager.register(
      defineBreakpoint({
        name: "sample-requests",
        matcher: {},
        hitCondition: { every: 10 },
        action: {
          type: "notify",
          handler: (ctx) => sampled.push(ctx.span),
        },
      })
    );

    // Simulate 25 requests
    for (let i = 1; i <= 25; i++) {
      await manager.evaluate(createSpan({ name: `request-${i}` }), createTrace(), "onExit");
    }

    // Should have sampled requests 10 and 20
    expect(sampled).toHaveLength(2);
    expect(sampled[0].name).toBe("request-10");
    expect(sampled[1].name).toBe("request-20");
  });
});

describe("evaluateBreakpoints (tree traversal)", () => {
  beforeEach(() => {
    resetBreakpointManager();
    resetBreakpointIdCounter();
  });

  it("evaluates breakpoints against flat span list", async () => {
    const fired: string[] = [];
    addBreakpoint({
      id: "tool-bp",
      matcher: { spanType: "tool" },
      action: { type: "notify", handler: (ctx) => fired.push(ctx.span.spanId) },
    });

    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ spanId: "span-1", spanType: "generation" }),
      createSpanWithChildren({ spanId: "span-2", spanType: "tool" }),
      createSpanWithChildren({ spanId: "span-3", spanType: "tool" }),
    ];

    const results = await evaluateBreakpoints(spans, createTrace(), "onExit");

    expect(fired).toEqual(["span-2", "span-3"]);
    expect(results.size).toBe(2);
    expect(results.get("span-2")).toHaveLength(1);
    expect(results.get("span-3")).toHaveLength(1);
  });

  it("evaluates breakpoints against nested span tree", async () => {
    const fired: string[] = [];
    addBreakpoint({
      id: "all-bp",
      matcher: {},
      action: { type: "notify", handler: (ctx) => fired.push(ctx.span.name) },
    });

    // Build a tree structure:
    // root
    // ├── child-1
    // │   ├── grandchild-1a
    // │   └── grandchild-1b
    // └── child-2
    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ spanId: "root", name: "root" }, [
        createSpanWithChildren({ spanId: "child-1", name: "child-1" }, [
          createSpanWithChildren({ spanId: "grandchild-1a", name: "grandchild-1a" }),
          createSpanWithChildren({ spanId: "grandchild-1b", name: "grandchild-1b" }),
        ]),
        createSpanWithChildren({ spanId: "child-2", name: "child-2" }),
      ]),
    ];

    const results = await evaluateBreakpoints(spans, createTrace(), "onExit");

    // Should visit all 5 spans in depth-first order
    expect(fired).toEqual(["root", "child-1", "grandchild-1a", "grandchild-1b", "child-2"]);
    expect(results.size).toBe(5);
  });

  it("only fires on matching spans in tree", async () => {
    const fired: string[] = [];
    addBreakpoint({
      id: "error-bp",
      matcher: { status: "error" },
      action: { type: "notify", handler: (ctx) => fired.push(ctx.span.name) },
    });

    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ spanId: "parent", name: "parent", status: "ok" }, [
        createSpanWithChildren({ spanId: "child-ok", name: "child-ok", status: "ok" }),
        createSpanWithChildren({ spanId: "child-error", name: "child-error", status: "error" }),
        createSpanWithChildren({ spanId: "child-ok-2", name: "child-ok-2", status: "ok" }, [
          createSpanWithChildren({ spanId: "nested-error", name: "nested-error", status: "error" }),
        ]),
      ]),
    ];

    const results = await evaluateBreakpoints(spans, createTrace(), "onExit");

    expect(fired).toEqual(["child-error", "nested-error"]);
    expect(results.size).toBe(2);
  });

  it("handles empty span list", async () => {
    addBreakpoint({
      matcher: {},
      action: { type: "log" },
    });

    const results = await evaluateBreakpoints([], createTrace(), "onExit");

    expect(results.size).toBe(0);
  });

  it("handles spans with empty children arrays", async () => {
    const fired: string[] = [];
    addBreakpoint({
      matcher: {},
      action: { type: "notify", handler: (ctx) => fired.push(ctx.span.name) },
    });

    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ name: "span-1" }, []),
      createSpanWithChildren({ name: "span-2" }, []),
    ];

    await evaluateBreakpoints(spans, createTrace(), "onExit");

    expect(fired).toEqual(["span-1", "span-2"]);
  });

  it("accumulates hit counts across tree traversal", async () => {
    const manager = getBreakpointManager();
    addBreakpoint({
      id: "counting-bp",
      matcher: {},
      action: { type: "log" },
    });

    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ name: "1" }, [
        createSpanWithChildren({ name: "2" }),
        createSpanWithChildren({ name: "3" }),
      ]),
    ];

    await evaluateBreakpoints(spans, createTrace(), "onExit");

    expect(manager.getHitCount("counting-bp")).toBe(3);
  });

  it("multiple breakpoints can fire on same span", async () => {
    const firedA: string[] = [];
    const firedB: string[] = [];

    addBreakpoint({
      id: "bp-a",
      matcher: { spanType: "tool" },
      action: { type: "notify", handler: (ctx) => firedA.push(ctx.span.spanId) },
    });
    addBreakpoint({
      id: "bp-b",
      matcher: { status: "error" },
      action: { type: "notify", handler: (ctx) => firedB.push(ctx.span.spanId) },
    });

    const spans: SpanWithChildren[] = [
      createSpanWithChildren({ spanId: "tool-error", spanType: "tool", status: "error" }),
      createSpanWithChildren({ spanId: "tool-ok", spanType: "tool", status: "ok" }),
      createSpanWithChildren({ spanId: "gen-error", spanType: "generation", status: "error" }),
    ];

    const results = await evaluateBreakpoints(spans, createTrace(), "onExit");

    expect(firedA).toEqual(["tool-error", "tool-ok"]);
    expect(firedB).toEqual(["tool-error", "gen-error"]);

    // tool-error should have both breakpoints in its result
    expect(results.get("tool-error")).toHaveLength(2);
    expect(results.get("tool-ok")).toHaveLength(1);
    expect(results.get("gen-error")).toHaveLength(1);
  });
});

describe("BreakpointManager.unregister clears captured contexts", () => {
  it("clears captured contexts when unregistering", async () => {
    const manager = new BreakpointManager();
    const bp = defineBreakpoint({
      id: "capture-bp",
      matcher: {},
      action: { type: "capture" },
    });
    manager.register(bp);

    // Trigger capture
    await manager.evaluate(createSpan(), createTrace(), "onExit");
    expect(manager.getCaptured("capture-bp")).toHaveLength(1);

    // Unregister should clear captured contexts
    manager.unregister("capture-bp");
    expect(manager.getCaptured("capture-bp")).toHaveLength(0);
  });
});
