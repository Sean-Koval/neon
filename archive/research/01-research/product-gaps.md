# Product Research Gaps

> What we still need to validate/decide from a product perspective before building.

**Last Updated:** 2026-01-18
**Status:** Pre-build research phase

---

## Summary

Technical decisions are finalized. Product research gaps remain in three areas:

| Area | Status | Risk if Skipped |
|------|--------|-----------------|
| **User Validation** | Not started | Building wrong thing |
| **Scorer Design** | Partially defined | Ineffective evaluation |
| **UX/Workflow** | Not started | Poor adoption |

---

## Critical Research Gaps

### 1. User Validation (HIGH PRIORITY)

**What we don't know:**
- Do teams actually need agent-specific scorers vs. better prompts for generic judges?
- Will teams adopt an MLflow extension vs. switching to LangSmith/Braintrust?
- Is CI/CD integration actually a killer feature or nice-to-have?
- What's the current state of agent evaluation practices?

**Research needed:**

| Task | Method | Output | Time |
|------|--------|--------|------|
| Interview 3-5 agent teams | User interviews | Pain points, current workflow | 3-5 days |
| Shadow an eval workflow | Observation | Friction points, time spent | 1-2 days |
| Survey MLflow users | Online survey | Adoption likelihood, feature priority | 2-3 days |

**Key questions for interviews:**
1. "Walk me through how you currently test your agents before deploying"
2. "What failures have you caught in production that you wish you'd caught earlier?"
3. "How do you know if a prompt change made your agent worse?"
4. "Would you block a PR if agent quality dropped 10%?"
5. "What tools do you currently use? What's missing?"

**Risk if skipped:** Building features nobody needs; wrong positioning

---

### 2. Scorer Design (MEDIUM PRIORITY)

**What we don't know:**
- What specific rubrics work for evaluating tool selection?
- What reasoning patterns indicate good vs. bad agent behavior?
- How to detect grounding failures reliably?
- What granularity is right (run-level, step-level, tool-call-level)?

**Research needed:**

| Task | Method | Output | Time |
|------|--------|--------|------|
| Collect 50+ agent failure examples | Data collection | Failure taxonomy | 2-3 days |
| Prototype scorers on real traces | Technical spike | Working scorer code | 2-3 days |
| Test scorer accuracy | Manual labeling | Precision/recall | 1-2 days |

**Failure taxonomy to build:**

```
Agent Failures
├── Tool Selection
│   ├── Wrong tool for task
│   ├── Unnecessary tool call
│   ├── Missing required tool
│   └── Wrong tool order
├── Reasoning
│   ├── Incorrect inference
│   ├── Premature conclusion
│   ├── Ignored evidence
│   └── Circular logic
├── Grounding
│   ├── Hallucinated tool output
│   ├── Unsupported claim
│   └── Fabricated data
├── Termination
│   ├── Stopped too early
│   ├── Continued too long
│   └── Stuck in loop
└── Context
    ├── Lost original goal
    ├── Ignored constraints
    └── Misunderstood instructions
```

**Risk if skipped:** Scorers that don't catch real failures; garbage-in-garbage-out

---

### 3. UX/Workflow Design (MEDIUM PRIORITY)

**What we don't know:**
- What's the right format for defining test cases? (YAML, JSON, UI, code)
- How should regression results be presented?
- What information is needed in CI/CD failure messages?
- How do users want to create test cases from failures?

**Research needed:**

| Task | Method | Output | Time |
|------|--------|--------|------|
| Design test case format | Design exercise | Schema + examples | 1 day |
| Sketch regression diff UI | Wireframes | UI mockups | 1 day |
| Design CI failure message | Content design | Message templates | 0.5 day |
| Map failure→test workflow | User flow | Flow diagram | 0.5 day |

**Test case format options:**

```yaml
# Option A: Declarative YAML
name: "Should use search for factual questions"
input:
  query: "What is the capital of France?"
expected:
  tools: ["web_search"]
  output_contains: ["Paris"]
scorers:
  - tool_selection
  - grounding
```

```python
# Option B: Pythonic
@eval_case
def test_factual_search():
    result = agent.run("What is the capital of France?")
    assert "web_search" in result.tools_called
    assert "Paris" in result.output
```

**Risk if skipped:** Clunky UX, low adoption, users don't understand how to use it

---

## Important Research Gaps

### 4. MLflow Integration Depth

**What we don't know:**
- How much of MLflow's trace comparison UI can we reuse?
- Are there MLflow plugin APIs we should use?
- How to handle MLflow version compatibility?

**Research needed:**
- Deep dive on MLflow 3.7 UI customization options
- Test trace comparison UI with agent traces
- Document MLflow API stability guarantees

---

### 5. Pricing/Positioning (LOW PRIORITY - Post-MVP)

**What we don't know:**
- How to position vs. LangSmith, Braintrust?
- Pricing model (per-run, per-seat, usage)?
- Open source vs. commercial?

**Defer until:** MVP validation complete

---

## Research Plan

### Week 1: User Validation
| Day | Activity |
|-----|----------|
| Mon | Draft interview guide, recruit 3 teams |
| Tue | Interview #1 |
| Wed | Interview #2 |
| Thu | Interview #3, synthesize findings |
| Fri | Write up insights, adjust assumptions |

### Week 2: Scorer Design + UX
| Day | Activity |
|-----|----------|
| Mon | Collect agent failure examples |
| Tue | Build failure taxonomy |
| Wed | Prototype ToolSelectionScorer |
| Thu | Design test case format, wireframes |
| Fri | Test scorer on real traces |

---

## Assumptions to Validate

From `00-discovery/assumptions.md`:

| # | Assumption | Validation Method | Status |
|---|------------|-------------------|--------|
| A1 | Agent-specific eval is different | User interviews | ❌ Not started |
| A2 | Teams will adopt MLflow extensions | User interviews + survey | ❌ Not started |
| A3 | CI/CD integration is killer feature | User interviews | ❌ Not started |
| A4 | Regression detection provides value | User interviews | ❌ Not started |
| A5 | Teams will define test suites | UX testing | ❌ Not started |
| A6 | MLflow APIs are stable | Technical spike | ❌ Not started |
| A7 | Custom frontend beats MLflow UI | MLflow deep dive | ❌ Not started |

---

## Decision: Build Now or Research First?

### Option A: Research First (Recommended)
- 2 weeks of user validation + scorer prototyping
- Higher confidence in product direction
- Risk: Slower to market

### Option B: Build MVP, Validate in Parallel
- Start scaffolding while recruiting users
- Ship something, iterate based on feedback
- Risk: May build wrong thing

### Option C: Technical Spike First
- Build scorers + MLflow integration
- Validate technical feasibility
- Then user research
- Risk: May validate tech that solves wrong problem

**Recommendation:** Option A — User validation first. The technical approach (MLflow + Vertex AI) is low-risk. The product risk (are we solving a real problem?) is higher.

---

## Minimum Viable Research

If time-constrained, the absolute minimum before building:

1. **3 user interviews** — Validate the core problem exists
2. **10 failure examples** — Understand what scorers need to detect
3. **1 MLflow spike** — Confirm Scorer API works as expected

**Time:** 5 days

---

## Open Questions for User Interviews

### Problem Validation
- "What's the most painful part of deploying agent changes?"
- "Tell me about a time an agent regressed in production"
- "How do you currently test agents before deployment?"

### Tool Selection Scoring
- "How do you know if your agent picked the right tools?"
- "What tool selection mistakes have you seen?"

### Adoption
- "Do you use MLflow? For what?"
- "What would make you switch evaluation tools?"
- "Would you integrate a new tool into your CI/CD?"

### Workflow
- "Walk me through your deployment process"
- "Who decides if an agent change is safe to deploy?"
- "How long does it take to validate a change?"
