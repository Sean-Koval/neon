# Neon Future Architecture: Technical Vision

> Technical architecture for the next generation of the Neon agent evaluation platform.
>
> **Author:** Architect Agent | **Date:** 2026-02-11 | **Status:** Draft

---

## Table of Contents

1. [Current Architecture Assessment](#1-current-architecture-assessment)
2. [Agent-Native Data Models](#2-agent-native-data-models)
3. [Real-Time Infrastructure](#3-real-time-infrastructure)
4. [Plugin & Extension System](#4-plugin--extension-system)
5. [AI-Powered Features](#5-ai-powered-features)
6. [Scale Architecture](#6-scale-architecture)
7. [Developer Experience](#7-developer-experience)
8. [Evolution Roadmap](#8-evolution-roadmap)

---

## 1. Current Architecture Assessment

### What We Have (Strengths)

Neon's current architecture is well-designed for an evaluation platform at moderate scale:

| Component | Technology | Assessment |
|-----------|-----------|------------|
| **Trace Storage** | ClickHouse (OLAP) | Excellent choice for columnar analytics on trace data |
| **Durable Execution** | Temporal | Best-in-class for long-running eval workflows |
| **API Layer** | Next.js API routes + tRPC | Type-safe, collocated with frontend |
| **Streaming** | Redpanda (Kafka-compatible) | Good for decoupling ingestion from storage |
| **Trace Ingestion** | OTel Collector | Industry standard, vendor-agnostic |
| **SDK** | TypeScript + Python | Dual-language coverage, rich scorer library |
| **Metadata** | PostgreSQL | Reliable for relational data |

**Key strengths to preserve:**
- The SDK's component-type attribution system (`ComponentType`) is forward-looking and supports compound AI systems
- Temporal workflows for A/B testing and progressive rollouts are differentiated
- The debug client (SSE-based with breakpoints) is a unique capability few competitors offer
- Training data export formats (Agent Lightning, OpenAI FT, TRL, DSPy) cover the closed-loop optimization story
- Rich scorer library (causal analysis, skill selection, trajectory, parameter accuracy) goes beyond basic eval

### Where We Need to Evolve

| Gap | Current State | Target State |
|-----|--------------|--------------|
| **Multi-agent modeling** | Flat trace/span trees with `handoff`/`delegate` span types | First-class agent graphs with typed edges and session continuity |
| **Real-time streaming** | Batch OTel collector + Kafka consumer | Sub-second streaming pipeline with live query materialization |
| **Plugin system** | Hardcoded scorers, integrations in SDK | Pluggable scorer/integration/visualization registry with sandboxed execution |
| **AI features** | Manual eval definition, basic pattern detection | Auto-generated evals, NL queries, predictive quality scoring |
| **Multi-tenancy** | Organization/workspace models exist | Full tenant isolation, resource quotas, data partitioning |
| **Agent memory** | No first-class support | Memory snapshots, knowledge graph evolution tracking |

---

## 2. Agent-Native Data Models

### 2.1 Core Abstraction Hierarchy

The current model conflates "traces" (a single execution) with broader concepts like sessions and agent graphs. We need a richer hierarchy:

```
Organization
  └── Workspace (project)
       └── Agent (definition + versions)
            └── Session (multi-turn conversation or task)
                 └── Run (single agent invocation within a session)
                      └── Trace (execution tree for one run)
                           └── Span (individual operation)
```

**Key distinctions:**
- **Session**: A persistent context across multiple runs (e.g., a multi-turn chat, a long-running task). Sessions have state, memory, and conversation history.
- **Run**: A single agent invocation — the agent receives input and produces output. A session may contain many runs.
- **Trace**: The execution tree for a single run. This is what we currently call a "trace."

### 2.2 Agent Graph Model

Multi-agent systems need first-class graph modeling rather than being flattened into span trees:

```typescript
// New: Agent Graph — models how agents connect and delegate
interface AgentGraph {
  id: string;
  projectId: string;
  name: string;
  version: string;

  // Nodes are agents (or agent roles)
  nodes: AgentNode[];

  // Edges define relationships (delegation, supervision, peer)
  edges: AgentEdge[];

  // Graph topology metadata
  topology: "hierarchical" | "mesh" | "pipeline" | "star";

  // Entry point(s) for the graph
  entryNodes: string[];
}

interface AgentNode {
  id: string;
  agentId: string;        // Reference to AgentDefinition
  role: string;           // e.g., "planner", "researcher", "coder"
  capabilities: string[]; // Skills/tools this agent has
  config?: Record<string, unknown>;
}

interface AgentEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: "delegates_to" | "supervises" | "peers_with" | "escalates_to";
  condition?: string;     // When does this edge activate?
  dataContract?: {        // What data flows along this edge
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  };
}
```

**ClickHouse schema for agent graph execution traces:**

```sql
-- Agent interactions within a trace (one row per agent-to-agent message)
CREATE TABLE neon.agent_interactions (
  trace_id        String,
  session_id      String,
  run_id          String,
  project_id      String,
  source_agent_id String,
  target_agent_id String,
  edge_type       Enum8('delegates_to'=1, 'supervises'=2, 'peers_with'=3, 'escalates_to'=4),
  message_type    Enum8('request'=1, 'response'=2, 'notification'=3, 'handoff'=4),
  payload_summary String,     -- Truncated/summarized payload
  payload_tokens  UInt32,
  timestamp       DateTime64(3),
  duration_ms     UInt32,
  status          Enum8('success'=1, 'error'=2, 'timeout'=3),
  INDEX idx_session session_id TYPE bloom_filter GRANULARITY 4,
  INDEX idx_agents (source_agent_id, target_agent_id) TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, trace_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;
```

### 2.3 Conversation Tree Model

Agent conversations are trees, not linear sequences. The model needs to capture branching, backtracking, and parallel exploration:

```typescript
interface ConversationTree {
  sessionId: string;
  rootMessageId: string;

  // All messages indexed by ID
  messages: Map<string, ConversationMessage>;

  // Active branch (which path through the tree is "current")
  activeBranch: string[];

  // Metadata
  totalTokens: number;
  totalCost: number;
  branchCount: number;
}

interface ConversationMessage {
  id: string;
  parentId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];

  // Branch metadata
  branchId: string;       // Which branch this message belongs to
  depth: number;          // Depth in the tree
  childIds: string[];     // Children (branches from this point)

  // Execution metadata
  timestamp: Date;
  model?: string;
  tokens?: { input: number; output: number };
  latencyMs?: number;

  // Annotations
  annotations?: ConversationAnnotation[];
}

interface ConversationAnnotation {
  type: "feedback" | "score" | "flag" | "note";
  value: string | number;
  author: "human" | "automated";
  timestamp: Date;
}
```

### 2.4 Memory Snapshot Model

Agent memory evolves over time. We need to track memory state for debugging and replay:

```typescript
interface MemorySnapshot {
  id: string;
  sessionId: string;
  runId: string;
  timestamp: Date;

  // Different memory types
  shortTermMemory: {
    conversationHistory: ConversationMessage[];
    workingContext: Record<string, unknown>;
  };

  longTermMemory: {
    factStore: MemoryFact[];
    entityGraph: MemoryEntity[];
    episodicMemory: MemoryEpisode[];
  };

  // Knowledge graph state (if agent uses one)
  knowledgeGraph?: {
    nodeCount: number;
    edgeCount: number;
    recentUpdates: KnowledgeGraphDelta[];
  };

  // Diff from previous snapshot
  delta?: MemoryDelta;
}

interface MemoryFact {
  key: string;
  value: string;
  confidence: number;
  source: string;           // Which run/interaction added this
  timestamp: Date;
}
```

**ClickHouse storage for memory evolution:**

```sql
CREATE TABLE neon.memory_snapshots (
  snapshot_id     String,
  session_id      String,
  run_id          String,
  project_id      String,
  agent_id        String,
  timestamp       DateTime64(3),
  memory_type     Enum8('short_term'=1, 'long_term'=2, 'episodic'=3, 'knowledge_graph'=4),
  fact_count      UInt32,
  entity_count    UInt32,
  delta_additions UInt32,
  delta_removals  UInt32,
  snapshot_hash   String,     -- For deduplication
  snapshot_data   String,     -- Compressed JSON
  INDEX idx_session session_id TYPE bloom_filter GRANULARITY 4
) ENGINE = ReplacingMergeTree(timestamp)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, session_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;
```

---

## 3. Real-Time Infrastructure

### 3.1 Streaming Architecture (Next-Gen)

The current pipeline (OTel Collector -> Redpanda -> trace-consumer -> ClickHouse) is solid for batch analytics but doesn't support real-time features well. We need a dual-path architecture:

```
                                    ┌─────────────────────┐
                                    │   Real-Time Path    │
                                    │                     │
                               ┌───►│  WebSocket Gateway  │───► Live Dashboards
                               │    │  (Sub-100ms)        │     Debug Sessions
                               │    │                     │     Alert Evaluator
SDKs ──► OTel     ──► Redpanda ┤    └─────────────────────┘
         Collector              │
                               │    ┌─────────────────────┐
                               └───►│   Analytics Path    │
                                    │                     │
                                    │  Batch Consumer     │───► ClickHouse
                                    │  (1-5s latency)     │     (OLAP analytics)
                                    │                     │
                                    └─────────────────────┘
```

**Key changes from current architecture:**

1. **WebSocket Gateway**: A new lightweight service that subscribes to Redpanda topics and fans out to connected WebSocket clients in real-time. This replaces the current SSE-based debug endpoint with a more capable bidirectional channel.

2. **Materialized Views in ClickHouse**: Use ClickHouse's built-in materialized views for pre-aggregated metrics (score trends, anomaly signals, agent health) that update as data arrives.

3. **Stream Processing**: Add lightweight stream processing (either ClickHouse Kafka engine or a dedicated Flink/Benthos job) for:
   - Real-time anomaly detection on incoming spans
   - Session assembly (grouping spans into sessions)
   - Cost tracking aggregation

### 3.2 Live Debug Architecture (Enhanced)

The current `DebugClient` uses SSE for events and HTTP POST for commands. This works but has limitations for high-frequency debugging. The evolution:

```typescript
// New: Bidirectional WebSocket debug protocol
interface DebugProtocol {
  // Client -> Server messages
  clientMessages: {
    // Session management
    "debug.attach": { traceId: string; breakpoints?: Breakpoint[] };
    "debug.detach": { traceId: string };

    // Execution control
    "debug.resume": {};
    "debug.stepOver": {};
    "debug.stepInto": {};
    "debug.stepOut": {};
    "debug.pause": {};

    // Inspection
    "debug.inspect": { spanId: string; depth?: number };
    "debug.evaluate": { expression: string; context: "span" | "trace" };
    "debug.watchExpression": { expression: string; interval?: number };

    // Breakpoint management
    "debug.setBreakpoint": { breakpoint: Breakpoint };
    "debug.removeBreakpoint": { id: string };
    "debug.setConditionalBreakpoint": { matcher: SpanMatcher; condition: string };

    // Time-travel (replay mode)
    "debug.rewind": { toSpanId: string };
    "debug.replay": { fromSpanId: string; speed: number };

    // Hot-patching (modify agent behavior mid-execution)
    "debug.patchPrompt": { spanId: string; newPrompt: string };
    "debug.patchTool": { spanId: string; mockResponse: unknown };
  };

  // Server -> Client messages
  serverMessages: {
    "debug.spanEnter": { span: Span; depth: number; context: SpanContext };
    "debug.spanExit": { span: Span; result: unknown; duration: number };
    "debug.breakpointHit": { breakpoint: Breakpoint; span: Span; stack: Span[] };
    "debug.inspectResult": { spanId: string; data: InspectionData };
    "debug.stateSnapshot": { memory: MemorySnapshot; conversationTree: ConversationTree };
    "debug.evaluateResult": { expression: string; result: unknown };
    "debug.anomalyDetected": { type: string; span: Span; details: AnomalyDetails };
  };
}
```

**New capabilities:**
- **Time-travel debugging**: Replay a trace from any point, examining state at each step
- **Expression evaluation**: Evaluate arbitrary expressions against span data (e.g., "count tool calls where latency > 1000ms")
- **Watch expressions**: Continuously evaluate expressions as the trace progresses
- **Hot-patching**: Modify prompts or mock tool responses mid-execution for experimentation
- **Anomaly alerts**: Real-time anomaly detection pushed to debug sessions

### 3.3 ClickHouse Materialized Views

Pre-aggregate common analytics queries for sub-second dashboard loads:

```sql
-- Real-time score trends (materialized from span inserts)
CREATE MATERIALIZED VIEW neon.mv_score_trends
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, agent_id, scorer_name, hour)
AS SELECT
  project_id,
  agent_id,
  scorer_name,
  toStartOfHour(timestamp) AS hour,
  avgState(score_value) AS avg_score,
  minState(score_value) AS min_score,
  maxState(score_value) AS max_score,
  countState() AS sample_count
FROM neon.scores
GROUP BY project_id, agent_id, scorer_name, hour;

-- Real-time agent health (token usage, error rates, latency)
CREATE MATERIALIZED VIEW neon.mv_agent_health
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, agent_id, minute)
AS SELECT
  project_id,
  agent_id,
  toStartOfMinute(timestamp) AS minute,
  countState() AS trace_count,
  avgState(duration_ms) AS avg_latency,
  sumState(total_input_tokens + total_output_tokens) AS total_tokens,
  sumState(total_cost_usd) AS total_cost,
  countIfState(status = 'error') AS error_count
FROM neon.traces
GROUP BY project_id, agent_id, minute;

-- Tool usage patterns (which tools called together, success rates)
CREATE MATERIALIZED VIEW neon.mv_tool_patterns
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, tool_name, day)
AS SELECT
  project_id,
  tool_name,
  toStartOfDay(timestamp) AS day,
  countState() AS call_count,
  avgState(duration_ms) AS avg_latency,
  countIfState(status = 'error') AS error_count,
  avgState(toFloat64OrZero(attributes['tool.output_tokens'])) AS avg_output_size
FROM neon.spans
WHERE span_type = 'tool'
GROUP BY project_id, tool_name, day;
```

---

## 4. Plugin & Extension System

### 4.1 Plugin Architecture

Move from hardcoded scorers and integrations to a pluggable registry:

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Registry                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Scorers     │  │ Integrations │  │ Visualizers  │      │
│  │              │  │              │  │              │      │
│  │ - Built-in   │  │ - Slack      │  │ - Flamechart │      │
│  │ - Community  │  │ - PagerDuty  │  │ - DAG View   │      │
│  │ - Custom     │  │ - GitHub     │  │ - Timeline   │      │
│  │              │  │ - Webhooks   │  │ - Custom     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Data Sources│  │  Exporters   │  │  MCP Servers │      │
│  │              │  │              │  │              │      │
│  │ - ClickHouse │  │ - S3/GCS    │  │ - Tool proxy │      │
│  │ - Postgres   │  │ - Snowflake │  │ - Resource   │      │
│  │ - Custom DB  │  │ - BigQuery  │  │   provider   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Plugin Interface

```typescript
// Core plugin interface
interface NeonPlugin {
  name: string;
  version: string;
  description: string;
  author: string;

  // Plugin type determines what hooks are available
  type: "scorer" | "integration" | "visualizer" | "data_source" | "exporter" | "mcp";

  // Lifecycle hooks
  onInstall?: (context: PluginContext) => Promise<void>;
  onUninstall?: (context: PluginContext) => Promise<void>;
  onEnable?: (context: PluginContext) => Promise<void>;
  onDisable?: (context: PluginContext) => Promise<void>;

  // Configuration schema (JSON Schema)
  configSchema?: Record<string, unknown>;
}

// Scorer plugin
interface ScorerPlugin extends NeonPlugin {
  type: "scorer";

  // The scorer implementation
  scorer: {
    /** Evaluate a single trace/span */
    evaluate(context: ScorerContext): Promise<ScoreResult>;
    /** Batch evaluation (optional optimization) */
    evaluateBatch?(contexts: ScorerContext[]): Promise<ScoreResult[]>;
    /** Whether this scorer needs LLM access */
    requiresLLM?: boolean;
    /** Estimated cost per evaluation */
    estimatedCostPerEval?: number;
  };
}

// Integration plugin (e.g., Slack notifications)
interface IntegrationPlugin extends NeonPlugin {
  type: "integration";

  // Event hooks — called when events occur in the system
  hooks: {
    onEvalComplete?: (result: EvalRunResult) => Promise<void>;
    onAnomalyDetected?: (anomaly: AnomalyEvent) => Promise<void>;
    onRegressionDetected?: (regression: RegressionEvent) => Promise<void>;
    onThresholdBreached?: (breach: ThresholdBreach) => Promise<void>;
    onAgentError?: (error: AgentError) => Promise<void>;
  };
}

// MCP Server plugin — expose Neon data to agents via MCP
interface MCPServerPlugin extends NeonPlugin {
  type: "mcp";

  // MCP tools this plugin exposes
  tools: MCPToolDefinition[];

  // MCP resources this plugin provides
  resources?: MCPResourceDefinition[];

  // Transport configuration
  transport: "stdio" | "http";
}
```

### 4.3 Plugin Execution Sandbox

Plugins must be sandboxed for security and isolation:

```typescript
// Plugin runner with sandboxing
class PluginRunner {
  // Option 1: Worker threads (Node.js) — low overhead, shared memory
  private async runInWorker(plugin: NeonPlugin, method: string, args: unknown[]): Promise<unknown> {
    const worker = new Worker(pluginPath, {
      workerData: { method, args, config: plugin.config },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,  // Memory limit
        maxYoungGenerationSizeMb: 32,
        codeRangeSizeMb: 16,
      },
    });
    // Timeout + memory limit enforcement
    return withTimeout(workerPromise(worker), plugin.timeout ?? 30000);
  }

  // Option 2: WASM (for untrusted community plugins) — strong isolation
  private async runInWasm(plugin: NeonPlugin, method: string, args: unknown[]): Promise<unknown> {
    const wasmModule = await WebAssembly.instantiate(plugin.wasmBinary, {
      env: { /* restricted API surface */ },
    });
    return wasmModule.exports[method](...args);
  }

  // Option 3: Temporal activities (for long-running plugins) — durable
  private async runAsActivity(plugin: NeonPlugin, method: string, args: unknown[]): Promise<unknown> {
    return proxyActivities({ startToCloseTimeout: "5 minutes" })[method](...args);
  }
}
```

### 4.4 MCP Integration Architecture

Neon should both **consume** MCP tools (monitoring agent MCP usage) and **expose** an MCP server (letting agents query eval data):

```typescript
// Neon as MCP Server — agents can query their own eval data
const neonMCPServer = defineMCPServer({
  name: "neon-eval-server",
  version: "1.0.0",
  tools: [
    {
      name: "get_eval_results",
      description: "Get evaluation results for an agent",
      parameters: {
        agentId: { type: "string", required: true },
        suiteId: { type: "string" },
        limit: { type: "number", default: 10 },
      },
      handler: async (params) => {
        return await clickhouse.query(`
          SELECT * FROM neon.eval_results
          WHERE agent_id = {agentId:String}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
        `);
      },
    },
    {
      name: "get_score_trends",
      description: "Get score trends over time for regression detection",
      parameters: { agentId: { type: "string" }, days: { type: "number", default: 7 } },
      handler: async (params) => { /* ... */ },
    },
    {
      name: "suggest_improvements",
      description: "Get AI-powered improvement suggestions based on recent traces",
      parameters: { traceId: { type: "string" } },
      handler: async (params) => { /* ... */ },
    },
  ],
  resources: [
    {
      uri: "neon://agents/{agentId}/health",
      name: "Agent Health Dashboard",
      description: "Current health metrics for an agent",
    },
  ],
});
```

---

## 5. AI-Powered Features

### 5.1 Auto-Generated Eval Suites from Production Traces

Convert production trace patterns into test cases automatically:

```
Production Traces ──► Pattern Mining ──► Candidate Tests ──► Human Review ──► Eval Suite
                           │
                           ├── Cluster similar traces
                           ├── Extract input/output patterns
                           ├── Identify edge cases (errors, retries, unusual paths)
                           └── Generate assertions from observed behavior
```

**Implementation using existing SDK primitives:**

```typescript
// New Temporal workflow: auto-test-case generation pipeline
async function autoTestCaseGenerationWorkflow(params: {
  projectId: string;
  agentId: string;
  timeWindow: { start: Date; end: Date };
  maxTestCases: number;
}): Promise<GeneratedTestSuite> {

  // Step 1: Query production traces from ClickHouse
  const traces = await activities.queryProductionTraces(params);

  // Step 2: Cluster traces by behavior pattern
  const clusters = await activities.clusterTracesByBehavior(traces, {
    method: "embedding_kmeans",
    k: Math.min(params.maxTestCases, 20),
  });

  // Step 3: For each cluster, generate a test case
  const testCases = [];
  for (const cluster of clusters) {
    // Pick representative trace
    const representative = cluster.centroid;

    // Use LLM to generate test case from trace
    const testCase = await activities.generateTestCaseFromTrace({
      trace: representative,
      clusterSize: cluster.members.length,
      errorRate: cluster.errorRate,
    });

    testCases.push(testCase);
  }

  // Step 4: Generate assertions from observed patterns
  for (const tc of testCases) {
    tc.assertions = await activities.generateAssertions({
      trace: tc.sourceTrace,
      patterns: tc.observedPatterns,
    });
  }

  // Step 5: Validate test cases don't have flaky assertions
  const validated = await activities.validateTestCases(testCases, {
    replayCount: 3,
    flakinessThreshold: 0.8,
  });

  return {
    suiteId: crypto.randomUUID(),
    testCases: validated,
    metadata: {
      generatedFrom: `${traces.length} production traces`,
      clusterCount: clusters.length,
      timeWindow: params.timeWindow,
    },
  };
}
```

### 5.2 AI-Assisted Root Cause Analysis (RCA)

When evaluations fail or regressions are detected, automatically analyze the root cause:

```typescript
// RCA Pipeline: Regression detected -> Trace diff -> LLM analysis -> Actionable insights
interface RootCauseAnalysis {
  regressionId: string;

  // What changed?
  traceComparison: {
    baselineTraceId: string;
    regressedTraceId: string;
    spanDiffs: SpanDiff[];           // Spans that differ between baseline and regressed
    toolCallDiffs: ToolCallDiff[];   // Different tools called
    promptDiffs: PromptDiff[];       // Prompt changes
    modelChanges: ModelChange[];     // Different models used
  };

  // Why did it fail?
  rootCause: {
    category: "prompt_regression" | "tool_failure" | "model_change" | "data_drift" | "configuration" | "unknown";
    confidence: number;
    explanation: string;           // Human-readable explanation
    evidence: Evidence[];           // Supporting data points
  };

  // What should we do?
  recommendations: {
    action: string;
    priority: "critical" | "high" | "medium" | "low";
    effort: "trivial" | "small" | "medium" | "large";
    automatable: boolean;           // Can Neon auto-fix this?
  }[];
}
```

### 5.3 Natural Language Queries Over Trace Data

Allow users to ask questions in natural language, translated to ClickHouse SQL:

```typescript
// NL Query Interface
interface NLQueryEngine {
  // Convert natural language to ClickHouse SQL
  translate(query: string, context: QueryContext): Promise<{
    sql: string;
    explanation: string;
    confidence: number;
  }>;

  // Execute and format results
  execute(query: string, context: QueryContext): Promise<{
    data: unknown[];
    visualization: VisualizationConfig;   // Auto-suggested chart type
    naturalLanguageAnswer: string;        // Human-readable answer
  }>;
}

// Example queries:
// "Show me traces where the agent used more than 5 tool calls last week"
// "What's the average latency for tool_search vs tool_compute?"
// "Find traces where the agent got stuck in a loop"
// "Compare error rates between v1.2 and v1.3 of the research agent"
```

**Implementation: Text-to-SQL with schema awareness:**

```typescript
const schemaContext = `
Tables:
  neon.traces: traceId, projectId, name, timestamp, durationMs, status, agentId, agentVersion, totalInputTokens, totalOutputTokens, totalCostUsd, toolCallCount, llmCallCount
  neon.spans: spanId, traceId, parentSpanId, name, spanType, componentType, timestamp, durationMs, status, model, inputTokens, outputTokens, toolName
  neon.scores: scoreId, traceId, name, value, reason, timestamp
  neon.agent_interactions: traceId, sessionId, sourceAgentId, targetAgentId, edgeType, messageType, timestamp
`;

async function nlToClickHouse(query: string): Promise<string> {
  const response = await llm.generate({
    system: `You are a ClickHouse SQL expert. Convert natural language queries to valid ClickHouse SQL.
Schema:
${schemaContext}

Rules:
- Always include project_id filter from context
- Use appropriate time functions (toStartOfHour, toStartOfDay)
- Limit results to 1000 rows max
- Use materialized views when available for performance`,
    user: query,
  });
  return response.sql;
}
```

### 5.4 Predictive Quality Scoring

Use historical data to predict whether a new agent version will meet quality thresholds before running full evals:

```typescript
// Predictive model trained on historical eval results
interface PredictiveScorer {
  // Given a small sample of traces, predict full eval score
  predict(params: {
    agentId: string;
    agentVersion: string;
    sampleTraces: Trace[];        // Small sample (5-10 traces)
    historicalRuns: EvalRunResult[]; // Past eval results
  }): Promise<{
    predictedScore: number;
    confidenceInterval: [number, number];
    recommendation: "proceed" | "caution" | "abort";
    reasoning: string;
  }>;

  // Anomaly prediction: will this trace fail scoring?
  predictAnomalous(trace: Trace): Promise<{
    isAnomalous: boolean;
    anomalyScore: number;           // 0-1, higher = more anomalous
    reasons: string[];
  }>;
}
```

### 5.5 Automated Prompt Optimization

Closed-loop prompt improvement using eval results as feedback:

```typescript
// Prompt optimization workflow (extends existing optimization module)
async function promptOptimizationWorkflow(params: {
  promptId: string;
  evalSuiteId: string;
  targetScore: number;
  maxIterations: number;
  strategy: "mipro" | "dspy" | "reflection" | "evolutionary";
}): Promise<PromptOptimizationResult> {
  let currentPrompt = await activities.getPrompt(params.promptId);
  let bestScore = 0;
  let bestPrompt = currentPrompt;

  for (let i = 0; i < params.maxIterations; i++) {
    // 1. Run eval suite with current prompt
    const evalResult = await executeChild(evalRunWorkflow, {
      // ... eval config using current prompt
    });

    // 2. If score improved, save as best
    if (evalResult.summary.avgScore > bestScore) {
      bestScore = evalResult.summary.avgScore;
      bestPrompt = currentPrompt;
    }

    // 3. If target reached, stop
    if (evalResult.summary.avgScore >= params.targetScore) break;

    // 4. Generate improved prompt based on failures
    currentPrompt = await activities.optimizePrompt({
      currentPrompt,
      evalResult,
      failedCases: evalResult.results.filter(r => !r.passed),
      strategy: params.strategy,
    });
  }

  return { bestPrompt, bestScore, iterations: i + 1 };
}
```

---

## 6. Scale Architecture

### 6.1 Multi-Tenant Data Isolation

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway / Load Balancer                │
│              (Rate limiting, tenant routing)                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
┌───┴──────┐             ┌──────┴───┐
│  Tier 1  │             │  Tier 2  │
│ (Shared) │             │(Isolated)│
│          │             │          │
│ Shared   │             │ Dedicated│
│ ClickHouse│            │ ClickHouse│
│ cluster  │             │ instance │
│          │             │          │
│ Row-level│             │ Full     │
│ isolation│             │ isolation│
└──────────┘             └──────────┘
```

**ClickHouse multi-tenancy strategy:**

```sql
-- Option A: Row-level isolation (shared cluster, partition by tenant)
-- All tables partitioned by project_id
CREATE TABLE neon.traces (
  -- ... columns ...
) ENGINE = MergeTree()
PARTITION BY (project_id, toYYYYMM(timestamp))
ORDER BY (project_id, timestamp, trace_id)
SETTINGS index_granularity = 8192;

-- Row-level access control via query rewriting
-- API layer ALWAYS injects: WHERE project_id = {tenant_project_id}

-- Resource quotas per tenant
CREATE TABLE neon.tenant_quotas (
  project_id       String,
  max_traces_per_day UInt64,
  max_spans_per_trace UInt32,
  max_storage_gb   Float64,
  max_query_concurrency UInt32,
  retention_days   UInt16,
  PRIMARY KEY (project_id)
) ENGINE = ReplacingMergeTree();
```

### 6.2 Global Deployment (Edge Trace Collection)

For latency-sensitive trace collection, deploy lightweight collectors at the edge:

```
                    ┌──────────────────┐
                    │  Edge Collector  │ (us-east)
SDKs ──────────────►│  (OTel + Buffer) │
  (US East)         │                  │──────┐
                    └──────────────────┘      │
                                              │    ┌──────────────────┐
                    ┌──────────────────┐      ├───►│  Central Region  │
                    │  Edge Collector  │      │    │                  │
SDKs ──────────────►│  (OTel + Buffer) │──────┤    │  Redpanda        │
  (EU West)         │                  │      │    │  ClickHouse      │
                    └──────────────────┘      │    │  Temporal        │
                                              │    │  PostgreSQL      │
                    ┌──────────────────┐      │    │  Next.js         │
                    │  Edge Collector  │      │    └──────────────────┘
SDKs ──────────────►│  (OTel + Buffer) │──────┘
  (Asia Pacific)    │                  │
                    └──────────────────┘
```

**Edge collector characteristics:**
- Stateless OTel Collector with local disk buffer (for network interruptions)
- Compression (lz4/snappy) before forwarding
- Sampling decisions at the edge (tail-based sampling)
- Regional DNS routing (anycast or latency-based)

### 6.3 Data Retention & Archival

```sql
-- Hot tier: Recent data in ClickHouse (fast queries)
-- 90-day TTL on primary tables

-- Warm tier: Compressed older data (slower queries, lower cost)
ALTER TABLE neon.traces
  MODIFY TTL
    timestamp + INTERVAL 90 DAY TO VOLUME 'warm',     -- Move to cold storage
    timestamp + INTERVAL 365 DAY DELETE;                -- Delete after 1 year

-- Cold tier: S3/GCS for long-term archival
-- Use ClickHouse S3 table function for ad-hoc queries on archived data
CREATE TABLE neon.traces_archive
ENGINE = S3('https://s3.amazonaws.com/neon-traces-archive/{_partition_id}/', 'Parquet')
AS SELECT * FROM neon.traces WHERE timestamp < now() - INTERVAL 90 DAY;
```

### 6.4 Horizontal Scaling Strategy

| Component | Scaling Strategy | Target |
|-----------|-----------------|--------|
| **ClickHouse** | Horizontal sharding by `project_id`, replicas for read scaling | 1B+ traces/day, sub-second p99 queries |
| **Temporal** | Multi-cluster with namespace isolation per tenant tier | 100K+ concurrent workflows |
| **Redpanda** | Partition by `project_id`, add brokers for throughput | 1M+ spans/second ingestion |
| **PostgreSQL** | Read replicas, eventual consistency for non-critical reads | 10K+ concurrent connections |
| **Next.js** | Horizontal pod scaling behind load balancer, Edge Runtime for API routes | 100K+ RPM |
| **OTel Collectors** | StatefulSet with HPA based on queue depth | Auto-scale with ingestion volume |

---

## 7. Developer Experience

### 7.1 SDK Design Principles

The current SDK is already well-structured. Extend with these principles:

**1. Zero-Config Start**
```typescript
// Current (already good):
import { Neon, defineTest, defineSuite, exactMatch } from '@neon/sdk';
const neon = new Neon();  // Auto-discovers NEON_API_KEY

// Evolution: auto-instrument popular frameworks
import { neon } from '@neon/sdk/auto';
// Automatically instruments: OpenAI, Anthropic, LangChain, CrewAI, Autogen
// No code changes needed — monkey-patches client libraries
```

**2. Progressive Disclosure**
```typescript
// Level 1: Simple test
const suite = defineSuite({
  name: 'basic',
  tests: [
    { name: 'hello', input: { query: 'Hello' }, expected: { outputContains: ['Hi'] } }
  ],
});

// Level 2: Custom scorers
const suite = defineSuite({
  name: 'advanced',
  scorers: { quality: llmJudge({ prompt: '...' }) },
  tests: [/* ... */],
});

// Level 3: A/B experiments
const experiment = defineExperiment({
  name: 'prompt-v2',
  variants: [control({ prompt: v1 }), treatment({ prompt: v2 })],
  metrics: ['quality', 'latency', 'cost'],
  statisticalConfig: { test: 'welch', alpha: 0.05 },
});

// Level 4: Full optimization loop
const optimization = defineOptimization({
  target: 'quality',
  strategy: 'evolutionary',
  constraints: { maxCost: 0.01, maxLatency: 5000 },
});
```

**3. Framework Integrations**
```typescript
// Auto-instrumentation for popular frameworks
import { withNeon } from '@neon/sdk/integrations/langchain';
import { withNeon } from '@neon/sdk/integrations/crewai';
import { withNeon } from '@neon/sdk/integrations/autogen';
import { withNeon } from '@neon/sdk/integrations/openai-agents';

// Wrap existing agent — traces flow automatically
const agent = withNeon(myLangChainAgent, { projectId: '...' });
```

### 7.2 CLI-First Workflows

```bash
# Init project with auto-detection
neon init                          # Detects framework, generates config

# Run evals locally (no server needed)
neon eval run --local              # Uses local ClickHouse or SQLite fallback

# Interactive debugging
neon debug attach <trace-id>       # Attach to running trace
neon debug replay <trace-id>       # Replay historical trace

# Prompt management
neon prompt list                   # List prompt versions
neon prompt diff v1 v2             # Diff prompt versions
neon prompt optimize --target 0.9  # Auto-optimize prompt

# A/B testing
neon experiment create --name "new-prompt" --variants v1,v2
neon experiment status <id>        # Live progress
neon experiment results <id>       # Final analysis

# CI/CD
neon ci report --format github     # GitHub Actions summary
neon ci gate --min-score 0.8       # Pass/fail gate
```

### 7.3 IDE Integration (VS Code Extension)

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension: Neon Agent Eval                          │
│                                                              │
│  Features:                                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Inline Test Results                                    │  │
│  │  - Show pass/fail next to defineTest() calls           │  │
│  │  - Hover for score details                             │  │
│  │  - Click to view trace in browser                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Prompt Editor                                          │  │
│  │  - Side-by-side prompt version comparison              │  │
│  │  - Variable highlighting and validation                │  │
│  │  - "Run eval" button on prompt files                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Trace Explorer Panel                                   │  │
│  │  - Tree view of spans                                  │  │
│  │  - Flamechart visualization                            │  │
│  │  - Search traces by natural language                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Debug Adapter Protocol (DAP) Integration               │  │
│  │  - Set breakpoints on span types                       │  │
│  │  - Step through agent execution                        │  │
│  │  - Inspect memory/state at each step                   │  │
│  │  - Use VS Code's built-in debug UI                     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 Local-First Development

Enable offline eval running without any server infrastructure:

```typescript
// Local mode: embedded ClickHouse (chdb) + SQLite metadata
import { Neon } from '@neon/sdk';

const neon = new Neon({
  mode: 'local',  // No server needed
  // Uses chdb (embedded ClickHouse) for trace storage
  // Uses SQLite for metadata
  // All data in .neon/ directory
});

// Same API as cloud mode
const result = await neon.eval.runSuite(suite);

// Sync to cloud when ready
await neon.sync();  // Push local results to Neon Cloud
```

**Local mode architecture:**
```
.neon/
  ├── config.yaml        # Project configuration
  ├── traces.db          # chdb (embedded ClickHouse) for traces
  ├── metadata.sqlite    # SQLite for eval results, suites, etc.
  ├── prompts/           # Prompt version files
  ├── suites/            # Test suite definitions
  └── cache/             # LLM response cache (for deterministic replay)
```

---

## 8. Evolution Roadmap

### Phase 1: Foundation (Q1 2026) — Immediate

| Initiative | Effort | Impact |
|-----------|--------|--------|
| ClickHouse materialized views for dashboards | 1 week | Instant dashboard loads |
| Session/Run data model (extend traces) | 2 weeks | Multi-turn agent support |
| WebSocket gateway for live streaming | 2 weeks | Real-time dashboards |
| Plugin interface for scorers | 1 week | Community extensibility |
| Local mode (chdb + SQLite) | 2 weeks | Offline-first development |

### Phase 2: Intelligence (Q2 2026)

| Initiative | Effort | Impact |
|-----------|--------|--------|
| Auto test case generation pipeline | 3 weeks | 10x test coverage |
| NL query engine (text-to-ClickHouse SQL) | 2 weeks | Self-serve analytics |
| Agent graph data model | 2 weeks | Multi-agent visibility |
| Enhanced debug protocol (WebSocket, time-travel) | 3 weeks | Best-in-class debugging |
| Framework auto-instrumentation (OpenAI, Anthropic, LangChain) | 2 weeks | Zero-config tracing |

### Phase 3: Scale (Q3 2026)

| Initiative | Effort | Impact |
|-----------|--------|--------|
| Multi-tenant isolation (row-level + dedicated) | 4 weeks | Enterprise readiness |
| Edge trace collectors | 2 weeks | Global latency reduction |
| Data retention tiers (hot/warm/cold) | 2 weeks | Cost optimization |
| Prompt optimization workflow | 3 weeks | Automated improvement |
| MCP server plugin | 2 weeks | Agent self-evaluation |

### Phase 4: Ecosystem (Q4 2026)

| Initiative | Effort | Impact |
|-----------|--------|--------|
| VS Code extension | 6 weeks | IDE-native experience |
| Plugin marketplace | 4 weeks | Community ecosystem |
| Predictive quality scoring | 3 weeks | Proactive quality |
| Memory tracking & snapshots | 3 weeks | Stateful agent debugging |
| AI-powered RCA | 2 weeks | Automated incident response |

---

## Architecture Decision Records

### ADR-001: WebSocket vs SSE for Real-Time

**Decision:** Migrate from SSE (current) to WebSocket for debug protocol.
**Rationale:** SSE is unidirectional; debug protocol needs bidirectional communication (commands + events). WebSocket also enables multiplexing multiple streams and binary data.
**Migration:** Keep SSE endpoint as fallback for simple dashboard streaming; use WebSocket for debug sessions.

### ADR-002: Plugin Sandboxing Strategy

**Decision:** Use Worker Threads for built-in/trusted plugins, WASM for community plugins.
**Rationale:** Worker Threads have low overhead and access to Node.js APIs (needed for LLM calls in scorers). WASM provides stronger isolation for untrusted code but with limited API surface.

### ADR-003: Local-First with chdb

**Decision:** Use chdb (embedded ClickHouse) for local mode instead of SQLite for traces.
**Rationale:** Same query language and schema as production ClickHouse. No query translation layer needed. chdb supports all ClickHouse functions including window functions and array operations used in analytics queries.

### ADR-004: Agent Graph in ClickHouse vs Neo4j

**Decision:** Store agent graphs in ClickHouse (interaction events) with PostgreSQL for graph definitions.
**Rationale:** Agent graphs are queried primarily for analytics (e.g., "which agent pairs have the highest failure rate?"). ClickHouse excels at these aggregate queries. Graph traversal queries are rare and can be handled by recursive CTEs. Avoids adding another database to the stack.

### ADR-005: Session Model

**Decision:** Add `session_id` and `run_id` columns to existing `neon.traces` table rather than creating separate tables.
**Rationale:** Maintains backward compatibility. Sessions are a grouping concept over traces, not a separate entity requiring its own storage. The session metadata (conversation tree, memory snapshots) goes in dedicated tables.

---

## Summary

Neon's next-generation architecture builds on its strong foundation (ClickHouse OLAP, Temporal workflows, rich SDK) while evolving in five key directions:

1. **Agent-Native Data Models**: Sessions, agent graphs, conversation trees, and memory snapshots — moving beyond flat trace/span hierarchies to model how agents actually work.

2. **Real-Time Infrastructure**: Dual-path ingestion (real-time WebSocket + batch analytics), materialized views, and enhanced bidirectional debug protocol.

3. **Plugin Ecosystem**: Sandboxed plugin system for scorers, integrations, and visualizations. MCP server integration for agent self-evaluation.

4. **AI-Powered Intelligence**: Auto-generated evals from production traces, NL queries, predictive quality scoring, automated prompt optimization, and AI-assisted root cause analysis.

5. **Scale & DX**: Multi-tenant isolation, edge collection, local-first development, CLI workflows, and IDE integration.

The guiding principle: **Neon should be the platform that makes agents better at being agents** — not just measuring them, but actively improving them through a continuous feedback loop of observation, evaluation, and optimization.
