# Neon Product Focus

Updated: 2026-03-29

## Direction

Neon should focus on being a high-quality free self-hosted product for:

- Durable agent tracing
- Agent graph and state debugging
- Behavior-vs-intent evaluation
- Trace-to-tuning improvement loops

Deprioritize near-term enterprise monetization work such as billing, SSO/SAML, RBAC, and compliance-heavy audit features until the core product is excellent.

## Product Jobs To Win

1. Capture what the agent did, reliably.
2. Show how the run unfolded as a timeline and as a graph.
3. Preserve enough state and checkpoints to debug failures after the fact.
4. Let users express what the agent should have done.
5. Turn bad runs into datasets, experiments, and measurable improvements.

## Research Signals

Common feature expectations across current agent observability and evaluation products:

- Open, vendor-neutral instrumentation and transport.
- Rich traces for model calls, tools, retrieval, memory, workflows, and handoffs.
- Sessions and multi-step workflow views.
- Graph-style views for agentic systems.
- Dataset-backed evaluations and experiments.
- Human feedback, annotation, and trace-to-dataset flows.
- Prompt/model/tool comparison loops tied to production failures.
- Self-hosting, privacy, and data control.

## Concrete Product Bets

### 1. Durable Traces First

Users need traces, checkpoints, and snapshots that survive crashes, queue failures, and operator mistakes.

Build:

- Append-only event storage for traces
- Checkpoints for workflow and agent state
- Replay/export/import flows
- Backup and retention guidance for self-hosted installs

### 2. Timeline + Graph + State

Raw waterfall traces are not enough for agentic systems.

Build:

- Agent/workflow/tool graph view
- Branch and loop visibility
- State snapshot browser with diffs
- Handoffs, memory updates, retrieval context, and tool IO attached to nodes

### 3. Behavior-Vs-Intent Evals

The core product question is not just "what happened?" but "how did this differ from what we wanted?"

Build:

- Expected plan and tool policy definitions
- Plan adherence and tool choice evaluators
- Guardrail and recovery evaluators
- Annotation queues for expected-vs-actual review

### 4. Trace-To-Tuning Workflow

Observability should feed improvement directly.

Build:

- Convert failures into datasets
- Compare prompt/model/tool variants on those datasets
- Store experiment history next to the original failure mode
- Highlight improvements and regressions by behavior category

## Why This Direction

Recent product direction across the space points the same way:

- Langfuse emphasizes open, self-hosted tracing, agent graphs, prompt management, evaluation, datasets, experiments, and annotation queues.
- Phoenix emphasizes free self-hosting, OpenTelemetry/OpenInference tracing, evaluations, datasets, experiments, and prompt engineering.
- Braintrust emphasizes turning production traces into datasets, versioned datasets, playgrounds, and eval loops.
- AgentOps emphasizes minimal-setup session, workflow, tool, and guardrail tracing.
- OpenTelemetry and OpenInference continue pushing vendor-neutral semantic conventions for GenAI and MCP tracing.
- Helicone shows the value of gateway-level observability, sessions, prompt management, caching, and fallback visibility.

## Sources

- Langfuse overview: <https://langfuse.com/docs>
- Phoenix overview: <https://arize.com/docs/phoenix>
- Phoenix self-hosting: <https://arize.com/docs/phoenix/self-hosting>
- Braintrust homepage: <https://www.braintrust.dev/>
- Braintrust datasets: <https://www.braintrust.dev/docs/guides/datasets>
- Braintrust playgrounds: <https://www.braintrust.dev/docs/platform/playground>
- AgentOps quickstart: <https://docs.agentops.ai/v2/quickstart>
- AgentOps decorators: <https://docs.agentops.ai/v2/concepts/decorators>
- OpenTelemetry overview: <https://opentelemetry.io/docs/what-is-opentelemetry/>
- OpenTelemetry semantic conventions: <https://opentelemetry.io/docs/specs/semconv/>
- OpenTelemetry GenAI spans: <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/>
- OpenTelemetry MCP semantic conventions: <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>
- OpenInference repository: <https://github.com/Arize-ai/openinference>
- Helicone gateway overview: <https://docs.helicone.ai/gateway/overview>
