# Status: AgentEval

<!--
This file is the single source of truth for current project status.
Update frequently. Used for Linear sync and status reports.
-->

**Last Updated:** 2026-01-18
**Current Stage:** 01-research (Product Validation)

## Current Status

Technical decisions finalized (GCP, Terraform, MLflow 3.7+, Vertex AI SDK). Now in product validation phase — need user interviews and scorer prototyping before building.

## Active Work

### Completed
- [x] Deep dive on MLflow 3.7 GenAI features
- [x] Competitor analysis (LangSmith, Braintrust, Arize Phoenix, Langfuse)
- [x] Define agent-specific scorer requirements
- [x] Finalize infrastructure decisions (GCP/Terraform)
- [x] Document all technical decisions

### In Progress
- [ ] User interview recruitment (need 3-5 agent teams)
- [ ] Collect agent failure examples (need 50+)

### Blocked
- None currently

### Next Up (Pre-Build Research)
- [ ] Conduct 3-5 user interviews
- [ ] Build failure taxonomy
- [ ] Prototype ToolSelectionScorer on real traces
- [ ] Design test case format (YAML/code)
- [ ] MLflow 3.7 Scorer API spike

## Recent Progress

### This Week
- Combined AgentOps Console + Dataset Labeling ideas into unified project
- Discovered MLflow 3.0 has substantial GenAI features (tracing, spans, LLM judges)
- Pivoted strategy: build ON MLflow rather than competing
- Researched competitor landscape (LangSmith, Braintrust, Arize)
- Identified differentiation: agent-specific scorers + regression detection + CI/CD

### Last Week
- Initial idea capture for both source ideas

## Key Decisions Needed

| Decision | Options | Deadline | Owner |
|----------|---------|----------|-------|
| Custom scorer approach | Extend MLflow Scorer class vs. separate framework | 2026-01-20 | Sean |
| Frontend approach | Custom Next.js vs. MLflow UI plugin | 2026-01-20 | Sean |
| Test suite storage | MLflow experiments vs. separate Postgres tables | 2026-01-21 | Sean |

## Risks & Issues

| Risk/Issue | Severity | Mitigation | Status |
|------------|----------|------------|--------|
| MLflow API stability | Med | Pin versions, test thoroughly | Open |
| Differentiation clarity | Med | Focus on agent-specific value | Open |
| Scope creep (too many features) | Med | Strict MVP: scorers + regression + CI | Open |

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| MLflow 3.0+ | External | Available | Core foundation |
| OpenTelemetry | External | Available | For additional instrumentation |
| Claude/GPT API | External | Available | For LLM-as-judge scorers |

## Notes

Key differentiators to emphasize:
- **Agent-specific**: Not generic LLM eval — understands tool selection, reasoning, grounding
- **Regression-focused**: "Did this change make the agent worse?"
- **CI/CD-native**: Quality gates in the deployment pipeline
- **MLflow-compatible**: Leverage existing investment, don't replace it

MVP surfaces:
- Custom scorer framework (Python SDK)
- Eval suite definition and runner
- Regression comparison view (Next.js)
- GitHub Action for CI/CD gates
