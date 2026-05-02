# Neon Codebase Architecture Analysis

## Executive Summary

Neon is a **156K+ LoC TypeScript + 204K LoC Python** agent evaluation platform built as a Turbo monorepo. The architecture is ambitious and well-structured, with genuine differentiation in its closed-loop training system and trajectory-aware scorers. The codebase has strong foundational patterns but some areas where depth exceeds polish.

**Overall Assessment: 7.5/10** — Solid technical foundation with clear vision, strong in some areas, needing maturation in others.

---

## 1. Monorepo Architecture

**Quality: 8/10 | Completeness: 9/10 | Differentiation: 5/10**

### Strengths
- **Clean workspace structure**: 6 well-defined packages (`frontend`, `@neon/sdk`, `neon-sdk-python`, `@neon/shared`, `@neon/temporal-client`, `@neon/temporal-workers`)
- **Turbo orchestration**: Proper `turbo.json` with task dependencies (`dependsOn: ["^build"]`), caching, persistent dev mode
- **Bun + uv**: Fast, modern package managers for both ecosystems
- **Docker Compose**: Complete one-command self-hosted deployment with health checks, profiles (debug, infra-only), and proper service dependencies

### Weaknesses
- **No workspace versioning**: No changesets/release tooling — would be needed for public SDK distribution
- **Thin shared package**: `@neon/shared` likely under-utilized; some types duplicated across SDK and workers
- **No Nx-style affected-based testing** — Turbo handles this, but at a coarser level

### Infrastructure Stack
| Component | Technology | Assessment |
|-----------|-----------|------------|
| Analytics DB | ClickHouse 24.3 | Excellent choice for trace storage |
| Metadata DB | Postgres 16 | Standard, reliable |
| Workflows | Temporal 1.25.2 | Best-in-class durable execution |
| Streaming | Redpanda v24.1.1 | Good Kafka-compatible alternative |
| Telemetry | OTel Collector 0.96 | Industry standard |
| Frontend | Next.js 16 + React 19 | Cutting-edge stack |

**Verdict**: The infrastructure stack is _excellent_ — arguably the strongest part of the product. ClickHouse + Temporal + Redpanda is a modern, scalable foundation that very few competitors match.

---

## 2. Core IP Assessment

**Quality: 7/10 | Completeness: 7/10 | Differentiation: 8/10**

### 2a. Scoring Engine (`temporal-workers/src/activities/score-trace.ts`)
- **30K+ lines** — the largest single file, which is a code smell
- **19 built-in scorers** across 4 categories:
  - Performance: `latency`, `error_rate`, `token_efficiency`
  - Tool usage: `tool_selection` (F1 metric), `tool_sequence` (exact match)
  - Output validation: `contains`, `regex_match`, `exact_match`, `json_valid`, `output_length`
  - **Trajectory (differentiator)**: `path_optimality`, `step_consistency`, `recovery_efficiency`, `plan_adherence`
  - LLM Judge: `response_quality`, `hallucination`, `relevance`, `coherence`, `safety`
- **Extensible registry**: `registerScorer()` for custom scorers
- **LLM Judge** uses `@neon/llm-providers` abstraction — model-agnostic

**Assessment**: The trajectory scorers (`path_optimality`, `step_consistency`, `recovery_efficiency`, `plan_adherence`) are genuinely differentiated. No major competitor (LangSmith, Braintrust, AgentOps) offers trajectory-level scoring natively. The `step_consistency` scorer with contradiction detection using an opposites dictionary is particularly clever.

**Gap**: The trajectory scorers are rule-based heuristics. A hybrid approach combining heuristics with LLM-based trajectory evaluation would be more robust.

### 2b. Training Loop Workflow (`temporal-workers/src/workflows/training-loop.ts`)
- **State machine**: IDLE → COLLECTING → CURATING → OPTIMIZING → EVALUATING → DEPLOYING → MONITORING
- **Signal handlers**: Pause/resume/abort/approve/reject/skip via Temporal signals
- **Approval gates**: Auto-approve (score > threshold), auto-reject (score < threshold), human-in-the-loop for edge cases
- **Regression-triggered re-entry**: If monitoring detects regression, loops back to COLLECTING
- **Progressive rollout integration**: Deploys via child workflow with staged rollout (10% → 25% → 50% → 100%)

**Assessment**: This is **genuinely differentiated**. The closed-loop training workflow that goes collect → curate → optimize → evaluate → deploy → monitor → (regression?) → re-collect is a powerful concept. The Temporal-based implementation gives it durability guarantees that no competitor matches.

**Gap**: The curating stage passes empty array (`[]`) to `curateTrainingData` instead of the collected signals — this looks like a bug at `training-loop.ts:251`.

### 2c. Training Activities (`temporal-workers/src/activities/training-activities.ts`)
- **Signal collection**: Queries ClickHouse for feedback signals, low-score traces, error traces
- **Curation pipeline**: Deduplication (hash-based), quality filtering, class balancing (cap at 60% per type), diversity selection (Jaccard similarity greedy selection)
- **Optimization strategies**:
  - `example_selection`: Extract diverse high-quality examples for few-shot prompting
  - `instruction_optimization`: LLM-based prompt improvement using good/bad example contrast
  - Template fallback when no LLM provider configured
- **Regression detection**: Rolling average + 2σ threshold with severity classification

**Assessment**: The curation pipeline (dedup → quality → balance → diversity) is solid engineering. The Jaccard-based diversity selection is a nice touch. The optimization strategies are functional but basic — a real production system would need more sophisticated approaches (DSPy-style optimization, OPRO, etc.)

### 2d. A/B Testing & Progressive Rollout (`temporal-workers/src/workflows/optimization.ts`)
- **A/B Test Workflow**: Parallel variant evaluation, winner determination with significance threshold, query support for progress
- **Progressive Rollout**: Staged deployment (configurable stages), automatic abort on score regression, full observability
- Both use child workflows for evaluation — proper Temporal composition

**Assessment**: Clean implementation. The progressive rollout with automatic abort is production-grade. The statistical significance calculation is simplistic (relative improvement vs threshold, not proper statistical testing) — would benefit from t-tests or Bayesian approaches.

### 2e. Anomaly Detection & Auto-Test-Case Generation
- **Anomaly detection**: Statistical detection via `detectScoreAnomalies` in ClickHouse
- **Auto test case generation**: Extracts input/output from anomalous traces to create regression test cases
- **tRPC integration**: Full API for detect → create test cases flow

**Assessment**: This is a strong differentiator — automatically converting production anomalies into test cases is a workflow that teams desperately need but few platforms offer.

---

## 3. SDK Quality

### TypeScript SDK (`packages/sdk/src/`)

**Quality: 8/10 | Completeness: 9/10 | Differentiation: 7/10**

- **636-line barrel export** with excellent API surface:
  - Client (`Neon`, `createNeonClient`)
  - Test definitions (`defineTest`, `defineSuite`, `run`)
  - Scorer library (20+ scorers across 7 categories: base, LLM judge, rule-based, causal analysis, skill selection, parameter accuracy, result quality, trajectory)
  - Tracing (13+ span types: `trace`, `span`, `generation`, `tool`, `retrieval`, `reasoning`, `planning`, `prompt`, `routing`, `memory`, `mcp`, `handoff`, `delegate`)
  - Cloud sync, threshold configuration, CI/CD JSON output
  - Export formats (OpenAI fine-tuning, HuggingFace TRL, Agent Lightning, DSPy)
  - Comparison framework (A/B testing with statistical utilities)
  - Skill evaluation framework
  - Debugging (breakpoints for trace inspection)

- **Strengths**:
  - Rich scorer ecosystem — causal analysis, skill selection, parameter accuracy are unique
  - Export to 4 ML training formats (OpenAI, TRL, DSPy, Agent Lightning) — nobody else does this
  - W3C Trace Context propagation — proper distributed tracing
  - Offline buffer with configurable flush strategy
  - MCP health tracking built-in

- **Weaknesses**:
  - Large barrel export (636 lines) — tree-shaking might not fully optimize
  - Some legacy aliases (`containsScorer` vs `contains`) — API surface could be tighter
  - No published npm package — limited external adoption potential

### Python SDK (`packages/neon-sdk-python/`)

**Quality: 7/10 | Completeness: 6/10 | Differentiation: 5/10**

- **Client**: Async-first with sync wrapper via threading fallback
- **Tracing**: Context-managed spans (`with trace()`, `with generation()`)
- **Scorers**: Rule-based, LLM judge, causal analysis
- **Types**: Pydantic models with proper aliasing
- **Integrations**: Agent Lightning, DSPy, OpenAI fine-tuning, HuggingFace TRL

- **Strengths**:
  - Clean Pythonic API (`with trace("agent"):`)
  - Pydantic v2 for validation
  - Both async and sync clients
  - Optional dependencies via extras (`[temporal]`, `[clickhouse]`, `[all]`)

- **Weaknesses**:
  - Fewer scorers than TypeScript SDK (no skill selection, parameter accuracy, result quality)
  - No trajectory scorers in Python
  - Thinner test coverage (1,505 lines vs 13,386 for TS SDK)
  - `_run_sync` uses threading hack for nested event loops — fragile

**SDK Comparison vs Competitors**:
| Feature | Neon TS SDK | Neon Python SDK | LangSmith | Braintrust |
|---------|-----------|---------------|-----------|------------|
| Tracing | 13+ span types | 10+ span types | Good | Good |
| Scorers | 20+ built-in | 10+ built-in | 5-6 | 10+ |
| Trajectory | Yes | No | No | No |
| ML Export | 4 formats | 4 formats | No | No |
| A/B Testing | Full framework | No | No | Yes |
| MCP Support | Yes | No | No | No |
| Debugging | Breakpoints | No | Playground | No |

---

## 4. Data Layer

**Quality: 8/10 | Completeness: 8/10 | Differentiation: 7/10**

### ClickHouse Schema (389 lines)
- **5 core tables**: `traces`, `spans`, `scores`, `prompts`, `feedback`
- **7 materialized views**: `daily_stats_mv`, `model_usage_mv`, `score_trends_full_mv`, `duration_stats_mv`, `run_scores_mv`, `daily_run_summary_mv`, `scorer_stats_mv`
- **Index strategy**: Proper use of bloom_filter, set, minmax skip indexes with documented granularity rationale
- **Partitioning**: Monthly by date, 90-day TTL on traces/spans/scores, 365-day on prompts
- **ORDER BY**: `(project_id, ...)` ensures project isolation is fast

**Strengths**:
- Well-documented schema with query pattern annotations
- Materialized views for <100ms dashboard queries — excellent for real-time dashboard
- AggregatingMergeTree with `avgState`/`quantileState` for proper aggregation
- SummingMergeTree for simple counters — correct engine selection

**Weaknesses**:
- No feedback table in init SQL (referenced in training activities but not in schema)
- 90-day TTL is short for enterprise customers
- No multi-tenancy at ClickHouse level (relies on application-level project_id filtering)

### tRPC API Surface (18 routers)
Comprehensive coverage: traces, scores, workflows, analytics, evals, suites, skills, dashboard, feedback, prompts, compare, agents, alertRules, experiments, datasets, trainingLoops, anomalies, organizations/workspaces

**Strengths**:
- Clean separation per domain
- Proper Zod validation on all inputs
- Parallel Promise.all for dashboard queries
- Graceful ClickHouse connection error handling with fallback data

---

## 5. Frontend

**Quality: 7/10 | Completeness: 7/10 | Differentiation: 6/10**

### Page Coverage (20+ pages)
| Page | Status | Notes |
|------|--------|-------|
| Command Center (/) | Complete | Dashboard with env selector, agent health, alerts |
| Traces | Complete | List + detail + diff views |
| Eval Runs | Complete | List + detail with progress |
| Suites | Complete | List + detail + create |
| Experiments | Complete | List + detail (A/B tests) |
| Prompts | Complete | List + detail with versioning |
| Agents | Complete | Registry with health status |
| Compare | Complete | Side-by-side comparison |
| Feedback | Complete | Preference/correction collection |
| Analysis | Complete | Pattern analysis page |
| Optimization | Complete | Optimization dashboard |
| Training | Complete | Training loop management |
| Skills | Complete | Skill evaluation |
| Alerts | Complete | Alert rules management |
| Settings | Complete | Configuration |
| Workflows | Complete | Temporal workflow viewer |
| Workers | Complete | Worker status |
| MCP | Complete | MCP integration page |
| Analytics | Complete | Usage analytics |

### Component Count: 125 TSX components

**Strengths**:
- Modern stack: Next.js 16 + React 19 + Turbopack
- Comprehensive page coverage — most features have UI
- tRPC for type-safe API calls
- `useDashboard` hook with parallel data fetching

**Weaknesses**:
- Main page.tsx is 21K+ lines — needs component decomposition
- Some pages may be thin wrappers without deep interactivity
- No Storybook or component documentation

---

## 6. Test Coverage

**Quality: 7/10 | Completeness: 7/10**

### Test Matrix
| Area | Test Files | Total Lines | Coverage |
|------|-----------|-------------|----------|
| Temporal Workers | 14 files | 7,045 lines | Good - all activities tested |
| TypeScript SDK | 19+ files | 13,386 lines | Excellent - comprehensive |
| Python SDK | 4 files | 1,505 lines | Basic - needs expansion |
| Frontend | 12 files | ~2,000 lines | Moderate - integration + security |

### CI Pipeline
- **PR workflow**: TypeCheck → Test with Coverage → Summary (Bun)
- **Python workflow**: Ruff lint → Mypy → Pytest with coverage
- Timeout: 10 minutes per job
- Dependency caching via Bun lock hash

**Strengths**:
- Score-trace tests are comprehensive (2,134 lines) — the core IP is well-tested
- Security multi-tenant test exists
- Integration tests cover full API lifecycle (traces, scores, suites, eval runs)

**Weaknesses**:
- No E2E tests (Playwright installed but no test files)
- No load/performance testing
- Python SDK test coverage is thin relative to feature surface

---

## 7. Tech Debt Hotspots

### Critical
1. **`score-trace.ts` at 1,066 lines** — monolithic file with all scorers. Should be split into separate scorer modules
2. **Training loop passes empty array** at `training-loop.ts:251` — `curateTrainingData([], {...})` discards collected signals
3. **`page.tsx` at 21K+ lines** — command center needs decomposition into sub-components

### Moderate
4. **ClickHouse singleton pattern** in temporal workers — no connection pooling or circuit breaker
5. **`_run_sync` in Python SDK** — threading hack for nested event loops is fragile in production
6. **No error typing** — errors are `instanceof Error` checks throughout, no custom error hierarchy
7. **Hard-coded thresholds** in scorers (e.g., latency: `<1000ms = 1.0`, `<3000ms = 0.9`) — should be configurable

### Minor
8. **Legacy scorer aliases** (`containsScorer` vs `contains`) — API surface debt
9. **Missing feedback table** in ClickHouse init SQL
10. **No database migrations** — schema changes require manual intervention

---

## 8. What's Working Well (Preserve & Double Down)

1. **Temporal-based durable execution** — This is the strongest architectural decision. Competitors use bare async or simple job queues. Temporal gives you signal handling, queries, retries, timeouts, and durability for free.

2. **ClickHouse materialized views** — Pre-aggregated dashboard data is a real competitive advantage. <100ms query latency matters for daily-use dashboards.

3. **Trajectory scorers** — `path_optimality`, `step_consistency`, `recovery_efficiency`, `plan_adherence` are genuinely novel. No major competitor has these.

4. **Closed-loop training workflow** — The collect → curate → optimize → evaluate → deploy → monitor cycle is the vision. This is what makes the platform more than just another observability tool.

5. **ML export formats** — Exporting to OpenAI fine-tuning, TRL, DSPy, and Agent Lightning directly from traces is unique. This bridges observability and improvement.

6. **Auto-test-case generation from anomalies** — Turning production failures into test cases automatically is powerful.

7. **Comprehensive tRPC API** — 18 routers with proper validation, error handling, and parallel queries.

---

## 9. Scalability Assessment

### Can handle 10x scale:
- ClickHouse: Designed for billions of rows, partitioned correctly
- Temporal: Horizontally scalable, proven at Uber/Stripe scale
- Redpanda: High-throughput streaming with low resource usage
- Postgres: Metadata-only, minimal write pressure

### Concerns at 100x:
- **Single ClickHouse instance**: Would need clustering (ReplicatedMergeTree, distributed tables)
- **No tenant isolation at infrastructure level**: All data in one ClickHouse instance with project_id filtering
- **OTel Collector bottleneck**: Single instance, needs horizontal scaling
- **Temporal worker scaling**: Single worker container, needs replica configuration
- **No queue/backpressure**: Scoring activities are synchronous per trace — could overwhelm LLM judge calls at scale

### Recommendations for scale:
1. Add ClickHouse cluster support with shard/replica configuration
2. Implement rate limiting on LLM judge calls
3. Add Temporal worker auto-scaling based on queue depth
4. Consider tenant-level resource quotas
5. Add caching layer (Redis) for hot dashboard queries

---

## 10. Architecture Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Monorepo Structure | 8/10 | Clean workspaces, good tooling |
| Core Scoring Engine | 7/10 | Rich but monolithic, trajectory scorers are novel |
| Training Loop (Core IP) | 8/10 | Genuinely differentiated, well-designed state machine |
| TypeScript SDK | 8/10 | Comprehensive API surface, excellent export formats |
| Python SDK | 6/10 | Functional but thin vs TS SDK |
| ClickHouse Schema | 8/10 | Well-designed with materialized views |
| tRPC API Layer | 8/10 | Complete, well-validated |
| Frontend | 7/10 | Comprehensive pages but some monolithic components |
| Testing | 7/10 | Good coverage on core IP, gaps in E2E and Python |
| Infrastructure | 9/10 | Best-in-class stack selection |
| Scalability | 7/10 | Solid at 10x, needs work for 100x |
| Developer Experience | 7/10 | Good local dev, needs onboarding docs |
| **OVERALL** | **7.5/10** | |

---

## Key Recommendations

### Immediate (Sprint-level)
1. Fix training loop bug (empty array to curateTrainingData)
2. Split `score-trace.ts` into separate scorer modules
3. Decompose `page.tsx` command center

### Short-term (1-2 months)
4. Add proper statistical significance to A/B testing (t-test, Bayesian)
5. Port trajectory scorers to Python SDK
6. Add E2E tests with Playwright
7. Implement configurable scorer thresholds

### Medium-term (3-6 months)
8. ClickHouse clustering for multi-tenant scale
9. DSPy-style optimization integration (beyond template-based)
10. Public SDK distribution (npm, PyPI)
11. Database migration tooling
