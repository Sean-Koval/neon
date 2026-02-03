# Neon Platform Evaluation & Improvement Plan

## Executive Summary

As a staff AI/agent engineer evaluating Neon, this plan identifies what's implemented, what's lacking, and what's missing for a production-grade agent ops platform. Focus areas: tracing, evals, experimentation, improvement loops, and debugging compound AI systems (tools, MCP, skills).

---

## Current State Assessment

### Tracing Infrastructure (~60% complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Data models | **Implemented** | Rich trace/span types with ComponentType (planning, reasoning, tool, retrieval, etc.) |
| Span emission | **Partial** | Works in Temporal workers; SDKs have context management but no HTTP emission |
| ClickHouse storage | **Partial** | Batch buffering works; missing schema migrations, TTL, partitioning |
| OpenTelemetry | **Partial** | OTLP JSON ingestion; no protobuf/gRPC, limited semantic conventions |
| Online tracing | **Implemented** | Real-time via Temporal activities + batch buffer |
| Offline tracing | **Missing** | No queue/disk buffering, no edge collectors |
| Production hardening | **Missing** | No circuit breakers, dead-letter queues, PII masking, self-observability |

### Eval/Scoring System (~80% complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Test definition | **Excellent** | `defineTest`, `defineSuite`, `defineDataset` APIs with type safety |
| LLM-as-judge scorers | **Excellent** | Full Anthropic integration, templates, domain judges |
| Rule-based scorers | **Excellent** | exactMatch, contains, toolSelection, latency, tokenEfficiency |
| Causal analysis | **Good** | Root cause identification, failure chain analysis |
| Temporal orchestration | **Excellent** | evalRunWorkflow, evalCaseWorkflow with progress queries, signals |
| A/B testing | **Missing** | Manual workarounds only; no variant management, statistical comparison |
| Optimization loop | **Emerging** | Signal generation exists; no closed-loop integration |
| Python SDK parity | **Good** | Core features ready; advanced scorers pending |

### Dashboard/Monitoring (~55% complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Trace visualization | **Implemented** | Waterfall timeline, span details, color-coded types |
| Trace diff/comparison | **Implemented** | Side-by-side baseline vs candidate |
| Component correlation | **Implemented** | Correlation matrix, dependency graph |
| Eval run management | **Implemented** | Progress tracking, case-by-case results |
| Tool/skill visibility | **Basic** | Shows tool spans; no execution metrics, selection reasoning |
| Decision visualization | **Missing** | No reasoning chains, decision trees, branch visualization |
| Compound system debug | **Missing** | No multi-agent flows, orchestration graphs |
| Live debugging | **Missing** | No breakpoints, step-through, real-time streaming |
| Root cause analysis | **Missing** | Manual investigation only |

---

## Gap Analysis: What's Needed for Agent Debugging

### Critical Gaps

1. **Skill/Tool Execution Visibility**
   - Can't see: selection confidence, alternative skills considered, parameter validation
   - Can't answer: "Did the agent pick the right skill?"

2. **MCP Observability**
   - No MCP server discovery/health tracking
   - No protocol-level error tracing (connection, timeout, schema)
   - Can't debug MCP tool chains

3. **Decision/Reasoning Visualization**
   - Only see execution sequence, not decision process
   - No visibility into: planning steps, routing decisions, thought chains
   - Can't answer: "Why did the agent do X?"

4. **Compound System Debugging**
   - Can't visualize multi-agent orchestration
   - No sub-agent delegation tracking
   - No state propagation visualization

5. **Experimentation Framework**
   - No formal A/B testing
   - No statistical significance testing
   - Can't compare variants systematically

---

## Prioritized Improvements

### Phase 1: Quick Wins (Weeks 1-4)

#### 1.1 Enhanced Span Attributes for Tool/Skill Execution
- Add to spans: `skill_category`, `selection_confidence`, `selection_reason`, `alternative_skills_considered`
- Add MCP fields: `mcp_server_id`, `mcp_tool_id`, `mcp_protocol_version`
- **Files**: `packages/shared/src/types/trace.ts`, `temporal-workers/src/activities/emit-span.ts`

#### 1.2 Skill Selection Scorer
- Evaluate if correct tool/skill was selected
- Support expected tool chains and ordering
- **Files**: `packages/sdk/src/scorers/skill-selection.ts` (new)

#### 1.3 Tool Execution Metrics Dashboard
- Card showing: most used tools, success/failure rates, latency per tool
- **Files**: `frontend/components/dashboard/tool-metrics.tsx` (new)

#### 1.4 Span Detail Enhancement
- Show skill selection context in span detail panel
- Display alternatives considered, confidence, reasoning
- **Files**: `frontend/components/traces/span-detail.tsx`

### Phase 2: Core Debugging (Weeks 5-12)

#### 2.1 MCP Observability Integration
- MCP tracing middleware with rich attributes
- Server health monitoring
- MCP topology dashboard view
- **Files**: `temporal-workers/src/activities/mcp-tracing.ts` (new), `frontend/components/traces/mcp-server-view.tsx` (new)

#### 2.2 Decision/Reasoning Visualization
- Decision tree component showing branch points
- Highlight planning, routing, tool selection spans
- Link decisions to outcomes
- **Files**: `frontend/components/traces/reasoning-flow.tsx` (new)

#### 2.3 Compound System Debugging View
- Multi-agent execution flow visualization
- Cross-component correlation
- Agent-to-agent communication tracing
- **Files**: `frontend/components/traces/compound-system-view.tsx` (new)

#### 2.4 Skill Evaluation Framework
- `defineSkillEval` API for skill-specific testing
- Parameter accuracy, result quality scorers
- Per-skill regression tracking
- **Files**: `packages/sdk/src/skill-eval.ts` (new)

### Phase 3: Experimentation (Weeks 13-18)

#### 3.1 A/B Testing Framework
- `defineVariant` API in SDK
- Statistical significance testing (t-test, bootstrap CI)
- Comparison dashboard with confidence intervals
- **Files**: `packages/sdk/src/comparison/` (new directory)

#### 3.2 Offline Tracing
- Local disk buffering when API unavailable
- Configurable flush strategies
- Replay capability for offline traces
- **Files**: `packages/sdk/src/tracing/offline-buffer.ts` (new)

### Phase 4: Advanced (Weeks 19+)

#### 4.1 Live Debugging Mode
- WebSocket-based trace streaming
- Breakpoint definition at span level
- Step-through execution
- **Depends on**: Phase 2 visualization work

#### 4.2 Automated Root Cause Analysis
- ML-based pattern detection in failures
- Cross-trace correlation for systemic issues
- Hypothesis generation with evidence
- **Depends on**: Sufficient trace data

#### 4.3 Closed-Loop Optimization
- Connect signal generation to training pipelines
- Auto-generate test cases from failures
- Feedback loop from preferences to prompts
- **Depends on**: A/B testing framework

---

## Key Files for Implementation

| File | Purpose |
|------|---------|
| `packages/shared/src/types/trace.ts` | Core span/trace types - extend for skill/MCP attributes |
| `temporal-workers/src/activities/emit-span.ts` | Span emission - add skill context, MCP data |
| `packages/sdk/src/scorers/base.ts` | Scorer foundation - pattern for new scorers |
| `frontend/components/traces/span-detail.tsx` | Span visualization - enhance for skill context |
| `frontend/components/traces/trace-timeline.tsx` | Timeline view - pattern for new visualizations |
| `packages/sdk/src/test.ts` | Test definition API - extend for skill evals |

---

## Verification Plan

### For Phase 1 (Quick Wins)
1. Create test traces with tool/skill spans including new attributes
2. Run skill selection scorer against sample traces
3. Verify dashboard shows tool metrics correctly
4. Check span detail displays skill context

### For Phase 2 (Core Debugging)
1. Trace an MCP-heavy agent run, verify MCP attributes captured
2. Run multi-step reasoning agent, verify decision tree renders
3. Execute multi-agent workflow, verify compound view works
4. Run skill evals, verify per-skill tracking

### For Phase 3 (Experimentation)
1. Define A/B variants, run both, verify statistical comparison
2. Run agent offline, verify traces buffered and replayed

### End-to-End Test
```bash
# 1. Start infrastructure
docker compose up -d

# 2. Run example agent with enhanced tracing
bun run --filter @neon/sdk test

# 3. Verify traces in dashboard
# - Check tool/skill attributes visible
# - Check decision visualization renders
# - Check skill evaluation scores

# 4. Run A/B comparison (once implemented)
bun run --filter @neon/sdk compare --baseline v1 --candidate v2
```

---

## Recommendation

**Start with Phase 1 Quick Wins** - they provide immediate value for debugging compound AI systems with minimal effort. The enhanced span attributes (1.1) and skill selection scorer (1.2) directly answer the key question: "Did the agent pick the right skill?"

**Then prioritize Phase 2.1-2.3** for comprehensive debugging visibility. MCP observability and decision visualization are critical for understanding why agents behave as they do.

**Defer Phase 4** until Phases 1-3 are stable - advanced features like live debugging require solid infrastructure.
