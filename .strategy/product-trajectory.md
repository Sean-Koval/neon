# Neon Product Trajectory: Current State & 10x Vision

## Executive Summary

Neon is an agent evaluation platform with strong foundational IP: a comprehensive TypeScript SDK, durable Temporal workflows, ClickHouse-backed observability, and a growing Next.js dashboard. The platform has evolved well beyond its original MVP scope (3 scorers + CLI) into a multi-faceted agent ops platform with 30+ scorers, A/B testing, progressive rollouts, training loops, and prompt optimization.

**Current overall completeness: ~45%** of the full vision defined in the epic wireframes. The SDK and backend are significantly ahead (~70-80%) of the frontend (~30-45%).

The 10x opportunity lies in becoming the **agent-native DevOps platform** — the system teams can't live without once they've used it, because it makes agents observable, improvable, and reliable in ways no generic monitoring tool can.

---

## Part 1: Current Feature Inventory

### Frontend Pages (31 pages mapped)

| Page | Route | Purpose |
|------|-------|---------|
| Command Center | `/` | Agent health dashboard, KPI cards, alerts, activity |
| Agents List | `/agents` | Agent registry with health status cards |
| Agent Detail | `/agents/[id]` | Agent overview, skills, tools, traces |
| Alerts | `/alerts` | Alert rules and triggered alerts |
| Analysis | `/analysis` | Cross-trace analysis |
| Analytics | `/analytics` | Analytics dashboard |
| Compare | `/compare` | A/B comparison of eval runs |
| Eval Runs List | `/eval-runs` | List of evaluation runs |
| Eval Run Detail | `/eval-runs/[id]` | Individual run results, progress |
| Experiments List | `/experiments` | A/B tests and progressive rollouts |
| Experiment Detail | `/experiments/[id]` | Experiment progress and results |
| Feedback | `/feedback` | Human feedback collection |
| MCP | `/mcp` | MCP server management |
| Optimization | `/optimization` | Optimization pipeline |
| Prompts List | `/prompts` | Prompt version management |
| Prompt Detail | `/prompts/[id]` | Prompt content, versions, performance |
| Runs | `/runs` | Workflow runs |
| Settings | `/settings` | Project settings, API keys, infrastructure |
| Skills | `/skills` | Skill definitions and evaluations |
| Suites List | `/suites` | Test suite management |
| Suite Detail | `/suites/[id]` | Suite test cases, run history |
| Suite Creator | `/suites/new` | New suite creation |
| Traces List | `/traces` | Trace browsing with filters |
| Trace Detail | `/traces/[id]` | Span timeline, tree, detail panel |
| Trace Debugger | `/traces/[id]/debug` | Interactive debugging with breakpoints |
| Trace Diff | `/traces/diff` | Side-by-side trace comparison |
| Training | `/training` | Training pipeline (feedback, datasets, export, auto-improve) |
| Workers | `/workers` | Temporal worker status |
| Workflows List | `/workflows` | Workflow execution list |
| Workflow Detail | `/workflows/[id]` | Workflow execution detail |

### API Routes (42 endpoints)

Core APIs covering agents CRUD, alerts, dashboard analytics (summary, score-trends, duration-stats, tool-metrics, backfill), debug (events, stream), eval-progress, feedback (comparisons), health, metrics, optimization, prompts CRUD, runs CRUD (with control and status), scores, settings (health, llm-providers), skills (with history, evals, regressions, summaries), spans, suites CRUD, traces (with analyze), tRPC, and v1 ingest.

### SDK Capabilities (TypeScript)

The `@neon/sdk` is exceptionally comprehensive:

| Module | Exports | Description |
|--------|---------|-------------|
| **Client** | `Neon`, `createNeonClient` | Core client for API interaction |
| **Test/Suite** | `defineTest`, `defineSuite`, `run` | Evals-as-code definitions |
| **Scorers** (30+) | Rule-based, LLM Judge, Causal, Skill, Parameter, Result Quality, Trajectory | Comprehensive scoring library |
| **Tracing** | `trace`, `span`, `generation`, `tool`, `reasoning`, `planning`, `mcp`, `handoff` | Full observability with 15+ span types |
| **Runner** | `TestRunner`, `runSuite`, `runSuites` | Local and remote execution |
| **Cloud** | `NeonCloudClient`, `syncResultsToCloud` | Cloud sync and background push |
| **Comparison** | `defineExperiment`, `runExperiment`, statistical utilities | Full A/B testing framework with t-test, Mann-Whitney, bootstrap CI, Cohen's d, Cliff's delta |
| **Analysis** | `detectPatterns`, `CorrelationAnalyzer`, pattern scorers | Failure pattern detection, cross-trace correlation |
| **Export** | OpenAI, TRL (SFT/DPO/KTO), DSPy, Agent Lightning | Training data export to 5 formats |
| **Prompts** | `definePrompt`, `PromptManager` | Prompt versioning and compilation |
| **Optimization** | Signal generation (reward, preference, demonstration, metric, event) | Optimization signal extraction |
| **Debugging** | `defineBreakpoint`, `DebugClient`, matchers, combinators | Programmatic breakpoints with real-time debug |
| **Evals** | `defineSkillEval`, `runSkillEval` | Skill-specific evaluation framework |
| **Threshold** | `parseThreshold`, CI/CD integration | Threshold-based pass/fail for CI |

### Temporal Workflows

| Workflow | File | Description |
|----------|------|-------------|
| `evalRunWorkflow` | `eval-run.ts` | Execute eval suite against agent |
| `evalCaseWorkflow` | `eval-case.ts` | Execute individual test case |
| `agentRunWorkflow` | `agent-run.ts` | Execute agent with tools |
| `abTestWorkflow` | `optimization.ts` | A/B test two agent configurations |
| `progressiveRolloutWorkflow` | `optimization.ts` | Multi-stage gated rollout |
| `trainingLoopWorkflow` | `training-loop.ts` | 7-stage auto-improvement pipeline |

### Temporal Activities

| Activity | Description |
|----------|-------------|
| `emitSpan` / `emitSpansBatch` | Write spans to ClickHouse |
| `llmCall` / `estimateCost` | Execute LLM calls with cost tracking |
| `executeTool` / `executeMCPTool` | Tool execution with MCP support |
| `scoreTrace` / `scoreTraceWithConfig` | Apply scorers to traces |
| `healthCheck` / `ping` | Infrastructure health monitoring |
| `sendSlackNotification` / `sendWebhookNotification` | Alert delivery |
| `initDebugSession` / `evaluateBreakpoints` | Interactive debugging |
| `generateTestCaseFromTrace` | Trace-to-test-case conversion |
| `collectSignals` / `curateTrainingData` / `runOptimization` | Training loop activities |
| `checkRegressionStatus` / `recordLoopIteration` | Continuous monitoring |

---

## Part 2: Feature Completeness Ratings

| Area | Score | Current State | Gap |
|------|-------|--------------|-----|
| **Command Center** | 6/10 | Page structure, KPI cards, alerts working. Agent health uses real tRPC. | Missing: environment selector, sparklines, running work tracker, activity feed from real events |
| **Agents** | 4/10 | Basic list and detail pages exist with card layout. | Missing: stat cards, tag filtering, table view, bulk actions, register modal, sort controls, version management, cost breakdown, health trends |
| **Traces** | 6/10 | Core trace table, detail page with timeline/tree, debugger, diff page. | Missing: stat cards, advanced filters, bulk actions, badges, cost column, graph view, test case creation, deep linking |
| **Eval Runs** | 3.5/10 | Basic list with status filter. Detail has real-time WebSocket. | Missing: enriched columns, search/filters, stats strip, bulk compare, scorer breakdown, progress hero, CSV export |
| **Suites** | 3/10 | Basic card grid exists. | Missing: stats, filters, run data on cards, action buttons, expandable cases, score trend, run history |
| **Experiments** | 3/10 | Page shell with mock data. ~40% with mock. | Missing: real Temporal wiring, create dialog, type-specific cards, live polling, detail pages |
| **Prompts** | 4.5/10 | List page (table layout, wrong types), detail page exists. | Missing: card layout, correct types, create dialog, inline editing, performance metrics, production management |
| **Training** | 1/10 | Page exists at `/training` but essentially empty. Temporal workflow exists. | Missing: entire 4-tab UI (feedback, datasets, export, auto-improve), all components |
| **Settings** | 6/10 | 4 tabs working. API keys, providers, infrastructure. | Missing: evaluation defaults card, URL-synced tabs |
| **SDK** | 8/10 | Comprehensive scorer library, tracing, export, comparison, debugging. | Missing: Python SDK parity, more integrations (Vercel AI, LangGraph) |
| **CLI** | 5/10 | Basic CLI exists with eval commands. | Missing: interactive mode, suite management, compare reports |
| **Data Layer** | 4/10 | Some tRPC routers exist but many mock data. Feedback in-memory. | Missing: datasets router, feedback persistence, mock data replacement |

**Overall Weighted Score: ~4.5/10**

The backend infrastructure (SDK + Temporal + ClickHouse) is at 7-8/10, but the frontend visualization and interaction layer is at 3-4/10. The product's value is substantially bottlenecked by the UI gap.

---

## Part 3: Planned Feature Summary (from Epics)

The `.beads/batch-epic-*.md` files define **~120 tasks across 10 epics**, organized into 6 parallel development streams:

| Stream | Epic | Tickets | Priority |
|--------|------|---------|----------|
| 1 | Prompts Management | 13 | P1 |
| 2 | Traces (List + Detail + Debug + Diff) | 18 | P1 |
| 3 | Eval Runs + Suites | 26 | P1 |
| 4 | Experiments + Compare | 19 | P1 |
| 5 | Training Pipeline | 20 | P1 |
| 6 | Global Chrome | 6 | P2 |
| - | Command Center | 8 | P1 |
| - | Agents (List + Detail) | 17 | P1 |
| - | Data Layer | 6 | P1 |
| - | Settings | 4 | P2 |

Executing all 120+ tickets would bring the platform to ~85-90% completeness against the wireframe vision.

---

## Part 4: The 10x Product Vision

### What Makes Teams UNABLE to Go Back

The current vision gets Neon to a solid agent evaluation platform. The **10x vision** transforms it into an **indispensable agent operations system**. Here's what that looks like:

---

### 4.1 Agent-Native Debugging Paradigm

**Current:** Trace timeline/tree view, span detail panel, basic breakpoints.

**10x Vision: "Agent DevTools"**

- **Step-Through Debugging**: Like a real debugger but for agent reasoning. Step through each decision point — "why did the agent choose tool X?" "what was in the context when it decided to loop?" — with the ability to replay from any point with modified inputs.
- **Reasoning Replay**: Record the full reasoning chain and allow scrubbing back and forth like a video timeline. See exactly what the agent "thought" at each step.
- **Counterfactual Analysis**: "What would have happened if the agent had called tool Y instead?" Run alternative paths from any decision point.
- **Live Debugging in Production**: Attach a debugger to a running agent trace in production without stopping it. Observe in real-time with read-only access.
- **Root Cause Synthesis**: Not just highlighting the error span — synthesize a human-readable root cause analysis: "The agent entered a loop because the search tool returned empty results, causing it to retry 12 times. The fix is to add a result validation step after tool calls."

**Moat:** No generic APM tool can do this. Agent reasoning is fundamentally different from HTTP request tracing.

---

### 4.2 Continuous Evaluation in Production

**Current:** Manual eval runs triggered from UI or CI.

**10x Vision: "Always-On Quality"**

- **Shadow Evaluation**: Every production trace is automatically scored by a lightweight scorer pipeline. No additional latency — scoring happens asynchronously on the trace after it's collected.
- **Regression Detection Across Deployments**: Automatic comparison of agent quality metrics across deployment versions. Alert when v1.3 is performing worse than v1.2 on any dimension.
- **Canary Evaluation**: Route 5% of production traffic through the eval pipeline with full scorer coverage. Statistically compare canary scores to baseline.
- **SLO-Based Alerts**: Define SLOs for agent quality (e.g., "P95 score >= 0.85, error rate <= 2%, P50 latency <= 1.5s") and get paged when they're violated.
- **Anomaly Detection**: Automatically detect unusual patterns — sudden cost spikes, latency outliers, loop detection, tool failure cascades — without manual threshold configuration.

**Moat:** MLflow gives you traces. Neon tells you when your agents are broken and why.

---

### 4.3 AI-Powered Eval Generation

**Current:** Manual test case creation, trace-to-test-case conversion.

**10x Vision: "Self-Writing Tests"**

- **Natural Language to Eval Suite**: "Write me a test suite that verifies the booking agent correctly handles cancellations, partial bookings, and timezone edge cases." Neon generates the suite with test cases, expected outputs, and scorers.
- **Coverage Analysis**: "Your agent handles 47 tool combinations. Your test suite covers 12. Here are the 35 untested paths, ranked by production frequency." Auto-generate tests for uncovered paths.
- **Failure-Driven Test Generation**: When a production failure occurs, automatically generate a test case that reproduces it. Build the regression suite automatically from real failures.
- **Adversarial Test Generation**: Automatically generate adversarial inputs designed to break the agent — prompt injection attempts, edge cases, ambiguous queries, conflicting instructions.
- **Test Case Maintenance**: When the agent's capabilities change (new tools added, tool APIs changed), automatically update test cases and flag ones that are now invalid.

**Moat:** The training data export and scoring infrastructure makes this uniquely possible. Neon has the data to know what to test.

---

### 4.4 Self-Healing Agents

**Current:** Training loop with 7 stages, prompt optimization, approval gates.

**10x Vision: "Closed-Loop Agent Improvement"**

- **Auto-Fix from Eval Failures**: When evals detect a regression, automatically analyze the failure pattern, generate a prompt fix using the optimization engine, validate the fix with the eval suite, and deploy if it passes — all without human intervention (within configurable auto-approve thresholds).
- **Continuous Prompt Evolution**: The agent's prompts are not static. They evolve continuously based on production feedback, preference data, and eval results. The training loop runs perpetually, making micro-improvements.
- **Multi-Objective Optimization**: Optimize for quality, cost, AND latency simultaneously. "Improve score by 5% without increasing cost by more than 10%." Use Pareto optimization to find the frontier.
- **Skill-Level Optimization**: Don't just optimize the system prompt — optimize individual skill behaviors. If the "search" skill is underperforming, optimize its prompt/parameters while leaving "booking" untouched.
- **Knowledge Distillation Pipeline**: When agents use expensive models (Claude Opus, GPT-4o), automatically generate training data and fine-tune cheaper models to replicate behavior. Monitor quality parity and auto-switch when the distilled model meets thresholds.

**Moat:** The combination of eval data, training data export, optimization workflows, and deployment management creates a unique closed loop.

---

### 4.5 Collaborative Agent Development

**Current:** Single-user, no collaboration features.

**10x Vision: "Figma for Agent Quality"**

- **Shared Eval Workspaces**: Teams collaboratively define test suites, review eval results, and approve deployments. Real-time cursors, comments on test cases, review workflows.
- **Eval Reviews (like Code Reviews)**: When a team member changes an eval suite or prompt, it goes through a review process. Reviewers can see the impact on scores, comment on specific test cases, and approve/reject.
- **Annotation Campaigns**: Organize human feedback collection as campaigns — "We need 500 preference labels for the billing agent this week." Track progress, assign annotators, monitor inter-annotator agreement.
- **Knowledge Base**: Accumulated organizational knowledge about agent failure modes, successful prompting patterns, and testing strategies. New team members can ramp up by reading the knowledge base.
- **Audit Trail**: Complete audit log of who changed what, when, and why. Required for compliance in regulated industries.

**Moat:** Enterprise teams need governance around AI agents. Neon becomes the system of record.

---

### 4.6 Agent Marketplace & Registry

**Current:** Basic agent registration.

**10x Vision: "NPM for Agents"**

- **Agent Catalog**: Public or org-private catalog of agent skills, configurations, and eval results. Teams can discover and reuse agents.
- **Verified Badges**: Agents that pass comprehensive eval suites get "verified" badges. SLA guarantees backed by continuous evaluation.
- **Skill Composition**: Build complex agents by composing skills from the registry. "I need a customer support agent. Let me use the verified 'lookup-order' skill, 'process-refund' skill, and 'escalate-to-human' skill."
- **Benchmark Leaderboards**: Compare agent quality across the ecosystem on standardized benchmarks. "Our booking agent ranks #3 on the Travel Agent Benchmark."

---

## Part 5: Product-Market Fit Signals

### Must-Have Indicators (Current State: Early)

| Signal | Current | Target |
|--------|---------|--------|
| **Teams can't ship without running evals** | Optional | Gate in CI/CD |
| **Daily active usage of dashboard** | Low | Daily check-ins by 3+ team members |
| **Self-serve setup < 30 min** | ~2 hours | < 30 minutes |
| **Production monitoring adoption** | 0 teams | Majority of agent teams |
| **Feedback loop closure** | Manual | Automated continuous improvement |

### What Makes This a Must-Have vs Nice-to-Have

**Nice-to-Have (current):**
- "We run evals occasionally before big releases"
- "We look at traces when something breaks"
- "We manually review agent outputs"

**Must-Have (10x):**
- "Our CI blocks PRs that degrade agent quality — we can't ship without Neon"
- "We get alerted within 5 minutes when agent quality drops in production"
- "Our agents self-improve from production feedback — quality goes up without manual work"
- "We can't debug agent reasoning without the step-through debugger"
- "Our compliance team requires the audit trail from Neon"

---

## Part 6: Pricing & GTM Considerations

### Open-Source Core vs Enterprise

| Tier | Features | Target |
|------|----------|--------|
| **OSS Core** | SDK, scorers, CLI, local runner, basic UI, trace storage | Individual developers, small teams |
| **Team** | Cloud sync, collaboration, annotation campaigns, CI/CD integration | Growing agent teams (5-20 people) |
| **Enterprise** | SSO/SAML, audit trail, SLOs, multi-environment management, knowledge distillation, dedicated support | Large orgs with compliance needs |

### Key GTM Levers

1. **SDK-first adoption**: Teams start by `npm install @neon/sdk` and writing their first eval. No infrastructure needed.
2. **CI/CD integration**: The GitHub Action makes quality gates zero-friction. Once it's in the pipeline, it's sticky.
3. **Trace-to-test flywheel**: Production failures automatically become test cases. The test suite grows itself.
4. **Self-improving agents**: The training loop is the ultimate stickiness. Once agents are improving automatically, removing Neon means manual quality management.

---

## Part 7: Priority Roadmap

### Phase 1: "Make It Real" (Complete the ~120 epic tickets)
- Wire all frontend to real data (no mock data)
- Complete all 10 epic streams to wireframe spec
- Achieve 85-90% feature completeness
- **Outcome:** Fully functional platform matching the design vision

### Phase 2: "Make It Indispensable" (10x features)
- Continuous production evaluation (shadow scoring)
- Automatic regression detection across deployments
- AI-powered test generation from natural language
- Self-healing agent loop with auto-approve gates
- **Outcome:** Teams can't ship agents without Neon

### Phase 3: "Make It a Platform" (Ecosystem)
- Collaborative features (shared workspaces, eval reviews)
- Agent registry and skill marketplace
- Enterprise governance (audit trail, RBAC, SSO)
- Knowledge distillation pipeline
- **Outcome:** Neon becomes the system of record for agent quality

---

## Appendix: Architecture Strengths

1. **Temporal for durable execution** — Workflows survive failures, support pause/resume/abort, enable long-running training loops. This is a significant architectural advantage over bare async.

2. **ClickHouse for analytics** — Real-time analytical queries over millions of traces/spans. Column-oriented storage is ideal for the aggregation patterns needed (percentiles, time-series, group-by agent).

3. **Comprehensive SDK** — 30+ scorers, 5 export formats, statistical testing, debugging, tracing with 15+ span types. This is deep IP that competitors would need months to replicate.

4. **Modular scorer architecture** — Rule-based, LLM judge, causal analysis, trajectory scoring, skill selection scoring. The scorer system is composable and extensible.

5. **Training data pipeline** — The full path from traces → feedback → datasets → export → fine-tuning → deployment is architecturally complete, even if the UI isn't finished.
