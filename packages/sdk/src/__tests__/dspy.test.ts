/**
 * Tests for DSPy Export
 */

import { describe, test, expect } from "vitest";
import {
  exportToDSPy,
  exportBatchToDSPy,
  validateDSPyDataset,
  mergeDSPyDatasets,
  datasetToJSONL,
  generateDSPyLoaderCode,
  type DSPyExportContext,
  type DSPyDataset,
} from "../export/dspy.js";
import type { TraceWithSpans, SpanWithChildren } from "@neon/shared";

// Helper to create mock spans
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
    input: "What is the capital of France?",
    output: "The capital of France is Paris.",
    model: "gpt-4",
    ...overrides,
  };
}

// Helper to create mock trace
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
              input: "What is the capital of France?",
              output: "The capital of France is Paris.",
            }),
          ],
  };
}

describe("exportToDSPy", () => {
  test("exports basic trace to DSPy examples", () => {
    const trace = createMockTrace();
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context);

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-1");
    expect(examples[0].prompt).toBe("What is the capital of France?");
    expect(examples[0].completion).toBe("The capital of France is Paris.");
    expect(examples[0]._dspy_inputs).toContain("prompt");
  });

  test("exports with question-answer preset", () => {
    const trace = createMockTrace();
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      fieldMapping: { preset: "question-answer" },
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].question).toBe("What is the capital of France?");
    expect(examples[0].answer).toBe("The capital of France is Paris.");
    expect(examples[0]._dspy_inputs).toContain("question");
  });

  test("exports with chat preset", () => {
    const trace = createMockTrace();
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      fieldMapping: { preset: "chat" },
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].message).toBeDefined();
    expect(examples[0].response).toBeDefined();
    expect(examples[0]._dspy_inputs).toContain("message");
  });

  test("exports with custom field mapping", () => {
    const trace = createMockTrace();
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      fieldMapping: {
        inputField: "user_query",
        outputField: "assistant_response",
      },
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].user_query).toBe("What is the capital of France?");
    expect(examples[0].assistant_response).toBe(
      "The capital of France is Paris."
    );
    expect(examples[0]._dspy_inputs).toContain("user_query");
  });

  test("exports tool calls with tool-use preset", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanId: "span-tool-1",
        spanType: "tool",
        toolName: "search_api",
        toolInput: '{"query": "weather in NYC"}',
        toolOutput: '{"temp": 72, "conditions": "sunny"}',
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      fieldMapping: { preset: "tool-use" },
      filter: { spanTypes: ["tool"] },
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].tool_name).toBe("search_api");
    expect(examples[0].tool_input).toBe('{"query": "weather in NYC"}');
    expect(examples[0].tool_output).toBe('{"temp": 72, "conditions": "sunny"}');
    expect(examples[0]._dspy_inputs).toContain("task");
    expect(examples[0]._dspy_inputs).toContain("tool_name");
    expect(examples[0]._dspy_inputs).toContain("tool_input");
  });

  test("filters by component type", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanId: "span-1",
        spanType: "generation",
        componentType: "prompt",
        input: "Prompt input",
        output: "Prompt output",
      }),
      createMockSpan({
        spanId: "span-2",
        spanType: "generation",
        componentType: "reasoning",
        input: "Reasoning input",
        output: "Reasoning output",
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      filter: { componentTypes: ["reasoning"] },
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-2");
  });

  test("filters by score threshold", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1" }),
      createMockSpan({ spanId: "span-2" }),
    ]);
    const context: DSPyExportContext = {
      trace,
      scores: [
        { name: "quality", value: 0.3, spanId: "span-1" },
        { name: "quality", value: 0.8, spanId: "span-2" },
      ],
    };

    const examples = exportToDSPy(context, {
      filter: { scoreThreshold: 0.5 },
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-2");
  });

  test("filters by success only", () => {
    const failedTrace = createMockTrace({ status: "error" });
    const context: DSPyExportContext = { trace: failedTrace };

    const examples = exportToDSPy(context, {
      filter: { successOnly: true },
    });

    expect(examples).toHaveLength(0);
  });

  test("filters by max duration", () => {
    const slowTrace = createMockTrace({ durationMs: 10000 });
    const context: DSPyExportContext = { trace: slowTrace };

    const examples = exportToDSPy(context, {
      filter: { maxDurationMs: 5000 },
    });

    expect(examples).toHaveLength(0);
  });

  test("filters by model", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", model: "gpt-4" }),
      createMockSpan({ spanId: "span-2", model: "gpt-3.5-turbo" }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      filter: { models: ["gpt-4"] },
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-1");
  });

  test("filters by minimum input length", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", input: "Hi" }),
      createMockSpan({
        spanId: "span-2",
        input: "This is a longer input with more content",
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      filter: { minInputLength: 10 },
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-2");
  });

  test("includes metadata when configured", () => {
    const trace = createMockTrace();
    const context: DSPyExportContext = {
      trace,
      scores: [{ name: "quality", value: 0.85, spanId: "span-1" }],
    };

    const examples = exportToDSPy(context, {
      includeMetadata: true,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0]._metadata).toBeDefined();
    expect(examples[0]._metadata?.traceId).toBe("trace-123");
    expect(examples[0]._metadata?.spanId).toBe("span-1");
    expect(examples[0]._metadata?.model).toBe("gpt-4");
    expect(examples[0]._metadata?.score).toBe(0.85);
    expect(examples[0]._metadata?.scoreName).toBe("quality");
  });

  test("includes intermediate spans when configured", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", input: "Step 1", output: "Result 1" }),
      createMockSpan({ spanId: "span-2", input: "Step 2", output: "Result 2" }),
      createMockSpan({ spanId: "span-3", input: "Step 3", output: "Result 3" }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(3);
  });

  test("returns only last example when not including intermediate spans", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", input: "Step 1", output: "Result 1" }),
      createMockSpan({ spanId: "span-2", input: "Step 2", output: "Result 2" }),
      createMockSpan({ spanId: "span-3", input: "Step 3", output: "Result 3" }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      includeIntermediateSpans: false,
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].id).toBe("span-3");
  });

  test("returns empty array for trace with no exportable spans", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanType: "event",
        input: undefined,
        output: undefined,
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context);

    expect(examples).toHaveLength(0);
  });

  test("uses custom extractor function", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        spanId: "span-1",
        attributes: { custom_field: "custom_value" },
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      fieldMapping: {
        customExtractor: (span) => ({
          extracted_custom: span.attributes.custom_field,
        }),
      },
    });

    expect(examples).toHaveLength(1);
    expect(examples[0].extracted_custom).toBe("custom_value");
  });
});

describe("exportBatchToDSPy", () => {
  test("exports multiple traces to dataset format", () => {
    const contexts: DSPyExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3" }) },
    ];

    const dataset = exportBatchToDSPy(contexts);

    expect(dataset.format).toBe("dspy");
    expect(dataset.version).toBe("1.0");
    expect(dataset.train).toHaveLength(3);
    expect(dataset.stats.totalExamples).toBe(3);
    expect(dataset.stats.trainCount).toBe(3);
  });

  test("splits into train and dev sets", () => {
    const contexts: DSPyExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3" }) },
      { trace: createMockTrace({ traceId: "trace-4" }) },
    ];

    const dataset = exportBatchToDSPy(contexts, {}, { trainSplit: 0.75 });

    expect(dataset.train).toHaveLength(3);
    expect(dataset.dev).toHaveLength(1);
    expect(dataset.stats.trainCount).toBe(3);
    expect(dataset.stats.devCount).toBe(1);
  });

  test("filters unsuccessful traces", () => {
    const contexts: DSPyExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1", status: "ok" }) },
      { trace: createMockTrace({ traceId: "trace-2", status: "error" }) },
    ];

    const dataset = exportBatchToDSPy(contexts, {
      filter: { successOnly: true },
    });

    expect(dataset.train).toHaveLength(1);
  });

  test("calculates statistics correctly", () => {
    const contexts: DSPyExportContext[] = [
      {
        trace: createMockTrace({ traceId: "trace-1" }, [
          createMockSpan({
            model: "gpt-4",
            componentType: "prompt",
            input: "Short",
            output: "Response",
          }),
        ]),
      },
      {
        trace: createMockTrace({ traceId: "trace-2" }, [
          createMockSpan({
            model: "gpt-3.5-turbo",
            componentType: "reasoning",
            input: "Longer input text",
            output: "Another response",
          }),
        ]),
      },
    ];

    const dataset = exportBatchToDSPy(contexts, { includeMetadata: true });

    expect(dataset.stats.totalExamples).toBe(2);
    expect(dataset.stats.avgInputLength).toBeGreaterThan(0);
    expect(dataset.stats.avgOutputLength).toBeGreaterThan(0);
    expect(dataset.stats.modelDistribution["gpt-4"]).toBe(1);
    expect(dataset.stats.modelDistribution["gpt-3.5-turbo"]).toBe(1);
    expect(dataset.stats.componentTypeDistribution["prompt"]).toBe(1);
    expect(dataset.stats.componentTypeDistribution["reasoning"]).toBe(1);
  });

  test("includes field info", () => {
    const contexts: DSPyExportContext[] = [
      { trace: createMockTrace() },
    ];

    const dataset = exportBatchToDSPy(contexts, {
      fieldMapping: { preset: "question-answer" },
    });

    expect(dataset.fieldInfo.inputFields).toContain("question");
    expect(dataset.fieldInfo.outputFields).toContain("answer");
    expect(dataset.fieldInfo.preset).toBe("question-answer");
  });

  test("includes custom metadata", () => {
    const contexts: DSPyExportContext[] = [{ trace: createMockTrace() }];

    const dataset = exportBatchToDSPy(contexts, {
      metadata: { projectId: "test-project", version: "1.0.0" },
    });

    expect(dataset.metadata.projectId).toBe("test-project");
    expect(dataset.metadata.version).toBe("1.0.0");
  });
});

describe("validateDSPyDataset", () => {
  test("validates correct dataset", () => {
    const dataset = exportBatchToDSPy([{ trace: createMockTrace() }]);

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("detects invalid format", () => {
    const dataset = {
      format: "wrong-format",
      version: "1.0",
      train: [],
      stats: {},
      fieldInfo: { inputFields: [], outputFields: [] },
      metadata: {},
    } as unknown as DSPyDataset;

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Invalid format: expected 'dspy', got 'wrong-format'"
    );
  });

  test("detects missing example id", () => {
    const dataset = {
      format: "dspy",
      version: "1.0",
      createdAt: new Date().toISOString(),
      train: [
        {
          // Missing id
          _dspy_inputs: ["prompt"],
          prompt: "test",
          completion: "output",
        },
      ],
      stats: {
        totalExamples: 1,
        trainCount: 1,
        devCount: 0,
        avgInputLength: 4,
        avgOutputLength: 6,
        componentTypeDistribution: {},
        modelDistribution: {},
      },
      fieldInfo: { inputFields: ["prompt"], outputFields: ["completion"] },
      metadata: {},
    } as unknown as DSPyDataset;

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing id"))).toBe(true);
  });

  test("detects missing _dspy_inputs", () => {
    const dataset = {
      format: "dspy",
      version: "1.0",
      createdAt: new Date().toISOString(),
      train: [
        {
          id: "test-1",
          // Missing _dspy_inputs
          prompt: "test",
          completion: "output",
        },
      ],
      stats: {
        totalExamples: 1,
        trainCount: 1,
        devCount: 0,
        avgInputLength: 4,
        avgOutputLength: 6,
        componentTypeDistribution: {},
        modelDistribution: {},
      },
      fieldInfo: { inputFields: ["prompt"], outputFields: ["completion"] },
      metadata: {},
    } as unknown as DSPyDataset;

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("missing or empty _dspy_inputs"))
    ).toBe(true);
  });

  test("detects missing declared input field", () => {
    const dataset = {
      format: "dspy",
      version: "1.0",
      createdAt: new Date().toISOString(),
      train: [
        {
          id: "test-1",
          _dspy_inputs: ["prompt", "context"], // context is declared but missing
          prompt: "test",
          completion: "output",
        },
      ],
      stats: {
        totalExamples: 1,
        trainCount: 1,
        devCount: 0,
        avgInputLength: 4,
        avgOutputLength: 6,
        componentTypeDistribution: {},
        modelDistribution: {},
      },
      fieldInfo: {
        inputFields: ["prompt", "context"],
        outputFields: ["completion"],
      },
      metadata: {},
    } as unknown as DSPyDataset;

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("declared input field 'context'"))
    ).toBe(true);
  });

  test("warns about empty train set", () => {
    const dataset = {
      format: "dspy",
      version: "1.0",
      createdAt: new Date().toISOString(),
      train: [],
      stats: {
        totalExamples: 0,
        trainCount: 0,
        devCount: 0,
        avgInputLength: 0,
        avgOutputLength: 0,
        componentTypeDistribution: {},
        modelDistribution: {},
      },
      fieldInfo: { inputFields: [], outputFields: [] },
      metadata: {},
    } as DSPyDataset;

    const result = validateDSPyDataset(dataset);

    expect(result.valid).toBe(true); // Empty is valid, just a warning
    expect(result.warnings.some((w) => w.includes("Train set is empty"))).toBe(
      true
    );
  });
});

describe("mergeDSPyDatasets", () => {
  test("merges multiple datasets", () => {
    const dataset1 = exportBatchToDSPy([
      { trace: createMockTrace({ traceId: "trace-1" }) },
    ]);
    const dataset2 = exportBatchToDSPy([
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3" }) },
    ]);

    const merged = mergeDSPyDatasets([dataset1, dataset2]);

    expect(merged.train).toHaveLength(3);
    expect(merged.stats.totalExamples).toBe(3);
    expect(merged.metadata.datasetCount).toBe(2);
  });

  test("merges dev sets", () => {
    const dataset1 = exportBatchToDSPy(
      [
        { trace: createMockTrace({ traceId: "trace-1" }) },
        { trace: createMockTrace({ traceId: "trace-2" }) },
      ],
      {},
      { trainSplit: 0.5 }
    );
    const dataset2 = exportBatchToDSPy(
      [
        { trace: createMockTrace({ traceId: "trace-3" }) },
        { trace: createMockTrace({ traceId: "trace-4" }) },
      ],
      {},
      { trainSplit: 0.5 }
    );

    const merged = mergeDSPyDatasets([dataset1, dataset2]);

    expect(merged.train).toHaveLength(2);
    expect(merged.dev).toHaveLength(2);
  });

  test("recalculates statistics after merge", () => {
    const dataset1 = exportBatchToDSPy(
      [
        {
          trace: createMockTrace({ traceId: "trace-1" }, [
            createMockSpan({ model: "gpt-4" }),
          ]),
        },
      ],
      { includeMetadata: true }
    );
    const dataset2 = exportBatchToDSPy(
      [
        {
          trace: createMockTrace({ traceId: "trace-2" }, [
            createMockSpan({ model: "gpt-3.5-turbo" }),
          ]),
        },
      ],
      { includeMetadata: true }
    );

    const merged = mergeDSPyDatasets([dataset1, dataset2]);

    expect(merged.stats.modelDistribution["gpt-4"]).toBe(1);
    expect(merged.stats.modelDistribution["gpt-3.5-turbo"]).toBe(1);
  });
});

describe("datasetToJSONL", () => {
  test("converts dataset to JSONL format", () => {
    const dataset = exportBatchToDSPy([
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
    ]);

    const jsonl = datasetToJSONL(dataset);
    const lines = jsonl.split("\n");

    expect(lines).toHaveLength(2);

    const firstExample = JSON.parse(lines[0]);
    expect(firstExample.id).toBeDefined();
    expect(firstExample._dspy_inputs).toBeDefined();
    expect(firstExample.prompt).toBeDefined();
    expect(firstExample.completion).toBeDefined();
  });

  test("includes metadata when requested", () => {
    const dataset = exportBatchToDSPy([{ trace: createMockTrace() }], {
      includeMetadata: true,
    });

    const jsonl = datasetToJSONL(dataset, { includeMetadata: true });
    const example = JSON.parse(jsonl);

    expect(example._metadata).toBeDefined();
  });

  test("exports only train split by default", () => {
    const dataset = exportBatchToDSPy(
      [
        { trace: createMockTrace({ traceId: "trace-1" }) },
        { trace: createMockTrace({ traceId: "trace-2" }) },
      ],
      {},
      { trainSplit: 0.5 }
    );

    const trainJsonl = datasetToJSONL(dataset, { split: "train" });
    const devJsonl = datasetToJSONL(dataset, { split: "dev" });
    const allJsonl = datasetToJSONL(dataset, { split: "all" });

    expect(trainJsonl.split("\n")).toHaveLength(1);
    expect(devJsonl.split("\n")).toHaveLength(1);
    expect(allJsonl.split("\n")).toHaveLength(2);
  });
});

describe("generateDSPyLoaderCode", () => {
  test("generates valid Python loader code", () => {
    const dataset = exportBatchToDSPy([{ trace: createMockTrace() }], {
      fieldMapping: { preset: "question-answer" },
    });

    const code = generateDSPyLoaderCode(dataset);

    expect(code).toContain("import dspy");
    expect(code).toContain("def load_dataset");
    expect(code).toContain("def load_jsonl");
    expect(code).toContain(".with_inputs('question')");
    expect(code).toContain("Total examples:");
  });

  test("includes correct input fields in generated code", () => {
    const dataset = exportBatchToDSPy([{ trace: createMockTrace() }], {
      fieldMapping: {
        preset: "custom",
        inputField: "user_input",
        additionalInputs: [{ field: "context", source: "$model" }],
      },
    });

    const code = generateDSPyLoaderCode(dataset);

    expect(code).toContain("'user_input'");
  });
});

describe("streaming export", () => {
  test("streams examples with progress callback", async () => {
    const contexts: DSPyExportContext[] = [
      { trace: createMockTrace({ traceId: "trace-1" }) },
      { trace: createMockTrace({ traceId: "trace-2" }) },
      { trace: createMockTrace({ traceId: "trace-3" }) },
    ];

    const progressUpdates: { current: number; total: number }[] = [];
    const exportedExamples: unknown[] = [];

    const { streamExportToDSPy } = await import("../export/dspy.js");
    const dataset = await streamExportToDSPy(contexts, {
      onProgress: (current, total) => progressUpdates.push({ current, total }),
      onExample: (example) => exportedExamples.push(example),
    });

    expect(dataset.train).toHaveLength(3);
    expect(progressUpdates).toHaveLength(3);
    expect(progressUpdates[2]).toEqual({ current: 3, total: 3 });
    expect(exportedExamples).toHaveLength(3);
  });
});

describe("edge cases", () => {
  test("handles trace with no matching spans", () => {
    // Create a trace with only event spans (not generation or tool)
    const trace: TraceWithSpans = {
      trace: {
        traceId: "trace-empty",
        projectId: "project-1",
        name: "empty-trace",
        timestamp: new Date("2024-01-01T10:00:00Z"),
        durationMs: 1000,
        status: "ok",
        metadata: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallCount: 0,
        llmCallCount: 0,
      },
      spans: [
        createMockSpan({
          spanType: "event",
          input: undefined,
          output: undefined,
        }),
      ],
    };
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context);

    expect(examples).toHaveLength(0);
  });

  test("handles nested span trees", () => {
    const childSpan = createMockSpan({
      spanId: "child-span",
      input: "Child input",
      output: "Child output",
    });
    const parentSpan = createMockSpan({
      spanId: "parent-span",
      input: "Parent input",
      output: "Parent output",
      children: [childSpan],
    });
    const trace = createMockTrace({}, [parentSpan]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      includeIntermediateSpans: true,
    });

    expect(examples).toHaveLength(2);
  });

  test("handles spans with missing input or output", () => {
    const trace = createMockTrace({}, [
      createMockSpan({ spanId: "span-1", input: "Only input", output: "" }),
      createMockSpan({ spanId: "span-2", input: "", output: "Only output" }),
      createMockSpan({ spanId: "span-3", input: "", output: "" }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context, {
      includeIntermediateSpans: true,
    });

    // Should include spans with at least input OR output
    expect(examples).toHaveLength(2);
  });

  test("handles special characters in input/output", () => {
    const trace = createMockTrace({}, [
      createMockSpan({
        input: 'Test with "quotes" and\nnewlines\tand tabs',
        output: "Response with émojis 🎉 and unicode: 你好",
      }),
    ]);
    const context: DSPyExportContext = { trace };

    const examples = exportToDSPy(context);

    expect(examples).toHaveLength(1);
    expect(examples[0].prompt).toContain("quotes");
    expect(examples[0].completion).toContain("🎉");
  });
});
