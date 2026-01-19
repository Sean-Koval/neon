# Research: AgentEval

> Deep research to validate the opportunity and inform product decisions.

## Research Status

| Area | Status | Key Findings |
|------|--------|--------------|
| Market Sizing | Not Started | - |
| Trends | ✅ Done | Agent eval emerging as critical gap; MLflow 3.7 provides foundation |
| Competitors | ✅ Done | No one owns agent-specific eval + CI/CD; opportunity exists |
| Users | ❌ Not Started | Need 3-5 interviews |
| Technical | ✅ Done | MLflow extensible; GCP/Terraform/Vertex AI stack decided |
| Product Gaps | 🔄 Active | See [product-gaps.md](./product-gaps.md) |

## Priority Research Questions

1. **Do teams actually need agent-specific scorers?** (vs. better prompts for generic judges)
2. **Will teams adopt MLflow extensions?** (vs. all-in-one platforms)
3. **Is CI/CD integration a killer feature?** (or nice-to-have?)
4. **What's the right scorer granularity?** (run-level vs. step-level vs. tool-call-level)

## Research Plan

### Week 1
- [x] MLflow 3.0 capability deep dive
- [x] Competitive landscape analysis
- [ ] Interview 3 agent teams about evaluation practices
- [ ] Review MLflow API stability

### Week 2
- [ ] Prototype custom scorer on MLflow
- [ ] Test CI/CD integration feasibility
- [ ] Define MVP scorer set
- [ ] Technical architecture draft

## Quick Links

- [Product Gaps](./product-gaps.md) ⬅️ **Start here**
- [Market Sizing](./market/sizing.md)
- [Market Trends](./market/trends.md)
- [Competitors](./competitors/landscape.md)
- [User Personas](./users/personas.md)
- [Technical Feasibility](./technical/feasibility.md)
- [Prior Art](./technical/prior-art.md)

## Key Sources

- [MLflow 3.0 GenAI Docs](https://mlflow.org/docs/3.6.0/genai/mlflow-3/)
- [MLflow Agent Evaluation](https://mlflow.org/docs/3.3.0/genai/eval-monitor/running-evaluation/agents/)
- [Arize LLM Evaluation Comparison](https://arize.com/llm-evaluation-platforms-top-frameworks/)
- [Braintrust LLM Tracing Tools 2026](https://www.braintrust.dev/articles/best-llm-tracing-tools-2026)
- [Databricks MLflow 3.0 Blog](https://www.databricks.com/blog/mlflow-30-unified-ai-experimentation-observability-and-governance)
