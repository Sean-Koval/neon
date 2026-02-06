# Breakpoint Definition API

Neon's Breakpoint API allows you to define inspection points in agent traces for debugging, logging, and analysis. Similar to debugger breakpoints in an IDE, trace breakpoints trigger actions when specific conditions are met during trace processing.

## Overview

Breakpoints enable:

1. **Conditional triggering** - Match spans by type, name, status, attributes, or custom predicates
2. **Lifecycle hooks** - Trigger on span entry, exit, or error
3. **Flexible actions** - Log, capture, notify, or run custom handlers
4. **Hit conditions** - Fire on specific occurrences (every N times, after N hits, etc.)

## Quick Start

```typescript
import {
  defineBreakpoint,
  onSpanType,
  onError,
  and,
  getBreakpointManager,
} from '@neon/sdk';

// Define a breakpoint for tool errors
const toolErrorBreakpoint = defineBreakpoint({
  name: 'tool-errors',
  matcher: and(onSpanType('tool'), onError()),
  trigger: 'onExit',
  action: { type: 'log', message: 'Tool failed: {{span.toolName}}' },
});

// Register with the global manager
const manager = getBreakpointManager();
manager.register(toolErrorBreakpoint);

// During trace processing
await manager.evaluate(span, trace, 'onExit');
```

## Core API

### defineBreakpoint()

Create a breakpoint definition.

```typescript
function defineBreakpoint(config: BreakpointConfig): Breakpoint;
```

**Configuration:**

```typescript
interface BreakpointConfig {
  /** Unique identifier (auto-generated if not provided) */
  id?: string;

  /** Human-readable name */
  name?: string;

  /** Description of what this breakpoint catches */
  description?: string;

  /** Whether the breakpoint is enabled (default: true) */
  enabled?: boolean;

  /** Criteria for matching spans */
  matcher: SpanMatcher;

  /** When to trigger: 'onEnter', 'onExit', or 'onError' (default: 'onExit') */
  trigger?: BreakpointTrigger | BreakpointTrigger[];

  /** Action to perform when triggered */
  action?: BreakpointAction;

  /** Condition for when to actually fire based on hit count */
  hitCondition?: HitCondition;
}
```

**Example:**

```typescript
const bp = defineBreakpoint({
  name: 'slow-generations',
  description: 'Alert on LLM calls taking over 5 seconds',
  matcher: {
    spanType: 'generation',
    condition: (span) => span.durationMs > 5000,
  },
  trigger: 'onExit',
  action: {
    type: 'notify',
    handler: async (ctx) => {
      await sendSlackAlert(`Slow LLM call: ${ctx.span.durationMs}ms`);
    },
  },
});
```

## Matchers

Matchers define which spans trigger the breakpoint.

### SpanMatcher Interface

```typescript
interface SpanMatcher {
  /** Match by span type */
  spanType?: SpanType | SpanType[];

  /** Match by component type */
  componentType?: ComponentType | ComponentType[];

  /** Match by span name (exact string or RegExp) */
  name?: string | RegExp;

  /** Match by span name using glob pattern (*, ?, **) */
  nameGlob?: string;

  /** Match by span status */
  status?: SpanStatus | SpanStatus[];

  /** Match by tool name (for tool spans) */
  toolName?: string | RegExp;

  /** Match by model name (for generation spans) */
  model?: string | RegExp;

  /** Match by attributes (value can be exact string or RegExp) */
  attributes?: Record<string, string | RegExp>;

  /** Custom predicate function for complex conditions */
  condition?: (span: Span) => boolean;
}
```

### Matcher Factory Functions

Convenient functions for creating common matchers:

```typescript
import {
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
} from '@neon/sdk';

// By span type
onSpanType('generation')           // Single type
onSpanType(['tool', 'generation']) // Multiple types

// By component type
onComponentType('reasoning')
onComponentType(['planning', 'reasoning'])

// By span name
onSpanName('process-query')        // Exact match
onSpanName(/process-.+/)           // RegExp match

// By glob pattern
onSpanNameGlob('process-*')        // Matches process-query, process-data
onSpanNameGlob('**/tool-*')        // Matches nested tool spans

// By tool name
onTool('get_weather')              // Exact match
onTool(/^get_/)                    // Tools starting with "get_"

// By model
onModel('gpt-4')
onModel(/claude-3/)

// By status
onError()                          // Errored spans only
onSuccess()                        // Successful spans only

// By attribute
onAttribute('env', 'production')
onAttribute('request_id', /^req-/)

// Custom condition
onCondition((span) => span.totalTokens! > 1000)
```

### Matcher Combinators

Combine matchers with boolean logic:

```typescript
import { and, or, not } from '@neon/sdk';

// AND - all matchers must match
and(onSpanType('tool'), onError())  // Tool spans that errored

// OR - any matcher must match
or(onSpanType('tool'), onSpanType('generation'))  // Tools or generations

// NOT - negate a matcher
not(onError())  // Successful spans only

// Complex combinations
and(
  onSpanType('generation'),
  or(
    onModel('gpt-4'),
    onModel('claude-3')
  ),
  not(onError())
)  // Successful GPT-4 or Claude-3 generations
```

## Triggers

When during the span lifecycle to fire the breakpoint:

| Trigger | Description |
|---------|-------------|
| `onEnter` | When span starts |
| `onExit` | When span completes (success or error) |
| `onError` | Only when span errors |

Multiple triggers:

```typescript
defineBreakpoint({
  name: 'span-lifecycle',
  matcher: onSpanType('tool'),
  trigger: ['onEnter', 'onExit'],  // Fire on both entry and exit
  action: { type: 'log' },
});
```

## Actions

What to do when a breakpoint triggers.

### Log Action

Log to console with optional template interpolation:

```typescript
action: { 
  type: 'log', 
  message: 'Tool {{span.toolName}} failed: {{span.statusMessage}}',
  level: 'error'  // 'debug' | 'info' | 'warn' | 'error'
}
```

Template variables:
- `{{span.fieldName}}` - Any span field
- `{{trace.fieldName}}` - Any trace field
- `{{hitCount}}` - Number of times this breakpoint has fired
- `{{trigger}}` - The trigger event ('onEnter', 'onExit', 'onError')

### Notify Action

Execute a custom handler:

```typescript
action: {
  type: 'notify',
  handler: async (context) => {
    await sendAlert({
      message: `Error in ${context.span.name}`,
      severity: 'high',
      traceId: context.trace.traceId,
    });
  }
}
```

The handler receives a `BreakpointContext`:

```typescript
interface BreakpointContext {
  span: Span;              // The span that triggered
  trace: Trace;            // The containing trace
  breakpoint: Breakpoint;  // The breakpoint definition
  hitCount: number;        // Times this breakpoint has fired
  timestamp: Date;         // When triggered
  trigger: BreakpointTrigger;  // Which trigger fired
}
```

### Capture Action

Store triggered contexts for later analysis:

```typescript
action: { type: 'capture' }

// Later, retrieve captured contexts
const manager = getBreakpointManager();
const captured = manager.getCaptured(breakpoint.id);
for (const ctx of captured) {
  console.log(ctx.span.name, ctx.hitCount);
}
```

You can also provide a custom store:

```typescript
const myStore = new Map<string, BreakpointContext[]>();

action: { type: 'capture', store: myStore }
```

### Custom Action

Full control with a custom handler:

```typescript
action: {
  type: 'custom',
  handler: async (context) => {
    // Do anything
    await recordMetric('breakpoint.hit', {
      name: context.breakpoint.name,
      spanType: context.span.spanType,
    });
  }
}
```

## Hit Conditions

Control when a breakpoint actually fires:

```typescript
// Fire every time (default)
hitCondition: 'always'

// Fire only on the 5th hit
hitCondition: 5

// Fire every 10 hits
hitCondition: { every: 10 }

// Fire after 5 hits (starting from the 6th)
hitCondition: { after: 5 }

// Fire until 10 hits, then disable
hitCondition: { until: 10 }
```

## BreakpointManager

The manager handles registration and evaluation of breakpoints.

### Basic Usage

```typescript
import { getBreakpointManager, BreakpointManager } from '@neon/sdk';

// Get the global singleton
const manager = getBreakpointManager();

// Or create your own instance
const myManager = new BreakpointManager();
```

### Manager Methods

```typescript
// Registration
manager.register(breakpoint);
manager.registerAll([bp1, bp2, bp3]);
manager.unregister(breakpointId);

// Enable/disable
manager.enable(breakpointId);
manager.disable(breakpointId);

// Retrieval
manager.get(breakpointId);           // Get by ID
manager.getAll();                     // All breakpoints
manager.getEnabled();                 // Only enabled ones

// Evaluation
const fired = await manager.evaluate(span, trace, 'onExit');

// Hit counts
manager.getHitCount(breakpointId);
manager.resetHitCounts();

// Captured contexts
manager.getCaptured(breakpointId);
manager.clearCaptured(breakpointId);  // Clear for specific breakpoint
manager.clearCaptured();               // Clear all

// Cleanup
manager.clear();  // Remove all breakpoints
```

### Evaluating Span Trees

Evaluate all spans in a tree:

```typescript
import { evaluateBreakpoints } from '@neon/sdk';

const results = await evaluateBreakpoints(spans, trace, 'onExit');

// results is Map<spanId, Breakpoint[]>
for (const [spanId, firedBreakpoints] of results) {
  console.log(`Span ${spanId}: ${firedBreakpoints.length} breakpoints fired`);
}
```

## Convenience Functions

Quick registration without explicit manager access:

```typescript
import { addBreakpoint, removeBreakpoint } from '@neon/sdk';

// Define and register in one step
const bp = addBreakpoint({
  name: 'my-breakpoint',
  matcher: onError(),
  action: { type: 'log' },
});

// Remove later
removeBreakpoint(bp.id);
```

## Use Cases

### 1. Error Debugging

Capture all errors with context:

```typescript
addBreakpoint({
  name: 'all-errors',
  matcher: onError(),
  action: {
    type: 'notify',
    handler: async (ctx) => {
      console.error('Error in span:', {
        name: ctx.span.name,
        type: ctx.span.spanType,
        error: ctx.span.statusMessage,
        attributes: ctx.span.attributes,
      });
    },
  },
});
```

### 2. Performance Monitoring

Alert on slow operations:

```typescript
addBreakpoint({
  name: 'slow-tools',
  matcher: {
    spanType: 'tool',
    condition: (span) => span.durationMs > 10000,
  },
  action: {
    type: 'notify',
    handler: async (ctx) => {
      await recordMetric('slow_tool', {
        tool: ctx.span.toolName,
        duration: ctx.span.durationMs,
      });
    },
  },
});
```

### 3. Cost Tracking

Track expensive LLM calls:

```typescript
addBreakpoint({
  name: 'expensive-llm-calls',
  matcher: {
    spanType: 'generation',
    condition: (span) => (span.totalTokens ?? 0) > 10000,
  },
  trigger: 'onExit',
  action: {
    type: 'notify',
    handler: (ctx) => {
      console.warn(
        `Large generation: ${ctx.span.totalTokens} tokens, ` +
        `model: ${ctx.span.model}`
      );
    },
  },
});
```

### 4. Specific Tool Errors

Target errors in specific tools:

```typescript
addBreakpoint({
  name: 'database-errors',
  matcher: and(
    onTool(/db_|database_/),
    onError()
  ),
  action: {
    type: 'notify',
    handler: async (ctx) => {
      await pagerDutyAlert({
        service: 'database',
        message: ctx.span.statusMessage,
        traceId: ctx.trace.traceId,
      });
    },
  },
});
```

### 5. Sampling

Capture every 10th request for analysis:

```typescript
addBreakpoint({
  name: 'sample-requests',
  matcher: onSpanType('span'),
  hitCondition: { every: 10 },
  action: { type: 'capture' },
});

// Later, analyze samples
const samples = getBreakpointManager().getCaptured('sample-requests');
analyzeSamples(samples);
```

### 6. Model Comparison

Track different model behaviors:

```typescript
const models = ['gpt-4', 'gpt-4-turbo', 'claude-3-opus'];

for (const model of models) {
  addBreakpoint({
    name: `${model}-generations`,
    matcher: and(
      onSpanType('generation'),
      onModel(model)
    ),
    action: {
      type: 'notify',
      handler: (ctx) => {
        recordModelMetric(model, {
          duration: ctx.span.durationMs,
          tokens: ctx.span.totalTokens,
          success: ctx.span.status === 'ok',
        });
      },
    },
  });
}
```

### 7. Testing Breakpoints

Use capture action for testing:

```typescript
import { BreakpointManager, defineBreakpoint, onError } from '@neon/sdk';

describe('Error Handling', () => {
  let manager: BreakpointManager;

  beforeEach(() => {
    manager = new BreakpointManager();
    manager.register(defineBreakpoint({
      name: 'error-capture',
      matcher: onError(),
      action: { type: 'capture' },
    }));
  });

  test('should handle API errors gracefully', async () => {
    const trace = await runAgent(errorInput);
    
    for (const span of flattenSpans(trace.spans)) {
      await manager.evaluate(span, trace.trace, 'onExit');
    }

    const errors = manager.getCaptured('error-capture');
    expect(errors).toHaveLength(1);
    expect(errors[0].span.statusMessage).toContain('API error');
  });
});
```

## Best Practices

1. **Use descriptive names** - Make it easy to identify what each breakpoint catches.

2. **Be specific with matchers** - Overly broad matchers can create noise. Use combinators to target exactly what you need.

3. **Use hit conditions wisely** - For high-traffic spans, use sampling to avoid overwhelming your logging/alerting.

4. **Keep handlers fast** - Async handlers block the evaluation pipeline. For expensive operations, queue work for background processing.

5. **Clean up in tests** - Use `resetBreakpointManager()` or create isolated managers for tests.

6. **Combine with patterns** - Use breakpoints with the [Failure Pattern Detection](./failure-patterns.md) feature to debug specific patterns.

## Related

- [Failure Patterns](./failure-patterns.md) - Detect recurring failure patterns
- [Test Suites](../test-suites.md) - Use breakpoints in test assertions
- [Tracing](../sdk.md) - Trace data structure reference
