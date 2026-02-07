# DSPy Export

Export your Neon traces to DSPy format for prompt optimization. DSPy is a framework for programming language models that enables systematic prompt tuning using training data from your production traces.

## Overview

The DSPy export feature:

1. **Converts traces to examples** - Transform spans into DSPy-compatible training data
2. **Supports multiple formats** - Question-answer, chat, completion, tool-use, chain-of-thought
3. **Filters for quality** - Select only high-quality traces based on scores and success
4. **Preserves metadata** - Keep trace context for debugging and analysis
5. **Exports to DSPy dataset** - Ready for use with DSPy optimizers

## Quick Start

```typescript
import { exportToDSPy, exportBatchToDSPy } from '@neon/sdk';

// Export a single trace
const examples = exportToDSPy({
  trace: myTrace,
  scores: [{ name: 'quality', value: 0.9 }],
}, {
  fieldMapping: { preset: 'question-answer' },
  filter: { scoreThreshold: 0.5 },
});

// Export multiple traces to a dataset
const dataset = exportBatchToDSPy(
  traces.map(t => ({
    trace: t,
    scores: scoresMap[t.trace.traceId],
  })),
  {
    fieldMapping: { preset: 'completion' },
    filter: { successOnly: true },
  }
);

// Save for DSPy training
fs.writeFileSync('training-data.json', JSON.stringify(dataset, null, 2));
```

## Presets

Presets provide sensible defaults for common use cases:

| Preset | Input Field | Output Field | Use Case |
|--------|-------------|--------------|----------|
| `question-answer` | `question` | `answer` | Q&A tasks, factual queries |
| `chat` | `message` | `response` | Conversational agents |
| `completion` | `prompt` | `completion` | Text completion |
| `tool-use` | `task`, `tool_name`, `tool_input` | `tool_output` | Tool-using agents |
| `chain-of-thought` | `question` | `reasoning`, `answer` | Reasoning tasks |
| `custom` | `input` | `output` | Custom field names |

```typescript
// Question-answer format
const examples = exportToDSPy(context, {
  fieldMapping: { preset: 'question-answer' },
});
// Result: { question: "What is...", answer: "The answer is..." }

// Chain-of-thought format
const examples = exportToDSPy(context, {
  fieldMapping: { preset: 'chain-of-thought' },
});
// Result: { question: "...", reasoning: "Let me think...", answer: "..." }
```

## API Reference

### exportToDSPy()

Export a single trace to DSPy examples.

```typescript
function exportToDSPy(
  context: DSPyExportContext,
  config?: DSPyExportConfig
): DSPyExample[];
```

**Parameters:**

```typescript
interface DSPyExportContext {
  /** The trace to export */
  trace: TraceWithSpans;
  /** Scores to use for filtering */
  scores?: DSPyScoreData[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

interface DSPyScoreData {
  name: string;
  value: number;
  spanId?: string;  // Associate with specific span
}
```

**Returns:** Array of `DSPyExample` objects.

### exportBatchToDSPy()

Export multiple traces to a complete DSPy dataset.

```typescript
function exportBatchToDSPy(
  contexts: DSPyExportContext[],
  config?: DSPyExportConfig,
  options?: { trainSplit?: number }
): DSPyDataset;
```

**Options:**

- `trainSplit` - Fraction of examples for training (default: 1.0, all training)

**Returns:** `DSPyDataset` with train/dev splits and statistics.

### streamExportToDSPy()

Stream export for large datasets with progress callbacks.

```typescript
async function streamExportToDSPy(
  contexts: DSPyExportContext[],
  config?: DSPyStreamExportConfig,
  options?: { trainSplit?: number }
): Promise<DSPyDataset>;
```

**Example:**

```typescript
const dataset = await streamExportToDSPy(
  traceContexts,
  {
    fieldMapping: { preset: 'completion' },
    onExample: (example) => {
      // Write each example as it's processed
      appendToFile(JSON.stringify(example) + '\n');
    },
    onProgress: (current, total) => {
      console.log(`Progress: ${current}/${total}`);
    },
  }
);
```

## Configuration

### DSPyExportConfig

```typescript
interface DSPyExportConfig {
  /** Field mapping configuration */
  fieldMapping?: DSPyFieldMapping;

  /** Filters to apply during export */
  filter?: DSPyFilter;

  /** Include metadata in examples (default: false) */
  includeMetadata?: boolean;

  /** Include intermediate spans, not just final (default: false) */
  includeIntermediateSpans?: boolean;

  /** Flatten nested tool calls into separate examples (default: false) */
  flattenToolCalls?: boolean;

  /** Custom metadata to attach to dataset */
  metadata?: Record<string, unknown>;
}
```

### Field Mapping

Customize how span data maps to DSPy fields:

```typescript
interface DSPyFieldMapping {
  /** Preset to use */
  preset?: DSPyPreset;

  /** Field name for primary input */
  inputField?: string;

  /** Field name for primary output */
  outputField?: string;

  /** Additional input fields to extract */
  additionalInputs?: Array<{
    field: string;   // Target field name
    source: string;  // Source: attribute name or special value
  }>;

  /** Additional output fields to extract */
  additionalOutputs?: Array<{
    field: string;
    source: string;
  }>;

  /** Custom field extractor function */
  customExtractor?: (span: SpanWithChildren) => Record<string, unknown>;
}
```

**Special source values:**

| Source | Description |
|--------|-------------|
| `$model` | Model name from span |
| `$toolName` | Tool name from span |
| `$toolInput` | Tool input JSON |
| `$toolOutput` | Tool output |
| `$componentType` | Component type |
| `$spanType` | Span type |
| `$durationMs` | Duration in milliseconds |
| `$reasoning` | Extracted reasoning from output |

**Example:**

```typescript
fieldMapping: {
  preset: 'custom',
  inputField: 'user_query',
  outputField: 'agent_response',
  additionalInputs: [
    { field: 'model', source: '$model' },
    { field: 'context', source: 'context_attribute' },
  ],
  additionalOutputs: [
    { field: 'tool_calls', source: '$toolName' },
  ],
  customExtractor: (span) => ({
    token_count: span.totalTokens,
    was_cached: span.attributes['cache_hit'] === 'true',
  }),
}
```

### Filters

Control which spans/traces are included:

```typescript
interface DSPyFilter {
  /** Include only these component types */
  componentTypes?: ComponentType[];

  /** Minimum score threshold (0-1) */
  scoreThreshold?: number;

  /** Include only successful traces */
  successOnly?: boolean;

  /** Maximum duration (filter out slow traces) */
  maxDurationMs?: number;

  /** Span types to include (default: ['generation']) */
  spanTypes?: string[];

  /** Include only these models */
  models?: string[];

  /** Include only these tools */
  toolNames?: string[];

  /** Minimum input length (characters) */
  minInputLength?: number;

  /** Minimum output length (characters) */
  minOutputLength?: number;
}
```

**Example:**

```typescript
filter: {
  successOnly: true,
  scoreThreshold: 0.7,
  componentTypes: ['reasoning', 'generation'],
  models: ['gpt-4', 'gpt-4-turbo'],
  minOutputLength: 50,
}
```

## DSPyDataset Structure

The exported dataset format:

```typescript
interface DSPyDataset {
  format: 'dspy';
  version: '1.0';
  createdAt: string;

  /** Training examples */
  train: DSPyExample[];

  /** Optional dev/validation examples */
  dev?: DSPyExample[];

  /** Dataset statistics */
  stats: {
    totalExamples: number;
    trainCount: number;
    devCount: number;
    avgInputLength: number;
    avgOutputLength: number;
    componentTypeDistribution: Record<string, number>;
    modelDistribution: Record<string, number>;
  };

  /** Field info for loading */
  fieldInfo: {
    inputFields: string[];
    outputFields: string[];
    preset?: DSPyPreset;
  };

  /** Custom metadata */
  metadata: Record<string, unknown>;
}
```

## DSPyExample Structure

Each example has:

```typescript
interface DSPyExample {
  /** Unique identifier */
  id: string;

  /** Input/output fields (dynamic based on mapping) */
  [key: string]: unknown;

  /** Which fields are inputs (used by DSPy's with_inputs) */
  _dspy_inputs: string[];

  /** Optional metadata */
  _metadata?: {
    traceId: string;
    spanId?: string;
    componentType?: string;
    score?: number;
    scoreName?: string;
    model?: string;
    durationMs?: number;
  };
}
```

## Utility Functions

### validateDSPyDataset()

Validate a dataset for completeness:

```typescript
const { valid, errors, warnings } = validateDSPyDataset(dataset);

if (!valid) {
  console.error('Dataset validation failed:', errors);
}

if (warnings.length > 0) {
  console.warn('Warnings:', warnings);
}
```

### mergeDSPyDatasets()

Combine multiple datasets:

```typescript
const combined = mergeDSPyDatasets([dataset1, dataset2, dataset3]);
console.log(`Merged ${combined.stats.totalExamples} examples`);
```

### datasetToJSONL()

Convert to JSONL format for streaming:

```typescript
const jsonl = datasetToJSONL(dataset, {
  includeMetadata: false,
  split: 'train',  // 'train' | 'dev' | 'all'
});

fs.writeFileSync('train.jsonl', jsonl);
```

### generateDSPyLoaderCode()

Generate Python code to load the dataset:

```typescript
const pythonCode = generateDSPyLoaderCode(dataset);
fs.writeFileSync('loader.py', pythonCode);
```

Generated code example:

```python
"""
Auto-generated DSPy dataset loader
Created: 2024-01-15T10:30:00Z
Total examples: 500
Train: 400, Dev: 100
"""

import json
import dspy

def load_dataset(filepath: str) -> tuple[list[dspy.Example], list[dspy.Example]]:
    with open(filepath, 'r') as f:
        data = json.load(f)

    train = []
    for ex in data.get('train', []):
        clean_ex = {k: v for k, v in ex.items() if not k.startswith('_') and k != 'id'}
        example = dspy.Example(**clean_ex).with_inputs('question')
        train.append(example)

    dev = []
    for ex in data.get('dev', []):
        clean_ex = {k: v for k, v in ex.items() if not k.startswith('_') and k != 'id'}
        example = dspy.Example(**clean_ex).with_inputs('question')
        dev.append(example)

    return train, dev
```

## Use Cases

### 1. Export High-Quality Traces

```typescript
// Collect traces with scores
const tracesWithScores = await getRecentTraces();

const dataset = exportBatchToDSPy(
  tracesWithScores.map(t => ({
    trace: t.trace,
    scores: t.scores,
  })),
  {
    fieldMapping: { preset: 'question-answer' },
    filter: {
      successOnly: true,
      scoreThreshold: 0.8,  // Only high-quality
    },
    includeMetadata: true,
  },
  { trainSplit: 0.8 }  // 80% train, 20% dev
);

fs.writeFileSync('high_quality_data.json', JSON.stringify(dataset, null, 2));
```

### 2. Export Tool-Use Examples

```typescript
const dataset = exportBatchToDSPy(traces, {
  fieldMapping: { preset: 'tool-use' },
  filter: {
    spanTypes: ['tool'],
    toolNames: ['search', 'calculator', 'code_exec'],
  },
});
```

### 3. Export Chain-of-Thought

```typescript
const dataset = exportBatchToDSPy(traces, {
  fieldMapping: { 
    preset: 'chain-of-thought',
    additionalOutputs: [
      { field: 'confidence', source: 'confidence_score' },
    ],
  },
  filter: {
    componentTypes: ['reasoning'],
    minOutputLength: 100,  // Ensure substantive reasoning
  },
});
```

### 4. Custom Field Extraction

```typescript
const dataset = exportBatchToDSPy(traces, {
  fieldMapping: {
    preset: 'custom',
    inputField: 'task_description',
    outputField: 'solution',
    additionalInputs: [
      { field: 'constraints', source: 'task_constraints' },
      { field: 'examples', source: 'few_shot_examples' },
    ],
    customExtractor: (span) => {
      // Parse structured output
      const output = JSON.parse(span.output || '{}');
      return {
        steps: output.steps,
        final_answer: output.answer,
      };
    },
  },
});
```

### 5. Model-Specific Export

```typescript
// Export examples from specific models for fine-tuning
const gpt4Examples = exportBatchToDSPy(traces, {
  filter: {
    models: ['gpt-4', 'gpt-4-turbo'],
    successOnly: true,
  },
});

// Train a smaller model to match GPT-4 behavior
fs.writeFileSync('gpt4_examples.json', JSON.stringify(gpt4Examples));
```

### 6. Continuous Export Pipeline

```typescript
async function exportNewTraces() {
  const newTraces = await getTracesAfter(lastExportTime);
  
  const dataset = await streamExportToDSPy(
    newTraces.map(t => ({ trace: t })),
    {
      fieldMapping: { preset: 'completion' },
      filter: { successOnly: true },
      onProgress: (current, total) => {
        console.log(`Exported ${current}/${total} traces`);
      },
    }
  );

  // Append to existing dataset
  const existing = JSON.parse(fs.readFileSync('training_data.json', 'utf-8'));
  const combined = mergeDSPyDatasets([existing, dataset]);
  
  fs.writeFileSync('training_data.json', JSON.stringify(combined));
  console.log(`Dataset now has ${combined.stats.totalExamples} examples`);
}
```

## Loading in Python

After exporting, load in Python for DSPy training:

```python
import json
import dspy

# Load from JSON
with open('training_data.json', 'r') as f:
    data = json.load(f)

train = []
for ex in data['train']:
    # Remove internal fields
    clean_ex = {k: v for k, v in ex.items() if not k.startswith('_') and k != 'id'}
    # Create DSPy example with input fields marked
    inputs = ex.get('_dspy_inputs', ['question'])
    example = dspy.Example(**clean_ex).with_inputs(*inputs)
    train.append(example)

# Use with DSPy optimizer
from dspy.teleprompt import BootstrapFewShot

optimizer = BootstrapFewShot(metric=my_metric)
optimized_program = optimizer.compile(
    student=my_program,
    trainset=train,
)
```

Or use the generated loader:

```python
from loader import load_dataset

train, dev = load_dataset('training_data.json')
```

## Best Practices

1. **Filter for quality** - Only export traces with good scores. Garbage in = garbage out.

2. **Use appropriate presets** - Choose the preset that matches your task structure.

3. **Include metadata** - Enable `includeMetadata` for debugging and analysis.

4. **Split train/dev** - Use `trainSplit` to create validation sets.

5. **Validate before training** - Use `validateDSPyDataset()` to catch issues.

6. **Version your datasets** - Include timestamps and metadata for reproducibility.

7. **Incrementally export** - Use `streamExportToDSPy` for continuous pipelines.

## Related

- [SDK Reference](../sdk.md) - Full SDK API reference
- [A/B Testing](./ab-testing.md) - Run experiments and export winner traces
- [Scorers](../scorers.md) - Score traces before export
- [Test Suites](../test-suites.md) - Generate traces from test runs
