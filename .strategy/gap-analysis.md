# Neon Gap Analysis: Critical Missing Features

## Executive Summary

Neon has built a strong foundation as an agent evaluation platform with **31 routes/pages**, **125 UI components**, **21 tRPC routers**, durable execution via Temporal, and trace storage via ClickHouse. However, compared to competitors (LangSmith, Braintrust, Langfuse, Arize Phoenix, W&B Weave), there are critical gaps that prevent Neon from being indispensable for AI/agent teams.

This analysis identifies **28 gaps** across 7 categories, prioritized by **Impact** (how much value it delivers to agent teams) and **Feasibility** (how practical it is to build given Neon's current architecture).

---

## What Neon Already Has (Strengths)

Before identifying gaps, it's important to recognize what Neon already does well:

| Capability | Status | Notes |
|-----------|--------|-------|
| Trace observability | **Strong** | Full span trees, timelines, agent graphs, RCA overlay, live debugger |
| Evaluation framework | **Strong** | Evals-as-code SDKs (TS + Python), 8 scorer types, test runner |
| Prompt management | **Good** | Versioning, performance tracking, variable templates |
| Experiment management | **Good** | A/B testing, progressive rollouts, statistical analysis |
| Training/feedback loop | **Good** | Preferences, corrections, datasets, export, auto-improve loops |
| Regression detection | **Good** | Alert rules, regression banners, threshold config |
| Multi-agent visibility | **Basic** | Execution flow, failure cascade, multi-agent trace badges |
| Trace comparison | **Good** | Diff views, span diffs, dumbbell charts, confidence intervals |
| Agent registry | **Basic** | Auto-discovery, health tracking, environments |
| MCP integration | **Basic** | Server topology, tool usage tracking |
| Optimization pipeline | **Good** | Closed-loop prompt optimization with iteration history |
| Statistical analysis | **Good** | Confidence intervals, statistical guidance |

### SDK Capabilities (TypeScript)
- **Scorers**: rule-based, LLM-judge, parameter-accuracy, result-quality, causal, trajectory, skill-selection
- **Test framework**: defineTest, defineDataset, defineSuite, TestRunner
- **Client**: Neon API client for trace submission
- **Reporters**: Console and JSON reporters

### Backend (Temporal Workers)
- Durable workflow execution for eval runs
- Optimization loop orchestration
- Anomaly detection pipeline

---

## Gap Analysis by Category

### 1. Agent Development Lifecycle

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 1.1 | **CI/CD Eval Gates** — GitHub Actions / GitLab CI integration to run evals on PRs, post results as PR comments, gate merges on quality thresholds | 9 | 8 | **72** | Braintrust (native GH Action), LangSmith (CI/CD pipeline), Promptfoo |
| 1.2 | **CLI for Local Eval Runner** — `neon eval run` from terminal, watch mode, local-first development | 8 | 7 | **56** | LangSmith (langsmith CLI), Braintrust (braintrust CLI), Promptfoo |
| 1.3 | **Prompt Version Control + Git Sync** — Sync prompts bidirectionally with Git repos, webhook triggers on prompt changes | 7 | 6 | **42** | LangSmith (PromptHub + webhooks), Langfuse (GitHub Integration), Braintrust |
| 1.4 | **Environment Management** — First-class dev/staging/prod environments for agents with promotion workflows | 6 | 5 | **30** | LangSmith (deployment environments) |

**What Neon has today**: Basic CLI (Python/Typer) but limited to `agent-eval --help`. No CI/CD integration. Agent registry has environment badges but no promotion workflows. Prompts have versioning but no Git sync.

---

### 2. Observability

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 2.1 | **Cost Attribution Dashboard** — Per-agent, per-model, per-tool cost breakdown with budget alerts and cost anomaly detection | 9 | 8 | **72** | LangSmith (cost breakdowns), Braintrust (token/cost tracking), W&B Weave (cost aggregation) |
| 2.2 | **Latency Profiling** — P50/P99 latency tracking, bottleneck detection, time-to-first-token metrics, latency regression alerts | 8 | 7 | **56** | LangSmith (P50/P99 dashboards), Braintrust (duration tracking), W&B Weave |
| 2.3 | **OpenTelemetry Native Ingestion** — Accept traces via OTLP protocol for framework-agnostic integration | 8 | 6 | **48** | Arize Phoenix (OTLP native), Langfuse (OTEL SDK v3), W&B Weave |
| 2.4 | **Memory/RAG Quality Tracking** — Track retrieval quality, embedding drift, chunk relevance, RAG pipeline metrics | 7 | 5 | **35** | Arize Phoenix (retrieval evals), LangSmith |
| 2.5 | **Custom Dashboards** — User-defined dashboards with drag-and-drop widgets, saved filters, team sharing | 7 | 5 | **35** | LangSmith (custom dashboards), Braintrust |

**What Neon has today**: Traces track cost and duration per span. Dashboard shows aggregate metrics. But no per-model cost attribution, no P50/P99 latency, no OTLP ingestion, no RAG-specific metrics.

---

### 3. Evaluation

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 3.1 | **Online Evals (Production Traffic)** — Run evaluations on live production traces in near real-time, not just offline datasets | 9 | 7 | **63** | LangSmith (online evals), Braintrust |
| 3.2 | **Multi-turn / Conversation-level Evals** — Evaluate entire agent conversations, not just single trace-level scoring | 9 | 6 | **54** | LangSmith (multi-turn evals, 2025 launch), Braintrust |
| 3.3 | **Human Annotation Workflows** — Structured human labeling queues, inter-annotator agreement, annotation guidelines | 8 | 6 | **48** | Arize Phoenix (human annotation), Langfuse (manual labeling), Maxim AI |
| 3.4 | **Scorer Marketplace / Auto-generation** — Pre-built scorer library, natural language scorer creation, community contributions | 7 | 6 | **42** | Braintrust (25+ built-in + Loop auto-generation), Arize Phoenix |
| 3.5 | **Red-teaming / Adversarial Testing** — Built-in adversarial test generation, safety evals, jailbreak detection | 7 | 5 | **35** | Promptfoo (red-teaming), Microsoft (PyRIT) |
| 3.6 | **Statistical Significance in A/B Tests** — Automated sample size recommendations, power analysis, sequential testing, early stopping | 6 | 7 | **42** | Braintrust |

**What Neon has today**: Strong offline evaluation with 8 scorer types. A/B testing exists with statistical guidance. But no online evals, no multi-turn conversation evals, no human annotation queues, no scorer marketplace.

---

### 4. Operations

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 4.1 | **Alerting Integrations** — PagerDuty, Slack, email, webhook notifications for regressions, anomalies, SLA breaches | 9 | 8 | **72** | LangSmith (proactive alerts), Arize (alerting), Datadog |
| 4.2 | **Model Routing & Fallback** — Configure model routing rules, automatic fallback on failures, A/B traffic splitting at model level | 7 | 5 | **35** | Braintrust (AI proxy with model routing) |
| 4.3 | **Rate Limiting & Quota Management** — Per-model rate limits, token budgets, cost caps, usage quotas per team/project | 6 | 6 | **36** | LangSmith, Braintrust (proxy) |
| 4.4 | **Guardrails Integration** — Input/output guardrails, content filtering, PII detection, configurable safety policies | 8 | 5 | **40** | W&B Weave (guardrails), Arize Phoenix |

**What Neon has today**: Alert rules with threshold configuration and regression banners. But alerts are UI-only — no external notifications (Slack, PagerDuty, email, webhooks). No model routing, rate limiting, or guardrails.

---

### 5. Data & Training

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 5.1 | **Dataset Versioning & Lineage** — Git-like versioning for datasets, track how datasets were created (from traces, feedback, synthetic), diff between versions | 8 | 6 | **48** | Arize Phoenix (versioned datasets), W&B Weave (dataset versioning), Braintrust |
| 5.2 | **Synthetic Data Generation** — Generate test cases from production traces, augment datasets with LLM-generated variations | 7 | 6 | **42** | Braintrust, Arize Phoenix (datasets from traces) |
| 5.3 | **Fine-tuning Pipeline Integration** — Export datasets in fine-tuning formats (JSONL, SFT, DPO pairs), one-click export to OpenAI/Anthropic/Together | 6 | 7 | **42** | W&B (full training integration), Arize Phoenix |
| 5.4 | **RLHF/DPO Pipeline** — Generate preference pairs from human feedback, create DPO training sets from A/B test results | 5 | 4 | **20** | Scale AI, Labelbox, Humanloop |

**What Neon has today**: Training page with feedback (preferences, corrections), datasets (create, list), export flow, and auto-improve loops. But no dataset versioning/diffing, no synthetic data generation, no fine-tuning format export.

---

### 6. Collaboration

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 6.1 | **Team-based Access Control (RBAC)** — Role-based permissions (admin, editor, viewer), project-level access, audit logs | 8 | 6 | **48** | LangSmith (enterprise), Langfuse (RBAC), Braintrust |
| 6.2 | **Annotation & Review Workflows** — Comment on traces, tag issues, assign for review, approval workflows for prompt changes | 7 | 6 | **42** | Langfuse (annotation), LangSmith |
| 6.3 | **Shared Reports & Snapshots** — Generate shareable reports, scheduled email digests, embed dashboards, public share links | 6 | 5 | **30** | LangSmith, Braintrust |

**What Neon has today**: Organizations and workspaces exist (tRPC routers). Settings have API key management. But no RBAC, no annotation workflows, no shared reports.

---

### 7. Developer Experience

| # | Gap | Impact | Feasibility | Priority Score | Competitors That Have It |
|---|-----|--------|-------------|----------------|------------------------|
| 7.1 | **Playground / Prompt Sandbox** — Interactive prompt testing, compare models side-by-side, replay traced LLM calls | 9 | 7 | **63** | Arize Phoenix (playground), Langfuse (LLM playground), LangSmith |
| 7.2 | **Framework Auto-instrumentation** — One-line setup for LangChain, LlamaIndex, OpenAI SDK, Vercel AI SDK, CrewAI | 8 | 7 | **56** | Langfuse (13+ frameworks), Braintrust (13+ frameworks), Arize Phoenix |
| 7.3 | **SDK Parity (Python ↔ TypeScript)** — Ensure Python SDK has full feature parity with TypeScript SDK | 7 | 6 | **42** | Langfuse, LangSmith, Braintrust |

**What Neon has today**: Both TS and Python SDKs exist but Python SDK appears to have fewer features. No playground for prompt testing. No auto-instrumentation for popular frameworks.

---

## Prioritized Gap Matrix

Sorted by **Priority Score** (Impact × Feasibility):

| Rank | Gap | Category | Impact | Feasibility | Score |
|------|-----|----------|--------|-------------|-------|
| **1** | CI/CD Eval Gates | Dev Lifecycle | 9 | 8 | **72** |
| **2** | Cost Attribution Dashboard | Observability | 9 | 8 | **72** |
| **3** | Alerting Integrations (Slack/PagerDuty) | Operations | 9 | 8 | **72** |
| **4** | Playground / Prompt Sandbox | Dev Experience | 9 | 7 | **63** |
| **5** | Online Evals (Production Traffic) | Evaluation | 9 | 7 | **63** |
| **6** | CLI for Local Eval Runner | Dev Lifecycle | 8 | 7 | **56** |
| **7** | Latency Profiling (P50/P99) | Observability | 8 | 7 | **56** |
| **8** | Framework Auto-instrumentation | Dev Experience | 8 | 7 | **56** |
| **9** | Multi-turn / Conversation Evals | Evaluation | 9 | 6 | **54** |
| **10** | RBAC / Team Access Control | Collaboration | 8 | 6 | **48** |
| **11** | Human Annotation Workflows | Evaluation | 8 | 6 | **48** |
| **12** | OpenTelemetry Native Ingestion | Observability | 8 | 6 | **48** |
| **13** | Dataset Versioning & Lineage | Data/Training | 8 | 6 | **48** |
| **14** | Prompt Version Control + Git Sync | Dev Lifecycle | 7 | 6 | **42** |
| **15** | Scorer Marketplace / Auto-generation | Evaluation | 7 | 6 | **42** |
| **16** | Statistical Significance in A/B | Evaluation | 6 | 7 | **42** |
| **17** | Synthetic Data Generation | Data/Training | 7 | 6 | **42** |
| **18** | Fine-tuning Pipeline Integration | Data/Training | 6 | 7 | **42** |
| **19** | Annotation & Review Workflows | Collaboration | 7 | 6 | **42** |
| **20** | SDK Parity (Python ↔ TS) | Dev Experience | 7 | 6 | **42** |
| **21** | Guardrails Integration | Operations | 8 | 5 | **40** |
| **22** | Rate Limiting & Quota Management | Operations | 6 | 6 | **36** |
| **23** | Memory/RAG Quality Tracking | Observability | 7 | 5 | **35** |
| **24** | Custom Dashboards | Observability | 7 | 5 | **35** |
| **25** | Red-teaming / Adversarial Testing | Evaluation | 7 | 5 | **35** |
| **26** | Model Routing & Fallback | Operations | 7 | 5 | **35** |
| **27** | Environment Management | Dev Lifecycle | 6 | 5 | **30** |
| **28** | Shared Reports & Snapshots | Collaboration | 6 | 5 | **30** |

---

## Top 10 "Must Build" Recommendations

These are the features that would most significantly close the gap with competitors and make Neon indispensable:

### Tier 1: Table Stakes (Teams Won't Adopt Without These)

1. **CI/CD Eval Gates** (Score: 72) — The #1 most requested feature in the agent eval space. Braintrust's GitHub Action and LangSmith's CI/CD pipeline are key differentiators. Without this, teams can't integrate Neon into their development workflow. *Build a GitHub Action that runs `neon eval` and posts results as PR comments with pass/fail gates.*

2. **Alerting Integrations** (Score: 72) — Alert rules exist but are UI-only. Teams need Slack/PagerDuty/webhook notifications to actually respond to regressions in production. *Add webhook destinations to existing alert rules; build Slack integration first.*

3. **Cost Attribution Dashboard** (Score: 72) — Every competitor tracks per-model, per-agent cost. Neon has cost-per-span but no aggregate attribution dashboard. *Aggregate span-level costs into per-agent, per-model, per-tool views with budget alerts.*

### Tier 2: Competitive Differentiation

4. **Playground / Prompt Sandbox** (Score: 63) — Arize Phoenix and Langfuse both offer interactive prompt testing. Users need to replay traced LLM calls and iterate on prompts without deploying. *Build a playground page that pulls prompts from the prompt registry, lets users test with different models, and compare outputs.*

5. **Online Evals** (Score: 63) — LangSmith's online evals (running scorers on production traffic in near real-time) is a major differentiator. Neon's eval pipeline is currently offline-only. *Extend the eval runner to sample and score production traces automatically.*

6. **Framework Auto-instrumentation** (Score: 56) — Langfuse and Braintrust support 13+ frameworks with one-line setup. Neon's SDK requires manual trace instrumentation. *Build auto-instrumentation packages for OpenAI SDK, LangChain, LlamaIndex, and Vercel AI SDK.*

7. **CLI for Local Eval Runner** (Score: 56) — Developers want to run evals locally before pushing. The existing Python CLI is minimal. *Extend the CLI with `neon eval run`, `neon eval watch`, and `neon traces tail` commands.*

### Tier 3: Growth & Stickiness

8. **Multi-turn Conversation Evals** (Score: 54) — LangSmith just launched this in 2025. Most agent interactions are multi-turn but Neon evaluates single traces. *Add session-level evaluation that scores entire conversations across multiple traces.*

9. **RBAC** (Score: 48) — Required for enterprise adoption. Organizations/workspaces exist but lack role-based permissions. *Add admin/editor/viewer roles at the project level.*

10. **Human Annotation Workflows** (Score: 48) — The bridge between automated and human evaluation. Create annotation queues where team members can label traces for quality. *Build annotation queue UI that feeds back into training datasets.*

---

## Competitive Positioning Summary

| Feature Area | LangSmith | Braintrust | Langfuse | Arize Phoenix | W&B Weave | **Neon** |
|-------------|-----------|------------|----------|---------------|-----------|----------|
| Tracing | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ |
| Offline Evals | ★★★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★★ |
| Online Evals | ★★★★★ | ★★★★ | ★★★ | ★★★ | ★★★ | ★☆☆☆ |
| CI/CD Integration | ★★★★★ | ★★★★★ | ★★★ | ★★ | ★★★ | ★☆☆☆ |
| Prompt Management | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★ | ★★★★ |
| Playground | ★★★★ | ★★★ | ★★★★ | ★★★★★ | ★★★ | ☆☆☆☆ |
| Cost Tracking | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★☆☆ |
| Framework Support | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★☆☆ |
| Human Annotation | ★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★ | ★☆☆☆ |
| Alerting | ★★★★★ | ★★★ | ★★★ | ★★★★ | ★★★ | ★★☆☆ |
| RBAC | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | ★☆☆☆ |
| Dataset Management | ★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★★ | ★★★☆ |
| A/B Testing | ★★★★ | ★★★★ | ★★★ | ★★★ | ★★★ | ★★★★ |
| Auto-Optimization | ★★★ | ★★★ | ★★ | ★★ | ★★ | ★★★★ |
| Self-Hosted | ☆☆☆☆ | ☆☆☆☆ | ★★★★★ | ★★★★★ | ★★★ | ★★★★ |
| Durable Execution | ☆☆☆☆ | ☆☆☆☆ | ☆☆☆☆ | ☆☆☆☆ | ☆☆☆☆ | ★★★★★ |

### Neon's Unique Advantages (Keep Investing)
1. **Durable execution via Temporal** — No competitor has this. Unique moat.
2. **Auto-optimization pipeline** — Closed-loop prompt optimization is ahead of competitors.
3. **Self-hosted friendly** — Like Langfuse/Phoenix but with more depth.
4. **Statistical rigor** — Confidence intervals, statistical guidance built into comparisons.

### Neon's Biggest Weaknesses (Fix First)
1. **No CI/CD integration** — Can't integrate into developer workflow.
2. **No framework auto-instrumentation** — Too much manual setup.
3. **No playground** — Can't iterate on prompts interactively.
4. **Alerts are UI-only** — Can't notify teams in real-time.

---

## Recommended Build Roadmap

### Phase 1 (Sprint 5-6): Developer Workflow Foundation
- CI/CD Eval Gates (GitHub Action)
- CLI local eval runner
- Alerting integrations (Slack webhook)

### Phase 2 (Sprint 7-8): Observability & Evaluation Depth
- Cost attribution dashboard
- Latency profiling (P50/P99)
- Online evals on production traffic
- Playground / Prompt sandbox

### Phase 3 (Sprint 9-10): Framework & Data Ecosystem
- Framework auto-instrumentation (OpenAI, LangChain)
- Multi-turn conversation evals
- Dataset versioning & lineage
- OTEL native ingestion

### Phase 4 (Sprint 11-12): Enterprise & Collaboration
- RBAC
- Human annotation workflows
- Annotation & review workflows
- Shared reports

---

*Analysis completed: 2026-02-12*
*Sources: Codebase analysis + competitive research (LangSmith, Braintrust, Langfuse, Arize Phoenix, W&B Weave)*
