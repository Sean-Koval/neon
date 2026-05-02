# Neon Product Roadmap

## Product Direction

Neon is currently focused on being a high-quality, free, self-hostable product for understanding what AI agents are doing, why they behaved that way, and how to make them behave better.

The near-term product is not an enterprise platform. Billing, SSO, and compliance work remain valid long-term, but they are intentionally deprioritized until the core product is clearly strong for self-hosted agent tracing, debugging, evaluation, and tuning.

## Core Product Jobs

Neon should help a user answer five questions quickly:

1. What did my agent do?
2. What state did it carry at each step?
3. Where did it diverge from the behavior I wanted?
4. Which tool, prompt, retrieval step, or handoff caused the problem?
5. What is the fastest path to improve it and verify the fix?

## Current Focus

### Pillar 1: Durable Self-Hosted Tracing

- Reliable trace ingestion for local and self-hosted deployments
- Durable buffering and replay when the backend is unavailable
- Step-level state snapshots and important state diffs
- Trace graphs for agent runs, tool calls, handoffs, and retries
- OpenTelemetry and OpenInference alignment where practical

### Pillar 2: Agent Understanding

- Trace timelines that show planning, reasoning, tools, retrieval, and handoffs
- Graph views for multi-step and multi-agent execution
- State snapshot viewers for memory, context, and intermediate artifacts
- Decision and branch analysis for "why did it do this?"
- Session-oriented debugging for agent runs that span many traces or tasks

### Pillar 3: Behavior vs Intent

- Evals that compare actual trajectories against expected behavior
- Tool-choice, ordering, parameter, and outcome quality scoring
- Drift and regression detection across runs and agent versions
- Failure clustering, root-cause analysis, and trace comparison

### Pillar 4: Tuning Loop

- Turn a bad trace into a reproducible eval quickly
- Capture corrections and preferred trajectories
- Compare prompt, tool, retrieval, and policy changes against baselines
- Make it obvious which change improved behavior and which change regressed it

### Pillar 5: Self-Serve Product Quality

- Fast self-host setup
- Clear docs and examples
- A UI that makes debugging and eval authoring approachable
- A web-based test suite editor for users who do not want to write SDK code first

## Prioritized Roadmap

### Now

- Finish the self-hosted tracing hardening work
- Add graph and state-centric trace inspection
- Add evals for intent-vs-behavior and trajectory quality
- Tighten the trace-to-tuning workflow
- Improve self-serve setup and test authoring

### Next

- Better session replay and step diffing
- Richer multi-agent and MCP observability
- Smarter failure clustering and automated issue surfacing
- Better prompt, retrieval, and tool-change comparison workflows

### Later

- Sampling and privacy controls for larger deployments
- Enterprise access control and SSO
- Compliance and audit features
- Billing and monetization hooks

## Research-Informed Feature Targets

These product areas consistently appear across current observability/evaluation tools and standards:

- Strong trace inspection with spans, sessions, and metadata
- Dataset-backed evals and regression workflows
- Prompt and version comparison
- Tool and retrieval visibility
- OpenTelemetry/OpenInference-style interoperability
- Human feedback and correction capture
- Self-hosting support with reliable ingestion and storage

Where Neon should lean harder than typical dashboards:

- State snapshots, diffs, and trace graphs
- "Expected vs actual" trajectory analysis
- Turning production failures into evals quickly
- Multi-agent and MCP debugging as first-class workflows

## Deprioritized For Now

- SSO / SAML
- RBAC
- Billing hooks
- Compliance-focused audit logging
- Broader enterprise packaging work

These remain long-term roadmap items, but they should not displace product-core observability and evaluation work until Neon is compelling as a self-hosted tool on its own.

## Active Issue Themes

- `neon-xlb`: roadmap umbrella for the current product direction
- `neon-819`: self-hosted distributed tracing foundation
- `neon-vcd`: backup automation for durable self-hosting
- `neon-026`: self-serve debugging and authoring UX
- `neon-3dd`: web-based test suite editor
- New trace graph, state snapshot, intent-vs-behavior, and tuning-loop issues in `.beads/issues.jsonl`

## Success Criteria

- A user can self-host Neon and capture useful traces without fighting the setup
- A user can inspect a single agent run and understand flow, state, and failure points
- A user can express expected behavior and compare it to actual trajectories
- A user can convert a failure into an eval and verify an improvement quickly
- The product is clearly useful before any enterprise packaging work is resumed
