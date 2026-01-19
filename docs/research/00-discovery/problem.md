# Problem Definition

## Problem Statement

Agent teams lack systematic ways to measure, track, and improve agent quality over time. While tracing and basic evaluation tools exist (MLflow, LangSmith), they don't address agent-specific failure modes or integrate into development workflows.

## The Pain Points

### 1. Generic Evaluation Doesn't Fit Agents

Current LLM evaluation tools treat agents like chatbots:
- "Was the response helpful?" — Too vague for tool-using agents
- "Was it factual?" — Doesn't capture tool selection quality
- "Did it follow instructions?" — Doesn't evaluate multi-step reasoning

**What's missing:**
- Did the agent select the right tools for the task?
- Did it use tools in the right order?
- Did it reason correctly between steps?
- Did it know when to stop vs. continue?

### 2. No Regression Detection

Teams can't answer: "Did this prompt change make the agent worse?"

Current workflow:
1. Make a change
2. Run a few manual tests
3. Deploy and hope
4. Find out in production when users complain

**What's missing:**
- Automated comparison between agent versions
- Statistical significance on quality changes
- Specific identification of what regressed

### 3. No CI/CD Integration

Quality checks happen manually (if at all):
- No automated tests in PR review
- No quality gates before deployment
- No alerts when production quality drops

**What's missing:**
- GitHub Action that runs eval suite on PRs
- Pass/fail gates based on quality thresholds
- Automated blocking of regressions

### 4. Production Failures Don't Become Tests

When an agent fails in production:
1. Someone notices (maybe)
2. Someone debugs it manually
3. It gets fixed (maybe)
4. No test is added to prevent recurrence

**What's missing:**
- Workflow to convert production failures into eval test cases
- Failure pattern clustering
- Active learning to prioritize what to test

## Who Has This Problem?

### Primary: AI Engineers Building Production Agents
- Building agents with LangChain, LangGraph, LlamaIndex, or custom frameworks
- Deploying to production with real users
- Need to iterate quickly while maintaining quality
- Currently: manual testing, console.log debugging, fingers crossed

### Secondary: ML Platform Teams
- Supporting multiple agent projects across the organization
- Need standardized quality practices
- Want to enable teams without being a bottleneck
- Currently: inconsistent practices, no shared tooling

### Tertiary: Product/QA Teams
- Need to validate agent behavior before releases
- Want to define expected behaviors without writing code
- Need visibility into quality trends
- Currently: manual testing, ad-hoc checklists

## How Painful Is It?

**Pain Score: 8/10**

Evidence:
- Every agent team blog post mentions evaluation as a gap
- LangChain built LangSmith because nothing existed
- Arize, Braintrust, and others are racing to fill this space
- Teams spending 20-30% of time on manual testing and debugging
- Production incidents from agent regressions are common

## What Do They Do Today?

| Approach | Limitation |
|----------|------------|
| **Console.log debugging** | No visibility at scale |
| **Manual replay of failures** | Doesn't scale, no regression prevention |
| **Ad-hoc pytest scripts** | Not agent-specific, hard to maintain |
| **LangSmith tracing** | Good tracing, weak evaluation |
| **Spreadsheet tracking** | Manual, no automation |
| **Hope and pray** | Not a strategy |

## Why Now?

1. **Agent adoption is exploding** — Claude Code, Devin, enterprise copilots everywhere
2. **MLflow 3.0 provides a foundation** — Tracing and basic judges exist; we can build on top
3. **Teams are hitting production scale** — Past prototype phase, need real quality practices
4. **"Agent reliability engineering" is emerging** — The category is being defined now

## Opportunity Size

- Every team building production agents needs this
- No tool comprehensively solves agent-specific evaluation
- MLflow has massive adoption — building on it provides distribution
- Open source foundation makes adoption frictionless
