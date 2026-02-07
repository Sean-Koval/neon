# A/B Testing Framework

Neon's A/B Testing Framework enables rigorous comparison of agent variants with statistical analysis. Compare different models, prompts, temperatures, or any configuration to make data-driven decisions about which version to ship.

## Overview

The framework provides:

1. **Experiment definition** - Define control/treatment variants with configuration
2. **Parallel execution** - Run test suites against multiple variants efficiently
3. **Statistical analysis** - t-tests, Welch's test, Mann-Whitney U, bootstrap CI
4. **Effect size calculation** - Cohen's d and Cliff's delta
5. **Hypothesis testing** - Verify specific improvement claims
6. **Actionable conclusions** - Get ship/keep/continue recommendations

## Quick Start

```typescript
import {
  defineExperiment,
  defineVariant,
  runExperiment,
} from '@neon/sdk';

// Define variants
const control = defineVariant({
  id: 'gpt4',
  name: 'GPT-4',
  type: 'control',
  config: { model: 'gpt-4' },
});

const treatment = defineVariant({
  id: 'gpt4-turbo',
  name: 'GPT-4 Turbo',
  type: 'treatment',
  config: { model: 'gpt-4-turbo' },
});

// Define experiment
const experiment = defineExperiment({
  name: 'Model Comparison',
  description: 'Compare GPT-4 vs GPT-4 Turbo on response quality',
  variants: [control, treatment],
  suite: myTestSuite,
  primaryMetric: 'response_quality',
  secondaryMetrics: ['latency', 'token_efficiency'],
});

// Run experiment
const result = await runExperiment(experiment, {
  runsPerVariant: 100,
  agent: async (input, variant) => {
    const response = await myAgent.invoke(input, variant.config);
    return { output: response.text };
  },
});

// Check results
console.log(result.conclusion.summary);
// "GPT-4 Turbo outperforms GPT-4 with medium effect size"

if (result.conclusion.recommendation === 'ship_treatment') {
  console.log('Safe to ship!');
}
```

## Defining Variants

### defineVariant()

Create a variant configuration.

```typescript
import { defineVariant } from '@neon/sdk';

const variant = defineVariant({
  id: 'variant-1',
  name: 'Verbose Prompts',
  type: 'treatment',  // 'control' or 'treatment'
  description: 'Uses more detailed system prompts',
  config: {
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant. Be thorough and detailed.',
    temperature: 0.7,
  },
});
```

### Variant Configuration

```typescript
interface VariantConfig {
  /** Agent ID or version */
  agentId?: string;
  /** Agent version */
  agentVersion?: string;
  /** Model to use */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Temperature setting */
  temperature?: number;
  /** Maximum tokens */
  maxTokens?: number;
  /** Custom parameters */
  parameters?: Record<string, unknown>;
}
```

## Defining Experiments

### defineExperiment()

Create an experiment configuration.

```typescript
const experiment = defineExperiment({
  // Required
  name: 'Prompt Optimization',
  variants: [control, treatment],
  suite: myTestSuite,
  primaryMetric: 'accuracy',

  // Optional
  id: 'exp-prompt-opt-001',
  description: 'Test new concise prompt format',
  secondaryMetrics: ['latency', 'cost'],
  hypotheses: [{
    metric: 'accuracy',
    direction: 'increase',
    minimumEffect: 0.05,
    description: 'New prompt improves accuracy by at least 5%',
  }],
  statisticalConfig: {
    alpha: 0.05,
    power: 0.8,
    test: 'welch',
    multipleComparisonCorrection: 'holm',
  },
  metadata: {
    author: 'data-team',
    jiraTicket: 'AGENT-123',
  },
});
```

### Hypothesis Definition

Define specific claims to test:

```typescript
interface Hypothesis {
  /** Metric to measure */
  metric: string;
  /** Expected direction: 'increase', 'decrease', or 'no_change' */
  direction: 'increase' | 'decrease' | 'no_change';
  /** Minimum effect size to consider meaningful (optional) */
  minimumEffect?: number;
  /** Description of the hypothesis */
  description?: string;
}
```

Example hypotheses:

```typescript
hypotheses: [
  {
    metric: 'accuracy',
    direction: 'increase',
    minimumEffect: 0.1,
    description: 'Treatment improves accuracy by at least 10%',
  },
  {
    metric: 'latency',
    direction: 'decrease',
    description: 'Treatment reduces latency',
  },
  {
    metric: 'cost_per_query',
    direction: 'no_change',
    minimumEffect: 0.05,
    description: 'Cost remains within 5% of control',
  },
]
```

### Statistical Configuration

```typescript
interface StatisticalConfig {
  /** Significance level (alpha), default 0.05 */
  alpha?: number;
  /** Statistical power (1 - beta), default 0.8 */
  power?: number;
  /** Minimum sample size per variant */
  minSampleSize?: number;
  /** Maximum sample size per variant */
  maxSampleSize?: number;
  /** Statistical test to use */
  test?: 'ttest' | 'welch' | 'mannwhitney' | 'bootstrap';
  /** Multiple comparison correction */
  multipleComparisonCorrection?: 'bonferroni' | 'holm' | 'none';
}
```

## Running Experiments

### runExperiment()

Execute the experiment and get results.

```typescript
const result = await runExperiment(experiment, {
  // Number of times to run the suite per variant
  runsPerVariant: 100,

  // Run variants in parallel (default: false)
  parallel: true,
  maxConcurrency: 10,

  // Agent executor function
  agent: async (input, variant) => {
    const response = await myAgent.invoke(input, {
      model: variant.config.model,
      systemPrompt: variant.config.systemPrompt,
    });
    return {
      output: response.text,
      toolCalls: response.tools,
      traceId: response.traceId,
    };
  },

  // Progress callback
  onProgress: (progress) => {
    console.log(`${progress.percentComplete}% complete`);
    console.log(`Current variant: ${progress.currentVariant.name}`);
  },

  // Additional scorers
  scorers: {
    custom_metric: myCustomScorer,
  },

  // Reproducible randomness (optional)
  rng: createRng(42),
});
```

## Understanding Results

### ExperimentResult Structure

```typescript
interface ExperimentResult {
  experiment: Experiment;              // The experiment config
  variantResults: VariantResult[];     // Results per variant
  comparison: ComparisonResult;        // Statistical comparison
  conclusion: ExperimentConclusion;    // Overall conclusion
  executionMetadata: ExperimentExecutionMetadata;
}
```

### Variant Results

```typescript
interface VariantResult {
  variant: Variant;
  suiteResult: SuiteResult;
  metrics: Record<string, MetricSummary>;
  sampleSize: number;
}

interface MetricSummary {
  name: string;
  mean: number;
  stdDev: number;
  median: number;
  min: number;
  max: number;
  count: number;
  confidenceInterval: ConfidenceInterval;
  percentiles?: { p5, p25, p75, p95 };
}
```

### Comparison Results

```typescript
interface ComparisonResult {
  control: Variant;
  treatment: Variant;
  primaryMetric: MetricComparison;
  secondaryMetrics: MetricComparison[];
  hypothesisResults?: HypothesisResult[];
}

interface MetricComparison {
  metric: string;
  controlMean: number;
  treatmentMean: number;
  absoluteDiff: number;           // treatment - control
  relativeDiff: number;           // percentage change
  significance: StatisticalSignificance;
  effectSize: EffectSize;
  diffConfidenceInterval: ConfidenceInterval;
}
```

### Statistical Significance

```typescript
interface StatisticalSignificance {
  pValue: number;
  isSignificant: boolean;  // pValue < alpha
  alpha: number;
  testUsed: 'ttest' | 'welch' | 'mannwhitney' | 'bootstrap';
  testStatistic: number;
}
```

### Effect Size

```typescript
interface EffectSize {
  cohensD: number;
  magnitude: 'negligible' | 'small' | 'medium' | 'large';
  cliffsDelta?: number;  // For non-parametric comparison
}
```

Effect size interpretation (Cohen's d):
- `negligible`: |d| < 0.2
- `small`: 0.2 <= |d| < 0.5
- `medium`: 0.5 <= |d| < 0.8
- `large`: |d| >= 0.8

### Experiment Conclusion

```typescript
interface ExperimentConclusion {
  winner: Variant | null;  // null if inconclusive
  confidence: 'high' | 'medium' | 'low' | 'inconclusive';
  summary: string;
  recommendation: 'ship_treatment' | 'keep_control' | 'continue_experiment' | 'redesign';
  rationale: string[];
}
```

## Statistical Tests

### Welch's t-test (Default)

Best for most cases. Handles unequal variances.

```typescript
statisticalConfig: {
  test: 'welch',
}
```

### Student's t-test

Use when variances are known to be equal.

```typescript
statisticalConfig: {
  test: 'ttest',
}
```

### Mann-Whitney U Test

Non-parametric alternative. Good for non-normal distributions.

```typescript
statisticalConfig: {
  test: 'mannwhitney',
}
```

### Bootstrap

Resampling-based confidence intervals. Best for small samples or unknown distributions.

```typescript
statisticalConfig: {
  test: 'bootstrap',
}
```

## Multiple Comparison Correction

When testing multiple metrics, p-values need adjustment:

### Holm-Bonferroni (Default)

Less conservative than Bonferroni while still controlling family-wise error rate.

```typescript
statisticalConfig: {
  multipleComparisonCorrection: 'holm',
}
```

### Bonferroni

Most conservative. Use when you need strict error control.

```typescript
statisticalConfig: {
  multipleComparisonCorrection: 'bonferroni',
}
```

### None

No correction. Use only for exploratory analysis.

```typescript
statisticalConfig: {
  multipleComparisonCorrection: 'none',
}
```

## Reproducibility

For reproducible experiments, use seeded random number generators:

```typescript
import { createRng, setDefaultSeed } from '@neon/sdk';

// Create a seeded RNG
const rng = createRng(42);

const result = await runExperiment(experiment, {
  runsPerVariant: 100,
  rng,
  // ... other options
});

// Reset for another run with same sequence
rng.reset();

// Or set global default seed
setDefaultSeed(42);
```

## Use Cases

### 1. Model Comparison

Compare different LLM models:

```typescript
const control = defineVariant({
  id: 'gpt-4',
  name: 'GPT-4',
  type: 'control',
  config: { model: 'gpt-4' },
});

const treatment = defineVariant({
  id: 'claude-3',
  name: 'Claude 3',
  type: 'treatment',
  config: { model: 'claude-3-opus-20240229' },
});

const experiment = defineExperiment({
  name: 'GPT-4 vs Claude 3',
  variants: [control, treatment],
  suite: qualitySuite,
  primaryMetric: 'quality_score',
  secondaryMetrics: ['latency', 'cost'],
  hypotheses: [{
    metric: 'quality_score',
    direction: 'increase',
    description: 'Claude 3 produces higher quality responses',
  }],
});
```

### 2. Prompt Optimization

Test different prompt strategies:

```typescript
const control = defineVariant({
  id: 'baseline',
  name: 'Baseline Prompt',
  type: 'control',
  config: {
    systemPrompt: 'You are a helpful assistant.',
  },
});

const treatment = defineVariant({
  id: 'chain-of-thought',
  name: 'Chain of Thought',
  type: 'treatment',
  config: {
    systemPrompt: `You are a helpful assistant. 
    Think step by step before providing your final answer.
    Show your reasoning.`,
  },
});
```

### 3. Temperature Tuning

Find optimal temperature:

```typescript
const variants = [0.0, 0.3, 0.5, 0.7, 1.0].map((temp, i) =>
  defineVariant({
    id: `temp-${temp}`,
    name: `Temperature ${temp}`,
    type: i === 0 ? 'control' : 'treatment',
    config: { temperature: temp },
  })
);

// Run pairwise experiments or use multi-variant analysis
```

### 4. Tool Configuration

Compare tool strategies:

```typescript
const control = defineVariant({
  id: 'all-tools',
  name: 'All Tools Enabled',
  type: 'control',
  config: {
    parameters: { tools: ['search', 'calculator', 'code_exec'] },
  },
});

const treatment = defineVariant({
  id: 'minimal-tools',
  name: 'Minimal Tools',
  type: 'treatment',
  config: {
    parameters: { tools: ['search'] },
  },
});
```

### 5. Cost vs Quality Tradeoff

Analyze cost-effectiveness:

```typescript
const experiment = defineExperiment({
  name: 'Cost Optimization',
  variants: [gpt4, gpt35Turbo],
  suite: costQualitySuite,
  primaryMetric: 'quality_score',
  secondaryMetrics: ['cost_per_query', 'latency'],
  hypotheses: [
    {
      metric: 'quality_score',
      direction: 'no_change',
      minimumEffect: 0.1,
      description: 'GPT-3.5 maintains within 10% of GPT-4 quality',
    },
    {
      metric: 'cost_per_query',
      direction: 'decrease',
      description: 'GPT-3.5 reduces cost',
    },
  ],
});
```

## Best Practices

1. **Define clear hypotheses** - Know what you're testing before you start.

2. **Choose appropriate sample sizes** - More runs = more statistical power. Start with at least 30 per variant.

3. **Use the right test** - Welch's test is the safe default. Use Mann-Whitney for non-normal data.

4. **Correct for multiple comparisons** - Always use Holm when testing multiple metrics.

5. **Consider effect size** - Statistical significance alone isn't enough. Look at practical significance via effect size.

6. **Check confidence intervals** - Wide intervals mean uncertain estimates. Increase sample size if needed.

7. **Document everything** - Use metadata to track experiment context and decisions.

8. **Validate scorers** - Ensure your scoring functions are reliable before running experiments.

## Low-Level Statistical Functions

For custom analysis, use the underlying statistical functions:

```typescript
import {
  mean,
  stdDev,
  variance,
  median,
  percentile,
  welchTest,
  tTest,
  mannWhitneyU,
  bootstrapConfidenceInterval,
  cohensD,
  cliffsDelta,
  bonferroniCorrection,
  holmCorrection,
} from '@neon/sdk';

// Basic statistics
const values = [1, 2, 3, 4, 5];
console.log(mean(values));       // 3
console.log(stdDev(values));     // 1.58
console.log(median(values));     // 3
console.log(percentile(values, 75));  // 4

// Statistical tests
const control = [1.2, 1.4, 1.3, 1.5, 1.4];
const treatment = [1.5, 1.7, 1.6, 1.8, 1.7];

const { tStatistic, pValue, df } = welchTest(control, treatment);
console.log(`p-value: ${pValue.toFixed(4)}`);

// Effect size
const d = cohensD(control, treatment);
console.log(`Cohen's d: ${d.toFixed(2)}`);

// Bootstrap CI
const ci = bootstrapConfidenceInterval(control, treatment, 0.95, 10000);
console.log(`95% CI: [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`);
```

## Related

- [SDK Reference](../sdk.md) - Full SDK API reference
- [Test Suites](../test-suites.md) - Define test suites for experiments
- [Scorers](../scorers.md) - Create custom metrics
- [DSPy Export](./dspy-export.md) - Export winning variant traces for training
