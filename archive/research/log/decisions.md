# Decision Log

> Record of significant decisions made during this project.

## D1: Build on MLflow 3.0, Not From Scratch

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
Initial project ideas (AgentOps Console, Dataset Labeling + Eval) assumed building tracing and evaluation from scratch. Research revealed MLflow 3.0 has substantial GenAI features.

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A: Build from scratch** | Full control, differentiated | Massive effort, reinventing wheel |
| **B: Build on MLflow** | Leverage existing infra, faster | Dependency on MLflow stability |
| **C: Build on Arize Phoenix** | Open source, good agent support | Less adoption than MLflow |

### Decision
**Option B: Build on MLflow 3.0**

### Rationale
- MLflow already has tracing, spans, LLM judges, framework integrations
- Massive existing adoption — users already have MLflow
- Clear extension points (Scorer class)
- Focus effort on differentiated value (agent-specific scorers, CI/CD)

### Consequences
- Dependent on MLflow API stability
- Need to stay current with MLflow releases
- Can't diverge from MLflow's data model

---

## D2: Agent-Specific Scorers as Core Differentiator

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
Generic LLM judges exist (MLflow, LangSmith). Need to identify what's unique about our approach.

### Decision
Focus on agent-specific failure modes that generic judges miss:
- Tool selection quality
- Multi-step reasoning soundness
- Grounding (claims supported by tool outputs)
- Termination timing
- Efficiency (unnecessary steps)

### Rationale
- Generic "was this helpful?" doesn't capture agent-specific failures
- Tool-using agents have unique failure modes
- This is the wedge that justifies the product

---

## D3: CI/CD Integration as Primary Workflow

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
Could focus on ad-hoc evaluation (run manually) or CI/CD integration (automated gates).

### Decision
Prioritize CI/CD integration (GitHub Actions) as the primary workflow.

### Rationale
- Aligns with modern software engineering practices
- Prevents regressions automatically
- Clear pass/fail decision point
- Differentiates from manual-first tools like LangSmith

### Consequences
- Need to optimize for CI execution time
- Need to handle GitHub Action configuration complexity
- May need to support other CI systems later

---

## D4: CLI-First, Web UI Second

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
For MVP, need to decide whether to invest in web UI for suite creation or focus on CLI.

### Decision
CLI-first for MVP. Web UI for viewing results, but suite creation via YAML/CLI.

### Rationale
- Faster to build
- Developers are primary users
- Suites can be version-controlled with code
- Web UI for creation can come in V1

---

## D5: Three Scorers for MVP

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
How many custom scorers to build for MVP?

### Decision
Three scorers: ToolSelectionScorer, ReasoningQualityScorer, GroundingScorer

### Rationale
- Enough to validate the approach
- Covers the most common agent failure modes
- Manageable scope for 1-week build
- Can expand based on user feedback

---

## D6: PostgreSQL for Test Suite Storage

**Date:** 2026-01-18
**Status:** Decided
**Decider:** Sean

### Context
Where to store eval suites, runs, and results? Options: MLflow experiments, separate database, files.

### Decision
Separate PostgreSQL database for our data; link to MLflow traces via IDs.

### Rationale
- MLflow experiments not designed for our data model
- Need structured queries for regression detection
- PostgreSQL is reliable and well-understood
- Can join with MLflow data when needed

---

## Pending Decisions

| Decision | Options | Deadline | Owner |
|----------|---------|----------|-------|
| Custom scorer interface | Extend MLflow Scorer vs. own base class | Before coding | Sean |
| Frontend framework | Next.js vs. Remix vs. Astro | Before coding | Sean |
| Hosting approach | Self-hosted vs. cloud hybrid | Before V1 | Sean |
