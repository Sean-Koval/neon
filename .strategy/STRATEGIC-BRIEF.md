# Neon Strategic Brief: The Future of AgentOps

> Synthesized from 5 parallel research streams: Market Research, Codebase Analysis, Product Trajectory, Gap Analysis, Future Architecture
>
> **Date:** 2026-02-12 | **Status:** Ready for Decision

---

## I. Where We Are Today

### Platform Scorecard

| Dimension | Score | Summary |
|-----------|-------|---------|
| Infrastructure Stack | **9/10** | ClickHouse + Temporal + Redpanda is best-in-class |
| Core IP (Training Loop, Trajectory Scorers) | **8/10** | Genuinely differentiated — no competitor matches |
| TypeScript SDK | **8/10** | 20+ scorers, 13 span types, 4 ML export formats |
| tRPC API Layer | **8/10** | 18 routers, well-validated, comprehensive |
| ClickHouse Schema | **8/10** | Materialized views, proper partitioning |
| Monorepo Structure | **8/10** | Clean workspaces, Turbo + Bun |
| Frontend Completeness | **4/10** | 20+ pages exist but many are thin, ~120 tickets planned |
| Python SDK | **6/10** | Functional but lacks trajectory scorers, thinner tests |
| Testing | **7/10** | Strong on core IP, gaps in E2E and Python |
| **OVERALL** | **7.5/10** | Strong backend, frontend is the bottleneck |

### What Makes Neon Unique (Preserve These)

1. **Durable Execution via Temporal** — NO competitor has this. Evals never fail silently. Retries, timeouts, signal handling for free. This is the #1 moat.
2. **Closed-Loop Training Workflow** — collect → curate → optimize → evaluate → deploy → monitor → re-trigger. The only platform that actively improves agents, not just observes them.
3. **Trajectory Scorers** — `path_optimality`, `step_consistency`, `recovery_efficiency`, `plan_adherence`. Agent-level scoring that goes beyond LLM output quality.
4. **ML Export Formats** — OpenAI fine-tuning, HuggingFace TRL, DSPy, Agent Lightning. Bridges observability → improvement.
5. **Auto-Test-Case Generation from Anomalies** — Production failures automatically become regression tests.
6. **Self-Hosted Docker Compose** — Full platform, no feature gates, enterprise data residency.

---

## II. The Market Landscape

### Market Size
- **$7.63B (2025) → $182.97B by 2033** (49.6% CAGR)
- 89% of orgs have agent observability, 57% have agents in production
- Quality is #1 barrier (32%), latency #2 (20%)

### The Shift: LLMOps → AgentOps
- **2023-24:** Log prompt/response, track tokens (Helicone era)
- **2025:** Agent-aware tracing, tool calls, RAG pipelines (LangSmith era)
- **2026+:** Full agent lifecycle — build, test, deploy, monitor, optimize (Neon's opportunity)

Most tools were built for the LLM era and are retrofitting agent support. Neon can leapfrog by being **agent-native from day one**.

### Competitive Positioning

```
                    Agent-Native ↑
                                |
              Neon (target) ◆   |   ◆ AgentOps.ai
                                |
                    ◆ LangWatch |
                                |
   ◆ Galileo        ◆ Maxim    |
                                |
 Eval-Only ←--------+---------→ Full Platform
                                |
                    ◆ W&B Weave |
         ◆ DeepEval             |   ◆ Braintrust
                                |
              ◆ TruLens         |   ◆ LangSmith
                                |
   ◆ Arize Phoenix  ◆ Langfuse |
         ◆ Helicone  ◆ Portkey |
                                |
                    LLM-Native ↓
```

**Neon's target: Agent-native + Full platform.** Nobody occupies this space today.

### Where Neon Leads

| Capability | Neon | Best Competitor |
|-----------|------|-----------------|
| Durable Execution | ★★★★★ | None (unique) |
| Auto-Optimization | ★★★★ | Opik (agent optimizer) |
| Regression Detection | ★★★★ | Braintrust (statistical) |
| Self-Hosted | ★★★★ | Langfuse (MIT, 19k stars) |
| Trajectory Scoring | ★★★★ | DeepEval (basic) |
| A/B Testing | ★★★★ | Braintrust |

### Where Neon Trails

| Capability | Neon | Best Competitor |
|-----------|------|-----------------|
| CI/CD Integration | ★☆☆☆ | Braintrust (native GH Action) |
| Playground | ☆☆☆☆ | Arize Phoenix |
| Framework Auto-Instrumentation | ★★☆☆ | Langfuse (50+ frameworks) |
| Alerting (external) | ★★☆☆ | LangSmith (proactive) |
| Cost Attribution | ★★☆☆ | LangSmith |
| RBAC | ★☆☆☆ | LangSmith (enterprise) |

---

## III. The 10x Product Vision

### Positioning Statement

> **"The agent evaluation platform with durable execution."**
>
> Neon doesn't just observe your agents — it makes them better. The only platform that combines durable execution, continuous evaluation, and closed-loop optimization in a single self-hosted package.

### The Six Pillars

#### Pillar 1: Continuous Production Evaluation
Shadow-score every production trace. Detect regressions across deployments automatically. SLO-based alerts via Slack/PagerDuty. Canary evaluation on new agent versions.

**Why it matters:** Teams currently evaluate pre-deployment and hope for the best. Continuous eval catches regressions in hours, not weeks.

#### Pillar 2: Agent-Native Debugging
Step through agent reasoning. Time-travel replay (rewind to any span). Counterfactual analysis ("what if the agent had chosen tool B?"). Live production attach. Memory state inspection.

**Why it matters:** Current debugging is "look at logs and guess." Agent-native debugging is "step through reasoning like a real debugger."

#### Pillar 3: AI-Powered Eval Generation
Generate test suites from production traces automatically. Coverage analysis identifies blind spots. Failure-driven test creation. Adversarial test generation.

**Why it matters:** Writing evals is the #1 bottleneck. Auto-generation from production traffic 10x's coverage.

#### Pillar 4: Self-Healing Agents
Auto-fix from eval failures. Continuous prompt evolution. Multi-objective optimization (quality + cost + latency). Knowledge distillation from successful runs.

**Why it matters:** The ultimate stickiness mechanism. Agents that automatically improve from their own production data.

#### Pillar 5: Developer Workflow Integration
CI/CD eval gates (GitHub Action). CLI-first local development. Framework auto-instrumentation (1-line setup). Local-first mode (no server needed). VS Code extension.

**Why it matters:** If it's not in the developer workflow, it's shelfware.

#### Pillar 6: Plugin Ecosystem
Custom scorers as plugins. Integration marketplace (Slack, PagerDuty, GitHub). MCP server (agents can query their own eval data). Community scorer library.

**Why it matters:** Platform extensibility is what separates tools from ecosystems.

---

## IV. The Gap-Priority Matrix (Top 15)

Sorted by Impact × Feasibility:

| Rank | Gap | Category | Score | Effort |
|------|-----|----------|-------|--------|
| **1** | CI/CD Eval Gates (GitHub Action) | Dev Workflow | **72** | 2 weeks |
| **2** | Cost Attribution Dashboard | Observability | **72** | 2 weeks |
| **3** | Alerting Integrations (Slack/PagerDuty/Webhook) | Operations | **72** | 1 week |
| **4** | Playground / Prompt Sandbox | Dev Experience | **63** | 3 weeks |
| **5** | Online Evals (Production Traffic) | Evaluation | **63** | 3 weeks |
| **6** | CLI Local Eval Runner | Dev Workflow | **56** | 2 weeks |
| **7** | Latency Profiling (P50/P99) | Observability | **56** | 1 week |
| **8** | Framework Auto-Instrumentation | Dev Experience | **56** | 3 weeks |
| **9** | Multi-turn Conversation Evals | Evaluation | **54** | 2 weeks |
| **10** | RBAC / Team Access Control | Collaboration | **48** | 3 weeks |
| **11** | Human Annotation Workflows | Evaluation | **48** | 3 weeks |
| **12** | OTel Native Ingestion | Observability | **48** | 2 weeks |
| **13** | Dataset Versioning & Lineage | Data/Training | **48** | 2 weeks |
| **14** | Statistical Significance in A/B | Evaluation | **42** | 1 week |
| **15** | SDK Parity (Python ↔ TS) | Dev Experience | **42** | 3 weeks |

---

## V. Critical Bugs & Tech Debt (Fix Now)

1. **Training loop bug** — `curateTrainingData([], {...})` passes empty array instead of collected signals at `training-loop.ts:251`. Core IP is broken.
2. **Monolithic scorer file** — `score-trace.ts` at 1,066 lines. Split into separate scorer modules.
3. **21K-line page.tsx** — Command center needs component decomposition.
4. **ClickHouse singleton** — No connection pooling or circuit breaker in temporal workers.
5. **Python SDK `_run_sync`** — Threading hack for nested event loops is fragile.

---

## VI. Recommended Build Roadmap

### Phase 1: Developer Workflow Foundation (Sprint 5-6, ~4 weeks)
**Goal:** Make Neon usable in real development workflows

| Item | Effort | Impact |
|------|--------|--------|
| Fix training loop bug (empty array) | 1 day | Core IP fix |
| CI/CD Eval Gates (GitHub Action) | 2 weeks | Table stakes |
| Alerting integrations (Slack webhook) | 1 week | Production readiness |
| CLI local eval runner (`neon eval run`) | 2 weeks | Developer adoption |
| Cost attribution dashboard | 2 weeks | Competitive parity |

### Phase 2: Observability & Evaluation Depth (Sprint 7-8, ~4 weeks)
**Goal:** Match competitor depth, extend unique advantages

| Item | Effort | Impact |
|------|--------|--------|
| Online evals on production traffic | 3 weeks | Differentiator |
| Playground / Prompt sandbox | 3 weeks | Table stakes |
| Latency profiling (P50/P99) | 1 week | Competitive parity |
| Multi-turn conversation evals | 2 weeks | Agent-native |
| Statistical significance in A/B (t-test, Bayesian) | 1 week | Rigor |

### Phase 3: Framework Ecosystem & Data (Sprint 9-10, ~4 weeks)
**Goal:** Zero-friction adoption, data pipeline maturity

| Item | Effort | Impact |
|------|--------|--------|
| Framework auto-instrumentation (OpenAI, LangChain, Anthropic) | 3 weeks | Adoption multiplier |
| OTel native ingestion (OTLP endpoint) | 2 weeks | Enterprise integration |
| Dataset versioning & lineage | 2 weeks | Training pipeline |
| Python SDK parity (trajectory scorers, tests) | 3 weeks | Dual-SDK promise |

### Phase 4: Enterprise & Intelligence (Sprint 11-12, ~4 weeks)
**Goal:** Enterprise readiness, AI-powered features

| Item | Effort | Impact |
|------|--------|--------|
| RBAC (admin/editor/viewer) | 3 weeks | Enterprise gate |
| Auto test case generation from traces | 3 weeks | 10x test coverage |
| NL query engine (text-to-ClickHouse SQL) | 2 weeks | Self-serve analytics |
| Human annotation workflows | 3 weeks | Quality feedback loop |

### Phase 5: Next-Gen Architecture (Q3-Q4 2026)
**Goal:** Platform evolution

| Item | Effort | Impact |
|------|--------|--------|
| Agent graph data model + visualization | 3 weeks | Multi-agent |
| WebSocket debug protocol (time-travel, hot-patch) | 3 weeks | Best-in-class debugging |
| Plugin system (scorer marketplace) | 4 weeks | Ecosystem |
| MCP server integration | 2 weeks | Agent self-evaluation |
| Local-first mode (chdb + SQLite) | 2 weeks | Offline development |
| VS Code extension | 6 weeks | IDE-native |

---

## VII. Strategic Decisions Needed

### Decision 1: Open Source Strategy
- **Option A:** Keep closed-source, compete on features (like Braintrust)
- **Option B:** Open-core (MIT core, enterprise features paid) — like Langfuse (19k stars)
- **Option C:** Fully open-source, monetize on cloud hosting (like Arize Phoenix)
- **Recommendation:** Option B. Langfuse proves OSS drives adoption in this market. Core platform MIT, charge for: RBAC, SSO, advanced analytics, SLA.

### Decision 2: UI Rework vs Feature Depth
- **Option A:** Complete the ~120 UI rework tickets first (bring frontend to 8/10)
- **Option B:** Build missing features first (CI/CD, alerting, playground) even with rough UI
- **Recommendation:** Option B. Missing features (CI/CD, alerting) block adoption entirely. Polish can follow.

### Decision 3: Framework Focus
- **Option A:** Framework-agnostic (OpenTelemetry-native, no specific framework support)
- **Option B:** Targeted integrations (OpenAI, LangChain, CrewAI, Anthropic first)
- **Recommendation:** Both. OTel for the standard, targeted auto-instrumentation for DX.

### Decision 4: Pricing Model
- **Tier 1 (Free):** Self-hosted, unlimited traces, community scorers
- **Tier 2 (Team, ~$49/seat/mo):** Cloud hosted, 100k traces/mo, alerting, CI/CD
- **Tier 3 (Enterprise, custom):** RBAC, SSO, dedicated ClickHouse, SLA, audit logs
- **Key insight:** Braintrust's jump from free to $249/mo loses mid-market. Langfuse's MIT + cloud works.

---

## VIII. The One-Line Vision

**Neon is the platform that makes agents better at being agents — not just measuring them, but continuously improving them through a durable, closed-loop feedback system that no other tool in the market can match.**

---

## Appendix: Full Research Reports

- `.strategy/market-research.md` — 480 lines, 15 competitors, market sizing, trends
- `.strategy/codebase-analysis.md` — 366 lines, architecture review, tech debt map
- `.strategy/product-trajectory.md` — Feature inventory, 10x vision, PMF signals
- `.strategy/gap-analysis.md` — 28 gaps prioritized, competitive positioning table
- `.strategy/future-architecture.md` — 1,225 lines, data models, real-time infra, plugins, AI features, scale
