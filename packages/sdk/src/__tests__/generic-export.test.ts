/**
 * Tests for Generic Training Data Export System
 */

import { describe, test, expect, beforeEach } from "vitest";
import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";
import {
  // Generic system
  exportRegistry,
  registerFormat,
  registerFormatAlias,
  getFormat,
  listFormats,
  exportTraces,
  validateExport,
  streamExport,
  extractMessages,
  extractPromptCompletions,
  flattenSpans,
  filterSpans,
  estimateTokenCount,
  truncateText,
  type ExportFormat,
  type TraceExportContext,
  // OpenAI
  openAIFineTuneFormat,
  tracesToOpenAI,
  tracesToOpenAIJSONL,
  parseOpenAIJSONL,
  validateOpenAIExamples,
  type OpenAIFineTuneExample,
  // TRL
  trlSFTFormat,
  trlDPOFormat,
  trlKTOFormat,
  tracesToSFT,
  tracesToDPO,
  tracesToKTO,
  createDPOPairs,
  toTRLJSONL,
  parseTRLJSONL,
  type TRLSFTExample,
  type TRLDPOExample,
  type TRLKTOExample,
} from "../export/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockSpan(
  overrides: Partial<SpanWithChildren> = {}
): SpanWithChildren {
  return {
    spanId: `span-${Math.random().toString(36).slice(2, 9)}`,
    traceId: "trace-123",
    projectId: "project-1",
    name: "test-span",
    kind: "internal",
    spanType: "generation",
    timestamp: new Date("2024-01-01T10:00:00Z"),
    endTime: new Date("2024-01-01T10:00:01Z"),
    durationMs: 1000,
    status: "ok",
    attributes: {},
    children: [],
    input: "What is the weather today?",
    output: "The weather is sunny and warm.",
    model: "gpt-4",
    ...overrides,
  };
}

function createMockTrace(
  overrides: Partial<TraceWithSpans["trace"]> = {},
  spans: SpanWithChildren[] = []
): TraceWithSpans {
  return {
    trace: {
      traceId: "trace-123",
      projectId: "project-1",
      name: "test-trace",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      endTime: new Date("2024-01-01T10:00:05Z"),
      durationMs: 5000,
      status: "ok",
      metadata: {},
      totalInputTokens: 100,
      totalOutputTokens: 200,
      toolCallCount: 1,
      llmCallCount: 2,
      ...overrides,
    },
    spans:
      spans.length > 0
        ? spans
        : [
            createMockSpan({
              spanId: "span-1",
              name: "generation-1",
              spanType: "generation",
              input: "What is the weather?",
              output: "The weather is sunny.",
            }),
            createMockSpan({
              spanId: "span-2",
              name: "tool-call",
              spanType: "tool",
              toolName: "get_weather",
              toolInput: '{"location": "NYC"}',
              toolOutput: '{"temp": 72, "conditions": "sunny"}',
            }),
          ],
  };
}

// ============================================================================
// Generic Export System Tests
// ============================================================================

describe("Export Registry", () => {
  test("lists built-in formats", () => {
    const formats = listFormats();
    const names = formats.map((f) => f.name);

    expect(names).toContain("openai-ft");
    expect(names).toContain("trl-sft");
    expect(names).toContain("trl-dpo");
    expect(names).toContain("trl-kto");
    expect(names).toContain("trl");
  });

  test("gets format by name", () => {
    const format = getFormat("openai-ft");
    expect(format).toBeDefined();
    expect(format?.name).toBe("openai-ft");
    expect(format?.extension).toBe(".jsonl");
  });

  test("gets format by alias", () => {
    const format = getFormat("openai");
    expect(format).toBeDefined();
    expect(format?.name).toBe("openai-ft");
  });

  test("returns undefined for unknown format", () => {
    const format = getFormat("unknown-format");
    expect(format).toBeUndefined();
  });

  test("checks format existence", () => {
    expect(exportRegistry.has("openai-ft")).toBe(true);
    expect(exportRegistry.has("openai")).toBe(true); // alias
    expect(exportRegistry.has("unknown")).toBe(false);
  });
});

describe("exportTraces", () => {
  test("exports traces to OpenAI format", () => {
    const traces: TraceExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
    ];

    const result = exportTraces(traces, "openai-ft", {
      systemPrompt: "You are a helpful assistant.",
      includeSystemPrompt: true,
    });

    expect(result.format).toBe("openai-ft");
    expect(result.extension).toBe(".jsonl");
    expect(result.records.length).toBe(2);
    expect(result.stats.totalTraces).toBe(2);
    expect(result.stats.exportedTraces).toBe(2);
    expect(result.stats.skippedTraces).toBe(0);
  });

  test("exports traces to TRL SFT format", () => {
    const traces: TraceExportContext[] = [
      { trace: createMockTrace() },
    ];

    const result = exportTraces(traces, "trl-sft");

    expect(result.format).toBe("trl-sft");
    expect(result.records.length).toBe(1);
    const record = result.records[0] as TRLSFTExample;
    expect(record.prompt).toBeDefined();
    expect(record.completion).toBeDefined();
  });

  test("filters unsuccessful traces when successOnly is true", () => {
    const traces: TraceExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1", status: "ok" }) },
      { trace: createMockTrace({ traceId: "trace-2", status: "error" }) },
    ];

    const result = exportTraces(traces, "trl-sft", { successOnly: true });

    expect(result.stats.exportedTraces).toBe(1);
    expect(result.stats.skippedTraces).toBe(1);
  });

  test("throws error for unknown format", () => {
    const traces: TraceExportContext[] = [{ trace: createMockTrace() }];

    expect(() => exportTraces(traces, "unknown-format")).toThrow(
      /Unknown export format/
    );
  });

  test("includes token estimates when available", () => {
    const traces: TraceExportContext[] = [{ trace: createMockTrace() }];

    const result = exportTraces(traces, "openai-ft");

    expect(result.stats.estimatedTokens).toBeDefined();
    expect(result.stats.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("streamExport", () => {
  test("streams export with callbacks", async () => {
    const traces: TraceExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
    ];

    const records: unknown[] = [];
    const progress: Array<{ current: number; total: number }> = [];

    const stats = await streamExport(traces, "trl-sft", {
      onRecord: (record) => records.push(record),
      onProgress: (current, total) => progress.push({ current, total }),
    });

    expect(records.length).toBe(2);
    expect(progress.length).toBe(2);
    expect(progress[progress.length - 1]).toEqual({ current: 2, total: 2 });
    expect(stats.exportedTraces).toBe(2);
  });
});

describe("validateExport", () => {
  test("validates correct OpenAI examples", () => {
    const examples: OpenAIFineTuneExample[] = [
      {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      },
    ];

    const result = validateExport(examples, "openai-ft");

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test("detects invalid OpenAI examples", () => {
    const examples: OpenAIFineTuneExample[] = [
      {
        messages: [
          { role: "user", content: "Hello" },
          // Missing assistant message
        ],
      } as OpenAIFineTuneExample,
    ];

    const result = validateExport(examples, "openai-ft");

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("Utility Functions", () => {
  test("extractMessages extracts user/assistant messages", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi!",
      }),
      createMockSpan({
        spanType: "generation",
        input: "How are you?",
        output: "I am well.",
      }),
    ]);

    const messages = extractMessages(trace);

    expect(messages.length).toBe(4);
    expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(messages[1]).toEqual({ role: "assistant", content: "Hi!" });
  });

  test("extractMessages includes system prompt when configured", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi!",
      }),
    ]);

    const messages = extractMessages(trace, {
      includeSystemPrompt: true,
      systemPrompt: "You are helpful.",
    });

    expect(messages[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  test("extractPromptCompletions extracts pairs", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Question 1",
        output: "Answer 1",
      }),
      createMockSpan({
        spanType: "generation",
        input: "Question 2",
        output: "Answer 2",
      }),
    ]);

    const pairs = extractPromptCompletions(trace);

    expect(pairs.length).toBe(2);
    expect(pairs[0]).toEqual({ prompt: "Question 1", completion: "Answer 1" });
  });

  test("flattenSpans flattens nested spans", () => {
    const nestedSpan = createMockSpan({
      spanId: "parent",
      children: [
        createMockSpan({ spanId: "child-1", children: [] }),
        createMockSpan({ spanId: "child-2", children: [] }),
      ],
    });

    const flat = flattenSpans([nestedSpan]);

    expect(flat.length).toBe(3);
    expect(flat.map((s) => s.spanId)).toContain("parent");
    expect(flat.map((s) => s.spanId)).toContain("child-1");
    expect(flat.map((s) => s.spanId)).toContain("child-2");
  });

  test("filterSpans filters by span type", () => {
    const spans = [
      createMockSpan({ spanType: "generation", children: [] }),
      createMockSpan({ spanType: "tool", children: [] }),
      createMockSpan({ spanType: "event", children: [] }),
    ];

    const filtered = filterSpans(spans, { spanTypes: ["generation", "tool"] });

    expect(filtered.length).toBe(2);
  });

  test("estimateTokenCount estimates tokens", () => {
    const short = estimateTokenCount("Hello");
    const long = estimateTokenCount("This is a longer piece of text that should have more tokens.");

    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  test("truncateText truncates at word boundary", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const truncated = truncateText(text, 20);

    expect(truncated.length).toBeLessThanOrEqual(23); // 20 + "..."
    expect(truncated).toContain("...");
  });
});

// ============================================================================
// OpenAI Fine-Tuning Format Tests
// ============================================================================

describe("OpenAI Fine-Tuning Format", () => {
  test("format has correct metadata", () => {
    expect(openAIFineTuneFormat.name).toBe("openai-ft");
    expect(openAIFineTuneFormat.extension).toBe(".jsonl");
    expect(openAIFineTuneFormat.mimeType).toBe("application/jsonl");
  });

  test("converts trace with tool calls", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanId: "span-1",
        spanType: "generation",
        input: "Get the weather",
        output: null,
      }),
      createMockSpan({
        spanId: "span-2",
        spanType: "tool",
        toolName: "get_weather",
        toolInput: '{"city": "NYC"}',
        toolOutput: '{"temp": 72}',
      }),
    ]);

    const result = tracesToOpenAI([trace], { includeToolCalls: true });

    expect(result.length).toBe(1);
    const example = result[0];
    expect(example.messages.some((m) => m.tool_calls)).toBe(true);
    expect(example.messages.some((m) => m.role === "tool")).toBe(true);
  });

  test("converts trace without tool calls", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi there!",
      }),
    ]);

    const result = tracesToOpenAI([trace], { includeToolCalls: false });

    expect(result.length).toBe(1);
    expect(result[0].messages.every((m) => !m.tool_calls)).toBe(true);
  });

  test("serializes to JSONL", () => {
    const trace = createMockTrace();
    const jsonl = tracesToOpenAIJSONL([trace]);

    expect(jsonl).toBeTruthy();
    const lines = jsonl.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  test("parses JSONL back to examples", () => {
    const original: OpenAIFineTuneExample[] = [
      {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" },
        ],
      },
    ];

    const jsonl = original.map((e) => JSON.stringify(e)).join("\n");
    const parsed = parseOpenAIJSONL(jsonl);

    expect(parsed.length).toBe(1);
    expect(parsed[0].messages.length).toBe(2);
  });

  test("validates tool call structure", () => {
    const valid: OpenAIFineTuneExample[] = [
      {
        messages: [
          { role: "user", content: "Get weather" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: { name: "get_weather", arguments: "{}" },
              },
            ],
          },
          { role: "tool", content: '{"temp": 72}', tool_call_id: "call_123" },
        ],
      },
    ];

    const result = validateOpenAIExamples(valid);
    expect(result.valid).toBe(true);
  });

  test("adds system prompt when configured", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi!",
      }),
    ]);

    const result = tracesToOpenAI([trace], {
      includeSystemPrompt: true,
      systemPrompt: "You are a helpful assistant.",
    });

    expect(result[0].messages[0].role).toBe("system");
    expect(result[0].messages[0].content).toBe("You are a helpful assistant.");
  });
});

// ============================================================================
// TRL Format Tests
// ============================================================================

describe("TRL SFT Format", () => {
  test("format has correct metadata", () => {
    expect(trlSFTFormat.name).toBe("trl-sft");
    expect(trlSFTFormat.extension).toBe(".jsonl");
  });

  test("converts trace to SFT example", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "What is 2+2?",
        output: "4",
      }),
    ]);

    const result = tracesToSFT([trace]);

    expect(result.length).toBe(1);
    expect(result[0].prompt).toBe("What is 2+2?");
    expect(result[0].completion).toBe("4");
  });

  test("includes messages when configured", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi!",
      }),
    ]);

    const result = tracesToSFT([trace], { includeMessages: true });

    expect(result[0].messages).toBeDefined();
    expect(result[0].messages!.length).toBeGreaterThan(0);
  });

  test("applies prompt template", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "generation",
        input: "Hello",
        output: "Hi!",
      }),
    ]);

    const result = tracesToSFT([trace], {
      promptTemplate: "### Instruction:\n{{prompt}}\n\n### Response:",
    });

    expect(result[0].prompt).toContain("### Instruction:");
    expect(result[0].prompt).toContain("Hello");
  });

  test("validates SFT examples", () => {
    const valid: TRLSFTExample = { prompt: "test", completion: "response" };
    const invalid = { prompt: "", completion: "" } as TRLSFTExample;

    expect(trlSFTFormat.validate!(valid).valid).toBe(true);
    expect(trlSFTFormat.validate!({ prompt: "test" } as TRLSFTExample).valid).toBe(false);
  });
});

describe("TRL DPO Format", () => {
  test("format has correct metadata", () => {
    expect(trlDPOFormat.name).toBe("trl-dpo");
    expect(trlDPOFormat.extension).toBe(".jsonl");
  });

  test("converts context with explicit chosen/rejected", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({}, [
        createMockSpan({
          spanType: "generation",
          input: "What is 2+2?",
          output: "4",
        }),
      ]),
      chosenOutput: "The answer is 4.",
      rejectedOutput: "I dont know.",
    };

    const result = tracesToDPO([context]);

    expect(result.length).toBe(1);
    expect(result[0].prompt).toBe("What is 2+2?");
    expect(result[0].chosen).toBe("The answer is 4.");
    expect(result[0].rejected).toBe("I dont know.");
  });

  test("returns empty for single trace without preference data", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({}, [
        createMockSpan({
          spanType: "generation",
          input: "Hello",
          output: "Hi!",
        }),
      ]),
    };

    const result = tracesToDPO([context]);

    expect(result.length).toBe(0);
  });

  test("validates DPO examples", () => {
    const valid: TRLDPOExample = {
      prompt: "test",
      chosen: "good",
      rejected: "bad",
    };
    const sameChosenRejected: TRLDPOExample = {
      prompt: "test",
      chosen: "same",
      rejected: "same",
    };

    expect(trlDPOFormat.validate!(valid).valid).toBe(true);
    expect(trlDPOFormat.validate!(sameChosenRejected).valid).toBe(false);
  });
});

describe("TRL KTO Format", () => {
  test("format has correct metadata", () => {
    expect(trlKTOFormat.name).toBe("trl-kto");
    expect(trlKTOFormat.extension).toBe(".jsonl");
  });

  test("converts trace with positive label from status", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({ status: "ok" }, [
        createMockSpan({
          spanType: "generation",
          input: "Hello",
          output: "Hi!",
        }),
      ]),
    };

    const result = tracesToKTO([context]);

    expect(result.length).toBe(1);
    expect(result[0].label).toBe(true);
  });

  test("converts trace with negative label from status", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({ status: "error" }, [
        createMockSpan({
          spanType: "generation",
          input: "Hello",
          output: "Error occurred",
        }),
      ]),
    };

    const result = tracesToKTO([context]);

    expect(result.length).toBe(1);
    expect(result[0].label).toBe(false);
  });

  test("uses explicit isGood label", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({ status: "ok" }, [
        createMockSpan({
          spanType: "generation",
          input: "Hello",
          output: "Hi!",
        }),
      ]),
      isGood: false, // Override status
    };

    const result = tracesToKTO([context]);

    expect(result[0].label).toBe(false);
  });

  test("uses scores to determine label", () => {
    const context: TraceExportContext = {
      trace: createMockTrace({ status: "ok" }, [
        createMockSpan({
          spanType: "generation",
          input: "Hello",
          output: "Hi!",
        }),
      ]),
      scores: [
        { name: "quality", value: 0.3 },
        { name: "helpfulness", value: 0.3 },
      ],
    };

    const result = tracesToKTO([context], { goodThreshold: 0.5 });

    expect(result[0].label).toBe(false); // avg 0.3 < threshold 0.5
  });

  test("validates KTO examples", () => {
    const valid: TRLKTOExample = {
      prompt: "test",
      completion: "response",
      label: true,
    };
    const invalidLabel = {
      prompt: "test",
      completion: "response",
      label: "yes",
    } as unknown as TRLKTOExample;

    expect(trlKTOFormat.validate!(valid).valid).toBe(true);
    expect(trlKTOFormat.validate!(invalidLabel).valid).toBe(false);
  });
});

describe("createDPOPairs", () => {
  test("creates preference pairs from grouped traces", () => {
    // Two traces with same prompt but different quality
    const contexts: TraceExportContext[] = [
      {
        trace: createMockTrace({ traceId: "trace-1" }, [
          createMockSpan({
            spanType: "generation",
            input: "What is 2+2?",
            output: "The answer is 4.",
          }),
        ]),
        scores: [{ name: "quality", value: 0.9 }],
      },
      {
        trace: createMockTrace({ traceId: "trace-2" }, [
          createMockSpan({
            spanType: "generation",
            input: "What is 2+2?",
            output: "I think maybe 5?",
          }),
        ]),
        scores: [{ name: "quality", value: 0.2 }],
      },
    ];

    const pairs = createDPOPairs(contexts, { chosenThreshold: 0.7 });

    expect(pairs.length).toBe(1);
    expect(pairs[0].chosen).toBe("The answer is 4.");
    expect(pairs[0].rejected).toBe("I think maybe 5?");
  });

  test("does not create pairs when scores are similar", () => {
    const contexts: TraceExportContext[] = [
      {
        trace: createMockTrace({ traceId: "trace-1" }, [
          createMockSpan({
            spanType: "generation",
            input: "Hello",
            output: "Hi!",
          }),
        ]),
        scores: [{ name: "quality", value: 0.75 }],
      },
      {
        trace: createMockTrace({ traceId: "trace-2" }, [
          createMockSpan({
            spanType: "generation",
            input: "Hello",
            output: "Hey!",
          }),
        ]),
        scores: [{ name: "quality", value: 0.72 }],
      },
    ];

    const pairs = createDPOPairs(contexts, { chosenThreshold: 0.7 });

    // Score difference is only 0.03, less than 0.1 threshold
    expect(pairs.length).toBe(0);
  });
});

describe("TRL JSONL Utilities", () => {
  test("toTRLJSONL serializes examples", () => {
    const examples: TRLSFTExample[] = [
      { prompt: "a", completion: "b" },
      { prompt: "c", completion: "d" },
    ];

    const jsonl = toTRLJSONL(examples);
    const lines = jsonl.split("\n");

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ prompt: "a", completion: "b" });
  });

  test("parseTRLJSONL parses JSONL", () => {
    const jsonl = '{"prompt":"a","completion":"b"}\n{"prompt":"c","completion":"d"}';
    const examples = parseTRLJSONL<TRLSFTExample>(jsonl);

    expect(examples.length).toBe(2);
    expect(examples[0].prompt).toBe("a");
  });
});

// ============================================================================
// Custom Format Registration Tests
// ============================================================================

describe("Custom Format Registration", () => {
  test("can register and use custom format", () => {
    // Define a simple custom format
    const customFormat: ExportFormat<{ text: string }, { prefix?: string }> = {
      name: "test-custom-format",
      description: "Test custom format",
      extension: ".txt",
      mimeType: "text/plain",
      convert: (ctx, config) => {
        const output = ctx.trace.spans[0]?.output;
        if (!output) return [];
        const prefix = config.prefix ?? "";
        return [{ text: `${prefix}${output}` }];
      },
      serialize: (records) => records.map((r) => r.text).join("\n"),
      validate: (record) => ({
        valid: !!record.text,
        errors: record.text ? [] : ["text is required"],
      }),
    };

    // Register the format
    registerFormat(customFormat);

    // Use it
    const traces: TraceExportContext[] = [
      {
        trace: createMockTrace({}, [
          createMockSpan({ output: "Hello World" }),
        ]),
      },
    ];

    const result = exportTraces<{ text: string }>(traces, "test-custom-format", {
      prefix: "Output: ",
    } as any);

    expect(result.records.length).toBe(1);
    expect(result.records[0].text).toBe("Output: Hello World");
    expect(result.serialized).toBe("Output: Hello World");

    // Clean up
    exportRegistry.unregister("test-custom-format");
  });
});
