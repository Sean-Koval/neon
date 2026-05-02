# OpenInference / GenAI Trace Coverage Audit

Updated: 2026-03-30

## Goal

This document audits Neon's current tracing model against current OpenTelemetry GenAI semantic conventions, MCP semantic conventions, and OpenInference-style expectations for agent observability.

It is intended to close `neon-m4p` by:

- documenting what Neon already captures,
- identifying the semantic gaps that still matter for the product direction,
- mapping those gaps into implementation work.

## Sources

- OpenTelemetry GenAI spans:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/>
- OpenTelemetry GenAI events:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/>
- OpenTelemetry MCP semantic conventions:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>
- OpenInference repository:
  <https://github.com/Arize-ai/openinference>

## Audit Summary

Neon is already materially aligned with the current direction of the ecosystem:

- OTLP export exists.
- GenAI model, prompt, token, tool, and MCP data are already captured.
- The product already has graph, decision, multi-agent, and skill-eval UI surfaces.
- Offline buffering and replay-oriented storage primitives already exist.

The main gap is not "no tracing." The gap is that Neon still records agent runs mostly as span-oriented telemetry with custom product metadata, while the next product step requires a stronger semantic model for:

- sessions and conversations,
- structured input/output messages,
- retrieval documents,
- agent identity and handoffs,
- state snapshots and durable artifacts,
- eval metadata tied directly to traces.

That gap matters because the current roadmap is no longer "generic tracing." It is "self-hosted agent observability and improvement."

## Current Coverage

### 1. Core trace and span structure

Already present:

- `Trace` / `Span` models with IDs, parentage, timing, status, and token/cost fields in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- component attribution such as `planning`, `reasoning`, `tool`, `retrieval`, `memory`, `routing`, `skill`, and `mcp` in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- local async context propagation in [index.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/index.ts)

Assessment:

- Strong custom product model for compound systems.
- Still light on standardized GenAI conversation/session semantics.

### 2. GenAI model call attributes

Already present:

- `gen_ai.request.model`
- prompt/input capture via `gen_ai.prompt`
- token usage attributes

Evidence:

- OTLP mapping in [exporter.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/exporter.ts)
- generation helpers in [index.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/index.ts)

Assessment:

- Good baseline for model calls.
- Partial alignment only: current export uses prompt/completion strings, not structured input/output message arrays.

### 3. Tool execution

Already present:

- tool spans and tool fields in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- `tool.name`, `tool.input`, `tool.output` export in [exporter.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/exporter.ts)
- tool helper in [index.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/index.ts)

Assessment:

- Good baseline.
- Needs stronger convergence with current GenAI execute-tool semantics and tool-call IDs when tools are model-selected.

### 4. MCP observability

Already present:

- dedicated MCP context in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- MCP tracing wrapper in [mcp.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/mcp.ts)
- MCP UI surfaces in [page.tsx](/home/seanm/repos/neon/frontend/app/mcp/page.tsx), [server-topology.tsx](/home/seanm/repos/neon/frontend/components/mcp/server-topology.tsx), and related components

Assessment:

- Better than many general tracing products already.
- Still missing some session-level MCP semantics and a clearer mapping to current OTel MCP fields.

### 5. Retrieval visibility

Already present:

- retrieval span type in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- `RetrievalChunk` type in [trace.ts](/home/seanm/repos/neon/packages/shared/src/types/trace.ts)
- prior issue history shows structured retrieval context already landed under `neon-819.10`

Assessment:

- Strong directionally.
- The remaining gap is making retrieval payloads first-class in storage, UI, and standardized export.

### 6. Durability and replay primitives

Already present:

- durable offline buffering in [offline-buffer.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/offline-buffer.ts)
- exporter integration with offline buffering in [exporter.ts](/home/seanm/repos/neon/packages/sdk/src/tracing/exporter.ts)
- docs in [offline-buffer.md](/home/seanm/repos/neon/docs/features/offline-buffer.md)

Assessment:

- Good primitive.
- Not yet the same thing as durable checkpoints, state snapshots, or deterministic replay of agent runs.

### 7. Product surfaces for debugging and evaluation

Already present:

- graph / timeline / debugger surfaces:
  [agent-graph.tsx](/home/seanm/repos/neon/frontend/components/traces/agent-graph.tsx),
  [decision-tree.tsx](/home/seanm/repos/neon/frontend/components/traces/decision-tree.tsx),
  [trace-debugger.tsx](/home/seanm/repos/neon/frontend/components/traces/debugger/trace-debugger.tsx),
  [execution-flow.tsx](/home/seanm/repos/neon/frontend/components/multi-agent/execution-flow.tsx)
- evaluation / comparison / optimization primitives:
  [skill-eval.ts](/home/seanm/repos/neon/packages/sdk/src/evals/skill-eval.ts),
  [experiment.ts](/home/seanm/repos/neon/packages/sdk/src/comparison/experiment.ts),
  [signals.ts](/home/seanm/repos/neon/packages/sdk/src/optimization/signals.ts)

Assessment:

- The UI and SDK are not empty; they are ahead of the queue in some areas.
- The missing piece is a coherent product flow that ties traces, state, expected behavior, and tuning together.

## Semantic Gaps

These are the main gaps relative to current OTel GenAI / MCP conventions and OpenInference-style observability.

### Gap A: Session and conversation identity

Missing or partial:

- explicit conversation/session identifiers on the shared trace model
- explicit session semantics across multiple traces or multi-step workflows
- stable user / thread / conversation lineage for replay and eval grouping

Why it matters:

- Current GenAI conventions and modern products increasingly treat sessions as a first-class unit, not just isolated traces.
- Neon needs this for "what happened across the whole agent run?" and for replay/diff workflows.

### Gap B: Structured input/output messages

Missing or partial:

- structured message arrays for prompts and completions
- tool-call message linkage
- system / user / assistant / tool role fidelity

Current state:

- Neon mostly captures string fields like `input`, `output`, `gen_ai.prompt`, and `tool.output`.

Why it matters:

- Message structure is required for faithful replay, better evals, and cross-tool interoperability.

### Gap C: Agent identity, handoffs, and workflow lineage

Missing or partial:

- richer semantic representation for agent role, agent name/type, handoff edges, and delegation steps
- explicit cross-agent message / handoff schema in the shared trace types

Current state:

- `agentId`, `workflowId`, and UI surfaces exist, but the exported span model is still not rich enough for portable agent graph reconstruction.

### Gap D: State snapshots and durable artifacts

Missing or partial:

- first-class state snapshot objects
- artifact references for memory state, retrieved docs, intermediate files, and tool artifacts
- checkpoint semantics in the trace model itself

Why it matters:

- This is the biggest product gap for the current roadmap.
- Graph debugging without state and artifact context will remain shallow.

### Gap E: Evaluation metadata attached to traces

Missing or partial:

- explicit trace-level eval annotations for expected behavior, divergence points, reviewer labels, and promotion into datasets
- stronger coupling between trace spans and expected-vs-actual scoring metadata

Why it matters:

- OpenInference-style ecosystems increasingly connect traces to evals and datasets directly.
- Neon's product direction depends on this.

### Gap F: Privacy controls for richer trace content

Missing or partial:

- selective redaction across prompts, tool I/O, structured messages, retrieval docs, and future state snapshots

Why it matters:

- Richer semantics increase product value, but also increase the chance of capturing sensitive content.

## Recommendations

### Recommendation 1: Keep Neon's custom product model, but add a standards-aligned translation layer

Neon should not flatten its product model down to the minimum OTel surface. The current custom fields for MCP, skill selection, decision metadata, and component attribution are useful.

The better move is:

- keep Neon-native concepts,
- add standards-aligned fields where they are missing,
- make export and storage capable of carrying both.

### Recommendation 2: Prioritize session/message/state semantics ahead of cosmetic UI expansion

The current UI already proves the team can build graph/debug surfaces.

The blocking product work is now the data model:

- session identity,
- structured messages,
- handoffs,
- state snapshots,
- artifacts,
- eval annotations.

### Recommendation 3: Treat state snapshots as part of tracing, not a separate later system

The roadmap issues `neon-ao2` and `neon-ao3` should be implemented as extensions of the trace model, not as separate side stores with weak linkage.

### Recommendation 4: Make privacy controls land before or with richer state capture

`neon-819.13` should stay near the top of the queue because state snapshots, message capture, and retrieval payloads all increase privacy risk.

## Mapping To Implementation Work

The identified gaps already map well to the active queue:

- session / message / handoff / graph-ready semantics:
  `neon-819`
- durable checkpoints, state snapshots, replay, artifacts:
  `neon-ao2`
- graph + timeline + state debugger:
  `neon-ao3`
- expected-vs-actual scoring and trace annotations:
  `neon-ao4`
- trace-to-improvement workflow:
  `neon-ao5`
- privacy controls:
  `neon-819.13`
- operator usability and self-host docs:
  `neon-osh`

## New Follow-On Task

This audit identifies one implementation task that should be explicit in the backlog:

- add an OTel/OpenInference-aligned schema layer for session IDs, structured messages, handoffs, state snapshot references, and eval annotations in the shared trace model and exporter path.

That work is close enough to the tracing foundation that it should be tracked under `neon-819`.

## Exit Criteria For This Audit

This audit is complete when:

- the gap analysis is recorded in-repo,
- the missing semantic areas are mapped to active implementation work,
- the backlog contains an explicit task for standards-aligned schema expansion.
