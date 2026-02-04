/**
 * DSPy Export
 *
 * Export traces in DSPy format for prompt optimization.
 * DSPy is a framework for programming—not prompting—language models.
 *
 * @see https://dspy.ai/
 * @see https://github.com/stanfordnlp/dspy
 */

import type {
  TraceWithSpans,
  SpanWithChildren,
  ComponentType,
} from "@neon/shared";

/**
 * A single DSPy example representing a training datapoint.
 * DSPy examples are flexible dict-like structures with designated input/output fields.
 *
 * When loaded in Python DSPy:
 * ```python
 * example = dspy.Example(**example_dict).with_inputs(*input_keys)
 * ```
 */
export interface DSPyExample {
  /** Unique identifier for this example */
  id: string;

  /** Input fields for the example (marked via _dspy_inputs) */
  [key: string]: unknown;

  /** Metadata about which fields are inputs (used by DSPy's with_inputs) */
  _dspy_inputs: string[];

  /** Optional metadata not used for training */
  _metadata?: DSPyExampleMetadata;
}

/**
 * Metadata attached to each example
 */
export interface DSPyExampleMetadata {
  /** Source trace ID */
  traceId: string;
  /** Source span ID (if from a single span) */
  spanId?: string;
  /** Component type attribution */
  componentType?: ComponentType;
  /** Score value if available */
  score?: number;
  /** Score name if available */
  scoreName?: string;
  /** Model used for generation */
  model?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Preset field mappings for common DSPy use cases
 */
export type DSPyPreset =
  | "question-answer" // QA format: question -> answer
  | "chat" // Chat format: message -> response
  | "completion" // Completion format: prompt -> completion
  | "tool-use" // Tool use format: task, tool_name, tool_input -> tool_output
  | "chain-of-thought" // CoT format: question -> reasoning, answer
  | "custom"; // Custom field mapping

/**
 * Field mapping configuration for converting spans to examples
 */
export interface DSPyFieldMapping {
  /** Preset to use (provides default mappings) */
  preset?: DSPyPreset;

  /** Field name for the primary input (default: "question" or "prompt") */
  inputField?: string;

  /** Field name for the primary output (default: "answer" or "completion") */
  outputField?: string;

  /** Additional input fields to extract from span/trace */
  additionalInputs?: {
    /** Target field name in the example */
    field: string;
    /** Source: attribute name, or special values like "$model", "$toolName" */
    source: string;
  }[];

  /** Additional output fields to extract */
  additionalOutputs?: {
    /** Target field name in the example */
    field: string;
    /** Source attribute name or special value */
    source: string;
  }[];

  /** Custom field extractor function */
  customExtractor?: (span: SpanWithChildren) => Record<string, unknown>;
}

/**
 * Filter configuration for DSPy export
 */
export interface DSPyFilter {
  /** Filter by component types (include only these) */
  componentTypes?: ComponentType[];

  /** Minimum score threshold (0-1) for including examples */
  scoreThreshold?: number;

  /** Include only successful traces */
  successOnly?: boolean;

  /** Maximum duration for traces (filter out slow ones) */
  maxDurationMs?: number;

  /** Span types to include (default: ['generation']) */
  spanTypes?: string[];

  /** Filter by model names */
  models?: string[];

  /** Filter by tool names (for tool spans) */
  toolNames?: string[];

  /** Minimum input length (characters) */
  minInputLength?: number;

  /** Minimum output length (characters) */
  minOutputLength?: number;
}

/**
 * Configuration for DSPy export
 */
export interface DSPyExportConfig {
  /** Field mapping configuration */
  fieldMapping?: DSPyFieldMapping;

  /** Filters to apply during export */
  filter?: DSPyFilter;

  /** Whether to include metadata in examples */
  includeMetadata?: boolean;

  /** Whether to include intermediate spans (not just final output) */
  includeIntermediateSpans?: boolean;

  /** Whether to flatten nested tool calls into separate examples */
  flattenToolCalls?: boolean;

  /** Custom metadata to attach to dataset */
  metadata?: Record<string, unknown>;
}

/**
 * Score data for filtering
 */
export interface DSPyScoreData {
  name: string;
  value: number;
  spanId?: string;
}

/**
 * Context for exporting a single trace
 */
export interface DSPyExportContext {
  /** The trace to export */
  trace: TraceWithSpans;
  /** Scores to use for filtering */
  scores?: DSPyScoreData[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * DSPy dataset containing examples and metadata
 */
export interface DSPyDataset {
  /** Format identifier */
  format: "dspy";

  /** Format version */
  version: "1.0";

  /** Timestamp when dataset was created */
  createdAt: string;

  /** Training examples */
  train: DSPyExample[];

  /** Optional development/validation examples */
  dev?: DSPyExample[];

  /** Dataset-level statistics */
  stats: {
    totalExamples: number;
    trainCount: number;
    devCount: number;
    avgInputLength: number;
    avgOutputLength: number;
    componentTypeDistribution: Record<string, number>;
    modelDistribution: Record<string, number>;
  };

  /** Field mapping info for loading in DSPy */
  fieldInfo: {
    inputFields: string[];
    outputFields: string[];
    preset?: DSPyPreset;
  };

  /** Dataset-level metadata */
  metadata: Record<string, unknown>;
}

/**
 * Get default field names based on preset
 */
function getPresetFields(preset: DSPyPreset): {
  inputField: string;
  outputField: string;
  additionalInputs?: { field: string; source: string }[];
  additionalOutputs?: { field: string; source: string }[];
} {
  switch (preset) {
    case "question-answer":
      return { inputField: "question", outputField: "answer" };

    case "chat":
      return { inputField: "message", outputField: "response" };

    case "completion":
      return { inputField: "prompt", outputField: "completion" };

    case "tool-use":
      return {
        inputField: "task",
        outputField: "tool_output",
        additionalInputs: [
          { field: "tool_name", source: "$toolName" },
          { field: "tool_input", source: "$toolInput" },
        ],
      };

    case "chain-of-thought":
      return {
        inputField: "question",
        outputField: "answer",
        additionalOutputs: [{ field: "reasoning", source: "$reasoning" }],
      };

    case "custom":
    default:
      return { inputField: "input", outputField: "output" };
  }
}

/**
 * Extract special source values from a span
 */
function extractSpecialSource(
  span: SpanWithChildren,
  source: string
): unknown | undefined {
  switch (source) {
    case "$model":
      return span.model;
    case "$toolName":
      return span.toolName;
    case "$toolInput":
      return span.toolInput;
    case "$toolOutput":
      return span.toolOutput;
    case "$componentType":
      return span.componentType;
    case "$spanType":
      return span.spanType;
    case "$durationMs":
      return span.durationMs;
    case "$reasoning":
      // Try to extract reasoning from the output (common patterns)
      if (span.output) {
        const reasoningMatch = span.output.match(
          /(?:reasoning|thinking|thought):\s*(.+?)(?:\n\n|$)/is
        );
        if (reasoningMatch) {
          return reasoningMatch[1].trim();
        }
      }
      return undefined;
    default:
      // Check attributes
      return span.attributes[source];
  }
}

/**
 * Flatten span tree into ordered array by timestamp
 */
function flattenSpans(spans: SpanWithChildren[]): SpanWithChildren[] {
  const result: SpanWithChildren[] = [];

  function traverse(span: SpanWithChildren): void {
    result.push(span);
    for (const child of span.children) {
      traverse(child);
    }
  }

  for (const span of spans) {
    traverse(span);
  }

  return result.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Apply filters to spans
 */
function filterSpans(
  spans: SpanWithChildren[],
  filter?: DSPyFilter,
  scores?: DSPyScoreData[]
): SpanWithChildren[] {
  if (!filter) return spans;

  return spans.filter((span) => {
    // Filter by span type
    if (filter.spanTypes && !filter.spanTypes.includes(span.spanType)) {
      return false;
    }

    // Filter by component type
    if (filter.componentTypes && span.componentType) {
      if (!filter.componentTypes.includes(span.componentType)) {
        return false;
      }
    }

    // Filter by model
    if (filter.models && span.model) {
      if (!filter.models.includes(span.model)) {
        return false;
      }
    }

    // Filter by tool name
    if (filter.toolNames && span.toolName) {
      if (!filter.toolNames.includes(span.toolName)) {
        return false;
      }
    }

    // Filter by score threshold
    if (filter.scoreThreshold !== undefined && scores) {
      const spanScore = scores.find((s) => s.spanId === span.spanId);
      if (spanScore && spanScore.value < filter.scoreThreshold) {
        return false;
      }
    }

    // Filter by input length
    const input = span.input || span.toolInput || "";
    if (filter.minInputLength && input.length < filter.minInputLength) {
      return false;
    }

    // Filter by output length
    const output = span.output || span.toolOutput || "";
    if (filter.minOutputLength && output.length < filter.minOutputLength) {
      return false;
    }

    return true;
  });
}

/**
 * Convert a span to a DSPy example
 */
function spanToExample(
  span: SpanWithChildren,
  traceId: string,
  config: DSPyExportConfig,
  scores?: DSPyScoreData[]
): DSPyExample | null {
  const fieldMapping = config.fieldMapping || {};
  const preset = fieldMapping.preset || "completion";
  const presetFields = getPresetFields(preset);

  const inputField = fieldMapping.inputField || presetFields.inputField;
  const outputField = fieldMapping.outputField || presetFields.outputField;

  // Extract primary input/output based on span type
  let primaryInput: string;
  let primaryOutput: string;

  if (span.spanType === "tool") {
    primaryInput = span.toolInput || span.input || "";
    primaryOutput = span.toolOutput || span.output || "";
  } else {
    primaryInput = span.input || "";
    primaryOutput = span.output || "";
  }

  // Skip if no meaningful input/output
  if (!primaryInput && !primaryOutput) {
    return null;
  }

  // Build the example
  const example: DSPyExample = {
    id: span.spanId,
    [inputField]: primaryInput,
    [outputField]: primaryOutput,
    _dspy_inputs: [inputField],
  };

  // Add additional input fields
  const additionalInputs =
    fieldMapping.additionalInputs || presetFields.additionalInputs || [];
  for (const { field, source } of additionalInputs) {
    const value = extractSpecialSource(span, source);
    if (value !== undefined) {
      example[field] = value;
      example._dspy_inputs.push(field);
    }
  }

  // Add additional output fields
  const additionalOutputs =
    fieldMapping.additionalOutputs || presetFields.additionalOutputs || [];
  for (const { field, source } of additionalOutputs) {
    const value = extractSpecialSource(span, source);
    if (value !== undefined) {
      example[field] = value;
    }
  }

  // Apply custom extractor if provided
  if (fieldMapping.customExtractor) {
    const customFields = fieldMapping.customExtractor(span);
    Object.assign(example, customFields);
  }

  // Add metadata if configured
  if (config.includeMetadata) {
    const spanScore = scores?.find((s) => s.spanId === span.spanId);
    example._metadata = {
      traceId,
      spanId: span.spanId,
      componentType: span.componentType,
      model: span.model,
      durationMs: span.durationMs,
      ...(spanScore && {
        score: spanScore.value,
        scoreName: spanScore.name,
      }),
    };
  }

  return example;
}

/**
 * Export a single trace to DSPy examples
 *
 * @example
 * ```typescript
 * const examples = exportToDSPy({
 *   trace: myTrace,
 *   scores: [{ name: 'quality', value: 0.9 }],
 * }, {
 *   fieldMapping: { preset: 'question-answer' },
 *   filter: {
 *     componentTypes: ['generation'],
 *     scoreThreshold: 0.5,
 *   },
 * });
 * ```
 */
export function exportToDSPy(
  context: DSPyExportContext,
  config: DSPyExportConfig = {}
): DSPyExample[] {
  const { trace, scores } = context;
  const { filter } = config;

  // Apply trace-level filters
  if (filter?.successOnly && trace.trace.status !== "ok") {
    return [];
  }

  if (filter?.maxDurationMs && trace.trace.durationMs > filter.maxDurationMs) {
    return [];
  }

  // Flatten and filter spans
  const allSpans = flattenSpans(trace.spans);
  const defaultSpanTypes = ["generation"];
  const spanFilter: DSPyFilter = {
    ...filter,
    spanTypes: filter?.spanTypes ?? defaultSpanTypes,
  };
  const filteredSpans = filterSpans(allSpans, spanFilter, scores);

  // Convert spans to examples
  const examples: DSPyExample[] = [];
  for (const span of filteredSpans) {
    const example = spanToExample(span, trace.trace.traceId, config, scores);
    if (example) {
      examples.push(example);
    }
  }

  // If not including intermediate spans, only keep the last example per trace
  if (!config.includeIntermediateSpans && examples.length > 1) {
    return [examples[examples.length - 1]];
  }

  return examples;
}

/**
 * Export multiple traces to a DSPy dataset
 *
 * @example
 * ```typescript
 * const dataset = exportBatchToDSPy(
 *   traces.map(t => ({ trace: t, scores: scoresMap[t.trace.traceId] })),
 *   {
 *     fieldMapping: { preset: 'completion' },
 *     filter: { successOnly: true, scoreThreshold: 0.7 },
 *     metadata: { projectId: 'my-project' },
 *   }
 * );
 *
 * // Write to file for DSPy training
 * fs.writeFileSync('training-data.json', JSON.stringify(dataset, null, 2));
 * ```
 */
export function exportBatchToDSPy(
  contexts: DSPyExportContext[],
  config: DSPyExportConfig = {},
  options: { trainSplit?: number } = {}
): DSPyDataset {
  const { trainSplit = 1.0 } = options;
  const allExamples: DSPyExample[] = [];

  // Collect examples from all traces
  for (const context of contexts) {
    const examples = exportToDSPy(context, config);
    allExamples.push(...examples);
  }

  // Split into train/dev
  const splitIndex = Math.floor(allExamples.length * trainSplit);
  const trainExamples = allExamples.slice(0, splitIndex);
  const devExamples = allExamples.slice(splitIndex);

  // Calculate statistics
  const componentTypeCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let totalInputLength = 0;
  let totalOutputLength = 0;

  const fieldMapping = config.fieldMapping || {};
  const preset = fieldMapping.preset || "completion";
  const presetFields = getPresetFields(preset);
  const inputField = fieldMapping.inputField || presetFields.inputField;
  const outputField = fieldMapping.outputField || presetFields.outputField;

  for (const example of allExamples) {
    // Count component types
    const componentType =
      (example._metadata?.componentType as string) || "unknown";
    componentTypeCounts[componentType] =
      (componentTypeCounts[componentType] || 0) + 1;

    // Count models
    const model = (example._metadata?.model as string) || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;

    // Sum lengths
    const input = example[inputField];
    const output = example[outputField];
    totalInputLength += typeof input === "string" ? input.length : 0;
    totalOutputLength += typeof output === "string" ? output.length : 0;
  }

  // Determine all input/output fields
  const inputFields = new Set<string>();
  const outputFields = new Set<string>();

  if (allExamples.length > 0) {
    // Use the first example to determine fields
    const firstExample = allExamples[0];
    for (const field of firstExample._dspy_inputs) {
      inputFields.add(field);
    }
    for (const key of Object.keys(firstExample)) {
      if (
        !key.startsWith("_") &&
        key !== "id" &&
        !firstExample._dspy_inputs.includes(key)
      ) {
        outputFields.add(key);
      }
    }
  }

  return {
    format: "dspy",
    version: "1.0",
    createdAt: new Date().toISOString(),
    train: trainExamples,
    dev: devExamples.length > 0 ? devExamples : undefined,
    stats: {
      totalExamples: allExamples.length,
      trainCount: trainExamples.length,
      devCount: devExamples.length,
      avgInputLength:
        allExamples.length > 0 ? totalInputLength / allExamples.length : 0,
      avgOutputLength:
        allExamples.length > 0 ? totalOutputLength / allExamples.length : 0,
      componentTypeDistribution: componentTypeCounts,
      modelDistribution: modelCounts,
    },
    fieldInfo: {
      inputFields: Array.from(inputFields),
      outputFields: Array.from(outputFields),
      preset: fieldMapping.preset,
    },
    metadata: {
      exportedAt: new Date().toISOString(),
      ...config.metadata,
    },
  };
}

/**
 * Configuration for streaming export
 */
export interface DSPyStreamExportConfig extends DSPyExportConfig {
  /** Callback for each exported example */
  onExample?: (example: DSPyExample) => void;
  /** Callback for progress updates */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Export traces with streaming support for large datasets
 *
 * @example
 * ```typescript
 * const dataset = await streamExportToDSPy(
 *   traceContexts,
 *   {
 *     onExample: (example) => appendToFile(example),
 *     onProgress: (current, total) => console.log(`${current}/${total}`),
 *   }
 * );
 * ```
 */
export async function streamExportToDSPy(
  contexts: DSPyExportContext[],
  config: DSPyStreamExportConfig = {},
  options: { trainSplit?: number } = {}
): Promise<DSPyDataset> {
  const { onExample, onProgress, ...exportConfig } = config;
  const allExamples: DSPyExample[] = [];
  const total = contexts.length;

  for (let i = 0; i < total; i++) {
    const examples = exportToDSPy(contexts[i], exportConfig);
    for (const example of examples) {
      allExamples.push(example);
      if (onExample) {
        onExample(example);
      }
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    // Yield to event loop for large batches
    if (i % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Build dataset with collected examples
  const { trainSplit = 1.0 } = options;
  const splitIndex = Math.floor(allExamples.length * trainSplit);
  const trainExamples = allExamples.slice(0, splitIndex);
  const devExamples = allExamples.slice(splitIndex);

  // Calculate statistics
  const componentTypeCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let totalInputLength = 0;
  let totalOutputLength = 0;

  const fieldMapping = exportConfig.fieldMapping || {};
  const preset = fieldMapping.preset || "completion";
  const presetFields = getPresetFields(preset);
  const inputField = fieldMapping.inputField || presetFields.inputField;
  const outputField = fieldMapping.outputField || presetFields.outputField;

  for (const example of allExamples) {
    const componentType =
      (example._metadata?.componentType as string) || "unknown";
    componentTypeCounts[componentType] =
      (componentTypeCounts[componentType] || 0) + 1;

    const model = (example._metadata?.model as string) || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;

    const input = example[inputField];
    const output = example[outputField];
    totalInputLength += typeof input === "string" ? input.length : 0;
    totalOutputLength += typeof output === "string" ? output.length : 0;
  }

  const inputFields = new Set<string>();
  const outputFields = new Set<string>();

  if (allExamples.length > 0) {
    const firstExample = allExamples[0];
    for (const field of firstExample._dspy_inputs) {
      inputFields.add(field);
    }
    for (const key of Object.keys(firstExample)) {
      if (
        !key.startsWith("_") &&
        key !== "id" &&
        !firstExample._dspy_inputs.includes(key)
      ) {
        outputFields.add(key);
      }
    }
  }

  return {
    format: "dspy",
    version: "1.0",
    createdAt: new Date().toISOString(),
    train: trainExamples,
    dev: devExamples.length > 0 ? devExamples : undefined,
    stats: {
      totalExamples: allExamples.length,
      trainCount: trainExamples.length,
      devCount: devExamples.length,
      avgInputLength:
        allExamples.length > 0 ? totalInputLength / allExamples.length : 0,
      avgOutputLength:
        allExamples.length > 0 ? totalOutputLength / allExamples.length : 0,
      componentTypeDistribution: componentTypeCounts,
      modelDistribution: modelCounts,
    },
    fieldInfo: {
      inputFields: Array.from(inputFields),
      outputFields: Array.from(outputFields),
      preset: fieldMapping.preset,
    },
    metadata: {
      exportedAt: new Date().toISOString(),
      ...exportConfig.metadata,
    },
  };
}

/**
 * Validate a DSPy dataset for completeness
 */
export function validateDSPyDataset(dataset: DSPyDataset): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check format
  if (dataset.format !== "dspy") {
    errors.push(`Invalid format: expected 'dspy', got '${dataset.format}'`);
  }

  if (dataset.version !== "1.0") {
    warnings.push(`Unsupported version: ${dataset.version}`);
  }

  // Check train array
  if (!Array.isArray(dataset.train)) {
    errors.push("Train must be an array");
  } else if (dataset.train.length === 0) {
    warnings.push("Train set is empty");
  }

  // Validate examples
  const inputFields = new Set(dataset.fieldInfo.inputFields);

  for (let i = 0; i < dataset.train.length; i++) {
    const example = dataset.train[i];

    if (!example.id) {
      errors.push(`Train example ${i}: missing id`);
    }

    if (
      !example._dspy_inputs ||
      !Array.isArray(example._dspy_inputs) ||
      example._dspy_inputs.length === 0
    ) {
      errors.push(`Train example ${i}: missing or empty _dspy_inputs`);
    } else {
      // Check that all declared inputs exist
      for (const inputField of example._dspy_inputs) {
        if (example[inputField] === undefined) {
          errors.push(
            `Train example ${i}: declared input field '${inputField}' is missing`
          );
        }
      }
    }

    // Check for at least one output field (only if _dspy_inputs is valid)
    if (Array.isArray(example._dspy_inputs)) {
      const outputFields = Object.keys(example).filter(
        (k) =>
          !k.startsWith("_") && k !== "id" && !example._dspy_inputs.includes(k)
      );
      if (outputFields.length === 0) {
        warnings.push(`Train example ${i}: no output fields found`);
      }
    }
  }

  // Validate dev set if present
  if (dataset.dev) {
    for (let i = 0; i < dataset.dev.length; i++) {
      const example = dataset.dev[i];

      if (!example.id) {
        errors.push(`Dev example ${i}: missing id`);
      }

      if (
        !example._dspy_inputs ||
        !Array.isArray(example._dspy_inputs) ||
        example._dspy_inputs.length === 0
      ) {
        errors.push(`Dev example ${i}: missing or empty _dspy_inputs`);
      }
    }
  }

  // Validate stats consistency
  const expectedTotal = dataset.train.length + (dataset.dev?.length || 0);
  if (dataset.stats.totalExamples !== expectedTotal) {
    warnings.push(
      `Stats totalExamples (${dataset.stats.totalExamples}) doesn't match actual count (${expectedTotal})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Merge multiple DSPy datasets into one
 */
export function mergeDSPyDatasets(datasets: DSPyDataset[]): DSPyDataset {
  const allTrain: DSPyExample[] = [];
  const allDev: DSPyExample[] = [];
  const mergedMetadata: Record<string, unknown> = {};
  const inputFieldsSet = new Set<string>();
  const outputFieldsSet = new Set<string>();

  for (const dataset of datasets) {
    allTrain.push(...dataset.train);
    if (dataset.dev) {
      allDev.push(...dataset.dev);
    }
    Object.assign(mergedMetadata, dataset.metadata);

    for (const field of dataset.fieldInfo.inputFields) {
      inputFieldsSet.add(field);
    }
    for (const field of dataset.fieldInfo.outputFields) {
      outputFieldsSet.add(field);
    }
  }

  // Recalculate statistics
  const componentTypeCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let totalInputLength = 0;
  let totalOutputLength = 0;

  const allExamples = [...allTrain, ...allDev];
  const inputField = inputFieldsSet.size > 0 ? [...inputFieldsSet][0] : "input";
  const outputField =
    outputFieldsSet.size > 0 ? [...outputFieldsSet][0] : "output";

  for (const example of allExamples) {
    const componentType =
      (example._metadata?.componentType as string) || "unknown";
    componentTypeCounts[componentType] =
      (componentTypeCounts[componentType] || 0) + 1;

    const model = (example._metadata?.model as string) || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;

    const input = example[inputField];
    const output = example[outputField];
    totalInputLength += typeof input === "string" ? input.length : 0;
    totalOutputLength += typeof output === "string" ? output.length : 0;
  }

  return {
    format: "dspy",
    version: "1.0",
    createdAt: new Date().toISOString(),
    train: allTrain,
    dev: allDev.length > 0 ? allDev : undefined,
    stats: {
      totalExamples: allExamples.length,
      trainCount: allTrain.length,
      devCount: allDev.length,
      avgInputLength:
        allExamples.length > 0 ? totalInputLength / allExamples.length : 0,
      avgOutputLength:
        allExamples.length > 0 ? totalOutputLength / allExamples.length : 0,
      componentTypeDistribution: componentTypeCounts,
      modelDistribution: modelCounts,
    },
    fieldInfo: {
      inputFields: Array.from(inputFieldsSet),
      outputFields: Array.from(outputFieldsSet),
    },
    metadata: {
      mergedAt: new Date().toISOString(),
      datasetCount: datasets.length,
      ...mergedMetadata,
    },
  };
}

/**
 * Convert DSPy dataset to JSONL format for easy loading
 *
 * @example
 * ```typescript
 * const jsonl = datasetToJSONL(dataset);
 * fs.writeFileSync('train.jsonl', jsonl);
 *
 * // Load in Python:
 * // examples = [dspy.Example(**json.loads(line)).with_inputs(*inputs) for line in open('train.jsonl')]
 * ```
 */
export function datasetToJSONL(
  dataset: DSPyDataset,
  options: { includeMetadata?: boolean; split?: "train" | "dev" | "all" } = {}
): string {
  const { includeMetadata = false, split = "train" } = options;

  let examples: DSPyExample[];
  if (split === "train") {
    examples = dataset.train;
  } else if (split === "dev") {
    examples = dataset.dev || [];
  } else {
    examples = [...dataset.train, ...(dataset.dev || [])];
  }

  const lines: string[] = [];

  for (const example of examples) {
    // Create a clean example for export
    const exportExample: Record<string, unknown> = {
      id: example.id,
      _dspy_inputs: example._dspy_inputs,
    };

    // Add all non-private fields
    for (const key of Object.keys(example)) {
      if (!key.startsWith("_") && key !== "id") {
        exportExample[key] = example[key];
      }
    }

    // Optionally include metadata
    if (includeMetadata && example._metadata) {
      exportExample._metadata = example._metadata;
    }

    lines.push(JSON.stringify(exportExample));
  }

  return lines.join("\n");
}

/**
 * Generate Python code snippet for loading the dataset in DSPy
 */
export function generateDSPyLoaderCode(dataset: DSPyDataset): string {
  const inputFields = dataset.fieldInfo.inputFields;

  return `"""
Auto-generated DSPy dataset loader
Created: ${dataset.createdAt}
Total examples: ${dataset.stats.totalExamples}
Train: ${dataset.stats.trainCount}, Dev: ${dataset.stats.devCount}
"""

import json
import dspy

def load_dataset(filepath: str) -> tuple[list[dspy.Example], list[dspy.Example]]:
    """
    Load the Neon-exported dataset for DSPy training.

    Args:
        filepath: Path to the JSON dataset file

    Returns:
        Tuple of (train_examples, dev_examples)
    """
    with open(filepath, 'r') as f:
        data = json.load(f)

    train = []
    for ex in data.get('train', []):
        # Remove internal fields for DSPy
        clean_ex = {k: v for k, v in ex.items() if not k.startswith('_') and k != 'id'}
        example = dspy.Example(**clean_ex).with_inputs(${inputFields.map((f) => `'${f}'`).join(", ")})
        train.append(example)

    dev = []
    for ex in data.get('dev', []):
        clean_ex = {k: v for k, v in ex.items() if not k.startswith('_') and k != 'id'}
        example = dspy.Example(**clean_ex).with_inputs(${inputFields.map((f) => `'${f}'`).join(", ")})
        dev.append(example)

    return train, dev


def load_jsonl(filepath: str) -> list[dspy.Example]:
    """
    Load examples from JSONL format.

    Args:
        filepath: Path to the JSONL file

    Returns:
        List of DSPy examples
    """
    examples = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                ex = json.loads(line)
                inputs = ex.pop('_dspy_inputs', [${inputFields.map((f) => `'${f}'`).join(", ")}])
                ex.pop('id', None)
                ex.pop('_metadata', None)
                example = dspy.Example(**ex).with_inputs(*inputs)
                examples.append(example)
    return examples


# Usage:
# train, dev = load_dataset('neon_export.json')
# trainset = load_jsonl('train.jsonl')
`;
}
