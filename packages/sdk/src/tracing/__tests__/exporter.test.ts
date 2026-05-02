import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonExporter } from "../exporter.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("NeonExporter rich span fields", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports session, messages, handoff, snapshots, artifacts, and eval annotations as OTLP attributes", async () => {
    const exporter = new NeonExporter({
      apiUrl: "http://localhost:4318",
      projectId: "project-test",
      offline: false,
    });

    exporter.addSpan({
      traceId: "trace-123",
      spanId: "span-123",
      name: "rich-span",
      startTime: new Date("2026-03-30T00:00:00.000Z").toISOString(),
      endTime: new Date("2026-03-30T00:00:01.000Z").toISOString(),
      status: "ok",
      type: "generation",
      attributes: {},
      session: {
        sessionId: "session-1",
        conversationId: "conversation-1",
        userId: "user-1",
        threadId: "thread-1",
      },
      inputMessages: [
        {
          role: "user",
          content: "Hello",
          messageId: "msg-in-1",
        },
      ],
      outputMessages: [
        {
          role: "assistant",
          content: "Hi",
          messageId: "msg-out-1",
        },
      ],
      handoff: {
        handoffType: "delegation",
        fromAgentId: "planner",
        toAgentId: "executor",
        taskDescription: "Execute subtask",
      },
      stateSnapshots: [
        {
          snapshotId: "snapshot-1",
          name: "pre-tool",
          stateType: "agent_state",
        },
      ],
      artifacts: [
        {
          artifactId: "artifact-1",
          name: "report.json",
          kind: "json",
          uri: "file:///tmp/report.json",
        },
      ],
      evalAnnotations: [
        {
          annotationId: "annotation-1",
          name: "expected-behavior",
          evaluatorType: "dataset",
          status: "expected",
          value: "tool should be called",
        },
      ],
    });

    await exporter.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const attrs = body.resourceSpans[0].scopeSpans[0].spans[0].attributes;
    const attrMap = Object.fromEntries(
      attrs.map((attr: { key: string; value: { stringValue?: string } }) => [
        attr.key,
        attr.value.stringValue,
      ]),
    );

    expect(attrMap["session.id"]).toBe("session-1");
    expect(attrMap["gen_ai.conversation.id"]).toBe("conversation-1");
    expect(attrMap["enduser.id"]).toBe("user-1");
    expect(attrMap["neon.thread.id"]).toBe("thread-1");
    expect(JSON.parse(attrMap["gen_ai.input.messages"]!)).toEqual([
      expect.objectContaining({ role: "user", content: "Hello" }),
    ]);
    expect(JSON.parse(attrMap["gen_ai.output.messages"]!)).toEqual([
      expect.objectContaining({ role: "assistant", content: "Hi" }),
    ]);
    expect(attrMap["neon.handoff.type"]).toBe("delegation");
    expect(attrMap["neon.handoff.to_agent"]).toBe("executor");
    expect(JSON.parse(attrMap["neon.state_snapshots"]!)).toEqual([
      expect.objectContaining({ snapshotId: "snapshot-1" }),
    ]);
    expect(JSON.parse(attrMap["neon.artifacts"]!)).toEqual([
      expect.objectContaining({ artifactId: "artifact-1" }),
    ]);
    expect(JSON.parse(attrMap["neon.eval.annotations"]!)).toEqual([
      expect.objectContaining({ annotationId: "annotation-1" }),
    ]);
  });

  it("redacts configured high-risk payload fields before export", async () => {
    const exporter = new NeonExporter({
      apiUrl: "http://localhost:4318",
      projectId: "project-test",
      offline: false,
      masking: { enabled: true },
    });

    exporter.addSpan({
      traceId: "trace-456",
      spanId: "span-456",
      name: "masked-span",
      startTime: new Date("2026-03-30T00:00:00.000Z").toISOString(),
      endTime: new Date("2026-03-30T00:00:01.000Z").toISOString(),
      status: "ok",
      type: "generation",
      attributes: {},
      input: "email me at test@example.com with sk_test_1234567890abcdefghijkl",
      output: "ssn 123-45-6789",
      toolInput: '{"email":"tool@example.com"}',
      inputMessages: [
        {
          role: "user",
          content: "contact test@example.com",
          messageId: "msg-1",
        },
      ],
      stateSnapshots: [
        {
          snapshotId: "snapshot-1",
          name: "state for test@example.com",
          metadata: {
            owner: "test@example.com",
          },
        },
      ],
    });

    await exporter.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const attrs = body.resourceSpans[0].scopeSpans[0].spans[0].attributes;
    const attrMap = Object.fromEntries(
      attrs.map((attr: { key: string; value: { stringValue?: string } }) => [
        attr.key,
        attr.value.stringValue,
      ]),
    );

    expect(attrMap["gen_ai.prompt"]).toContain("[REDACTED:email]");
    expect(attrMap["gen_ai.prompt"]).toContain("[REDACTED:api_key]");
    expect(attrMap["gen_ai.completion"]).toContain("[REDACTED:ssn]");
    expect(attrMap["tool.input"]).toContain("[REDACTED:email]");
    expect(attrMap["gen_ai.input.messages"]).toContain("[REDACTED:email]");
    expect(attrMap["neon.state_snapshots"]).toContain("[REDACTED:email]");
  });

  it("drops spans when head sampling is disabled for the active project", async () => {
    const exporter = new NeonExporter({
      apiUrl: "http://localhost:4318",
      projectId: "project-sampled-out",
      offline: false,
      sampling: {
        enabled: true,
        rate: 0,
      },
    });

    exporter.addSpan({
      traceId: "trace-sampled-out",
      spanId: "span-sampled-out",
      name: "sampled-out",
      startTime: new Date("2026-03-30T00:00:00.000Z").toISOString(),
      endTime: new Date("2026-03-30T00:00:01.000Z").toISOString(),
      status: "ok",
      type: "span",
      attributes: {},
    });

    await exporter.flush();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("applies project-specific sampling overrides before export", async () => {
    const exporter = new NeonExporter({
      apiUrl: "http://localhost:4318",
      projectId: "project-keep",
      offline: false,
      sampling: {
        enabled: true,
        rate: 0,
        projectRates: {
          "project-keep": 1,
        },
      },
    });

    exporter.addSpan({
      traceId: "trace-keep",
      spanId: "span-keep",
      name: "sampled-in",
      startTime: new Date("2026-03-30T00:00:00.000Z").toISOString(),
      endTime: new Date("2026-03-30T00:00:01.000Z").toISOString(),
      status: "ok",
      type: "span",
      attributes: {},
    });

    await exporter.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("filters noisy spans while preserving roots and errors", async () => {
    const exporter = new NeonExporter({
      apiUrl: "http://localhost:4318",
      projectId: "project-test",
      offline: false,
      filtering: {
        enabled: true,
        excludeSpanTypes: ["event"],
        excludeNames: [/healthcheck/i],
      },
    });

    exporter.addSpans([
      {
        traceId: "trace-filtered",
        spanId: "root-span",
        name: "root-event",
        startTime: new Date("2026-03-30T00:00:00.000Z").toISOString(),
        endTime: new Date("2026-03-30T00:00:01.000Z").toISOString(),
        status: "ok",
        type: "event",
        attributes: {},
      },
      {
        traceId: "trace-filtered",
        spanId: "child-noisy",
        parentSpanId: "root-span",
        name: "healthcheck child",
        startTime: new Date("2026-03-30T00:00:00.100Z").toISOString(),
        endTime: new Date("2026-03-30T00:00:00.200Z").toISOString(),
        status: "ok",
        type: "event",
        attributes: {},
      },
      {
        traceId: "trace-filtered",
        spanId: "child-error",
        parentSpanId: "root-span",
        name: "healthcheck failure",
        startTime: new Date("2026-03-30T00:00:00.300Z").toISOString(),
        endTime: new Date("2026-03-30T00:00:00.400Z").toISOString(),
        status: "error",
        type: "event",
        attributes: {},
      },
    ]);

    await exporter.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;

    expect(spans).toHaveLength(2);
    expect(spans.map((span: { spanId: string }) => span.spanId)).toEqual([
      "root-span",
      "child-error",
    ]);
  });
});
