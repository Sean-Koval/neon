# AgentEval

<!--
linear:
sb:
-->

**Status:** `CONCEPT`
**Stage:** 01-research
**Created:** 2026-01-18
**Last Updated:** 2026-01-18

## One-Liner

An agent quality platform built on MLflow 3.0: custom evaluation scorers, regression detection, and CI/CD gates for tool-using agents.

## Problem

Agent teams lack systematic ways to measure and improve agent quality. They can trace runs (MLflow, LangSmith), but:
- Generic LLM judges don't capture agent-specific failure modes (bad tool selection, reasoning errors, grounding failures)
- No regression detection across agent versions
- No CI/CD integration to gate deployments on quality
- No workflow to turn production failures into eval test cases

## Solution

Build **on top of MLflow 3.0** (not competing with it) to add:
1. **Agent-specific scorers** — Custom rubrics for tool selection, multi-step reasoning, grounding
2. **Eval test suites** — Define expected behaviors, run regression tests
3. **Version comparison** — A/B diff between agent versions showing what regressed
4. **CI/CD gates** — GitHub Action that blocks PRs if agent quality drops
5. **Failure → Test case pipeline** — Turn production failures into eval cases

## Current Focus

Research phase: understanding MLflow 3.0 capabilities, mapping competitor gaps, defining MVP feature set.

## Key Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Eval suite definition time | <15 min | - |
| Regression detection accuracy | >90% | - |
| CI/CD gate latency | <5 min | - |
| Time to first eval (new user) | <30 min | - |

## Quick Links

- [Status & Next Actions](./status.md)
- [Discovery](./00-discovery/)
- [Research](./01-research/_index.md)
- [Concept](./02-concept/)
- [Validation](./03-validation/)
- [GTM](./04-gtm/)
- [Decision Log](./log/decisions.md)

## Team / Stakeholders

- Owner: Sean
- Contributors: -

## Timeline

| Milestone | Target | Status |
|-----------|--------|--------|
| Discovery complete | 2026-01-18 | Done |
| Research complete | 2026-01-20 | In Progress |
| Concept defined | 2026-01-21 | - |
| Prototype ready | 2026-01-25 | - |
| Validation complete | 2026-01-28 | - |
| Launch | TBD | - |

## Why Build on MLflow?

MLflow 3.7+ (latest) already has:
- Tracing with typed spans (TOOL, CHAT_MODEL, etc.)
- Basic LLM judges
- Framework integrations (LangChain, LlamaIndex, PydanticAI)
- Experiment organization and model versioning

What MLflow **doesn't** have well:
- Agent-specific evaluation rubrics
- Regression detection across versions
- CI/CD integration for quality gates
- Test suite management with expected behaviors
- Production failure → eval case workflow

This project fills those gaps rather than rebuilding the foundation.

## Differentiation

| Capability | MLflow 3.0 | LangSmith | Braintrust | AgentEval |
|------------|------------|-----------|------------|-----------|
| Tracing | ✅ | ✅ | ⚠️ Limited | Uses MLflow |
| Generic LLM judges | ✅ | ✅ | ✅ | Uses MLflow |
| Agent-specific scorers | ❌ | ❌ | ❌ | ✅ |
| Regression detection | ❌ | ❌ | ⚠️ Manual | ✅ |
| CI/CD gates | ❌ | ❌ | ⚠️ | ✅ |
| Test suite management | ❌ | ⚠️ | ✅ | ✅ |
| A/B version comparison | ⚠️ | ⚠️ | ✅ | ✅ |
| Open source foundation | ✅ | ❌ | ❌ | ✅ (MLflow) |

## Portfolio Value

This project demonstrates:
- **Production thinking** — CI/CD, regression detection, quality gates
- **Evaluation methodology** — Understanding agent failure modes
- **Systems integration** — Building on MLflow rather than from scratch
- **Full-stack execution** — Custom UI + backend + agent instrumentation
