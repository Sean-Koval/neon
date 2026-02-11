/**
 * Tests for Multi-Agent Tracing (handoff + delegate spans)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  handoff,
  delegate,
  setGlobalExporter,
  resetGlobalExporter,
  withContext,
  type TraceContext,
} from "../index.js";
import type { NeonExporterConfig } from "../exporter.js";
import { NeonExporter } from "../exporter.js";

// Collect spans without actually sending them
class MockExporter extends NeonExporter {
  public capturedSpans: Array<{
    name: string;
    type: string;
    componentType?: string;
    attributes: Record<string, string>;
    status: string;
  }> = [];

  constructor() {
    super({
      endpoint: "http://localhost:0/noop",
      projectId: "test-project",
    } as NeonExporterConfig);
  }

  addSpan(span: any) {
    this.capturedSpans.push({
      name: span.name,
      type: span.type,
      componentType: span.componentType,
      attributes: span.attributes || {},
      status: span.status,
    });
  }
}

describe("handoff span", () => {
  let exporter: MockExporter;

  beforeEach(() => {
    exporter = new MockExporter();
    setGlobalExporter(exporter as any);
  });

  afterEach(() => {
    resetGlobalExporter();
  });

  it("creates a routing span with handoff attributes", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-1",
      parentSpanId: "parent-1",
    };

    await withContext(ctx, () =>
      handoff(
        "handoff-to-analyzer",
        async () => "result",
        {
          targetAgent: "analyzer-agent",
          contextTransferred: "search results",
        },
      ),
    );

    expect(exporter.capturedSpans).toHaveLength(1);
    const span = exporter.capturedSpans[0];
    expect(span.name).toBe("handoff-to-analyzer");
    expect(span.componentType).toBe("routing");
    expect(span.attributes["handoff.target_agent"]).toBe("analyzer-agent");
    expect(span.attributes["handoff.context_transferred"]).toBe(
      "search results",
    );
    expect(span.status).toBe("ok");
  });

  it("returns the function result", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-2",
      parentSpanId: "parent-2",
    };

    const result = await withContext(ctx, () =>
      handoff("test-handoff", async () => 42),
    );

    expect(result).toBe(42);
  });

  it("records error status on failure", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-3",
      parentSpanId: "parent-3",
    };

    try {
      await withContext(ctx, () =>
        handoff("failing-handoff", async () => {
          throw new Error("handoff failed");
        }),
      );
    } catch {
      // expected
    }

    expect(exporter.capturedSpans).toHaveLength(1);
    expect(exporter.capturedSpans[0].status).toBe("error");
  });

  it("supports custom attributes", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-4",
      parentSpanId: "parent-4",
    };

    await withContext(ctx, () =>
      handoff("custom-handoff", async () => "ok", {
        targetAgent: "agent-b",
        attributes: { "custom.key": "custom-value" },
      }),
    );

    const attrs = exporter.capturedSpans[0].attributes;
    expect(attrs["handoff.target_agent"]).toBe("agent-b");
    expect(attrs["custom.key"]).toBe("custom-value");
  });

  it("works without options", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-5",
      parentSpanId: "parent-5",
    };

    const result = await withContext(ctx, () =>
      handoff("bare-handoff", async () => "bare"),
    );

    expect(result).toBe("bare");
    expect(exporter.capturedSpans).toHaveLength(1);
    expect(exporter.capturedSpans[0].componentType).toBe("routing");
  });
});

describe("delegate span", () => {
  let exporter: MockExporter;

  beforeEach(() => {
    exporter = new MockExporter();
    setGlobalExporter(exporter as any);
  });

  afterEach(() => {
    resetGlobalExporter();
  });

  it("creates a routing span with delegation attributes", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-6",
      parentSpanId: "parent-6",
    };

    await withContext(ctx, () =>
      delegate(
        "delegate-summarization",
        async () => "summary",
        {
          targetAgent: "summarizer-agent",
          taskDescription: "Summarize search results",
        },
      ),
    );

    expect(exporter.capturedSpans).toHaveLength(1);
    const span = exporter.capturedSpans[0];
    expect(span.name).toBe("delegate-summarization");
    expect(span.componentType).toBe("routing");
    expect(span.attributes["delegation.target_agent"]).toBe(
      "summarizer-agent",
    );
    expect(span.attributes["delegation.task_description"]).toBe(
      "Summarize search results",
    );
    expect(span.status).toBe("ok");
  });

  it("returns the function result", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-7",
      parentSpanId: "parent-7",
    };

    const result = await withContext(ctx, () =>
      delegate("test-delegate", async () => ({ answer: 42 })),
    );

    expect(result).toEqual({ answer: 42 });
  });

  it("records error status on failure", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-8",
      parentSpanId: "parent-8",
    };

    try {
      await withContext(ctx, () =>
        delegate("failing-delegate", async () => {
          throw new Error("delegation failed");
        }),
      );
    } catch {
      // expected
    }

    expect(exporter.capturedSpans).toHaveLength(1);
    expect(exporter.capturedSpans[0].status).toBe("error");
  });

  it("works without options", async () => {
    const ctx: TraceContext = {
      traceId: "trace-test-9",
      parentSpanId: "parent-9",
    };

    const result = await withContext(ctx, () =>
      delegate("bare-delegate", async () => "done"),
    );

    expect(result).toBe("done");
    expect(exporter.capturedSpans).toHaveLength(1);
    expect(exporter.capturedSpans[0].componentType).toBe("routing");
  });
});
