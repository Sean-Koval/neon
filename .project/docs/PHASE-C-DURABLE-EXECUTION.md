# Phase C: Durable Execution with Temporal

**Status:** Future Planning
**Timeline:** Q4 2026+
**Prerequisite:** Phase B Complete

---

## Overview

Phase C adds Temporal for durable workflow execution. This enables:
- Long-running evaluations that survive failures
- Human-in-the-loop approval workflows
- A/B testing with controlled rollouts
- Optional: Managed agent execution

---

## Why Temporal?

### Current Pain Points (Post Phase B)

1. **Eval runs can fail mid-execution**
   - LLM rate limits cause partial failures
   - Network issues lose progress
   - No automatic retry with state preservation

2. **No human-in-the-loop**
   - Can't pause evals for approval
   - No way to review before scoring
   - Fully automated or fully manual

3. **A/B testing is manual**
   - No controlled traffic splitting
   - Manual comparison of results
   - No statistical significance tracking

### What Temporal Provides

| Feature | Benefit |
|---------|---------|
| Durable execution | Workflows survive crashes, resume automatically |
| Automatic retry | Built-in backoff for LLM API failures |
| Long-running | Evals can run for hours/days safely |
| Signals | Pause/resume for human approval |
| Queries | Check workflow status in real-time |
| Child workflows | Parallel eval cases with isolation |
| Time-travel | Debug any workflow by replaying history |

---

## Use Cases

### 1. Durable Eval Runs

Current flow:
```
API Request → Run Eval → (LLM fails) → Lost Progress
```

With Temporal:
```
API Request → Start Workflow → Run Eval
                                  ↓
                            (LLM fails)
                                  ↓
                         Temporal Retries
                                  ↓
                              Complete
```

### 2. Human-in-the-Loop Scoring

```
Eval Workflow
     │
     ├─▶ Run automated scorers
     │
     ├─▶ Send for human review ◀── Signal: await_approval
     │         │
     │         ▼
     │   Human reviews in UI
     │         │
     │         ▼
     │   Signal: approval(score=0.8, notes="...")
     │
     └─▶ Aggregate final scores
```

### 3. A/B Testing Workflow

```
A/B Test Workflow
     │
     ├─▶ Define variants (Agent v1 vs v2)
     │
     ├─▶ Run eval suite on both (parallel child workflows)
     │
     ├─▶ Wait for completion
     │
     ├─▶ Calculate statistical significance
     │
     └─▶ Report results with confidence interval
```

### 4. Progressive Rollout (Future)

```
Rollout Workflow
     │
     ├─▶ Start with 5% traffic
     │
     ├─▶ Monitor metrics for 1 hour
     │         │
     │         ├─ If regression → Rollback
     │         │
     │         └─ If stable → Continue
     │
     ├─▶ Increase to 25% traffic
     │
     ├─▶ Monitor... (repeat)
     │
     └─▶ Full rollout
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         NEON PLATFORM                               │
│                                                                     │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐       │
│  │   Next.js   │──────▶│   FastAPI   │──────▶│  PostgreSQL │       │
│  │   Frontend  │       │   Backend   │       │  (metadata) │       │
│  └─────────────┘       └──────┬──────┘       └─────────────┘       │
│                               │                                     │
│                               │ Start Workflow                      │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      TEMPORAL CLUSTER                         │  │
│  │                                                               │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │  │
│  │  │  Temporal   │    │   History   │    │  Matching   │       │  │
│  │  │   Server    │    │   Service   │    │   Service   │       │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘       │  │
│  │                                                               │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 │                                   │
│                                 │ Poll for tasks                    │
│                                 ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      TEMPORAL WORKERS                         │  │
│  │                                                               │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │  │
│  │  │  Eval Run   │    │  LLM Call   │    │   Score     │       │  │
│  │  │  Workflow   │    │  Activity   │    │  Activity   │       │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘       │  │
│  │                                                               │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 │                                   │
│                                 │ Write results                     │
│                                 ▼                                   │
│                        ┌─────────────────┐                         │
│                        │   ClickHouse    │                         │
│                        │ (traces/scores) │                         │
│                        └─────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Workflow Definitions

### Eval Run Workflow

```typescript
// Pseudo-code for eval run workflow
export async function evalRunWorkflow(params: EvalRunParams): Promise<EvalRunResult> {
  const { suiteId, agentPath, projectId } = params;

  // Get suite and cases from PostgreSQL
  const suite = await activities.getSuite(suiteId);
  const cases = await activities.getCases(suiteId);

  const results: CaseResult[] = [];

  // Run each case as a child workflow (isolation + parallelism)
  for (const testCase of cases) {
    const result = await workflow.executeChild(evalCaseWorkflow, {
      workflowId: `${workflowInfo().workflowId}-case-${testCase.id}`,
      args: [{ testCase, agentPath, projectId }],
    });
    results.push(result);
  }

  // Aggregate results
  const summary = aggregateResults(results);

  // Store final results
  await activities.saveRunResults({ runId: workflowInfo().workflowId, results, summary });

  return { runId: workflowInfo().workflowId, summary };
}
```

### Eval Case Workflow (with human approval option)

```typescript
export async function evalCaseWorkflow(params: EvalCaseParams): Promise<CaseResult> {
  const { testCase, agentPath, projectId } = params;

  // Run agent
  const agentOutput = await activities.runAgent({
    agentPath,
    input: testCase.input,
    projectId,
  });

  // Run automated scorers
  const autoScores = await activities.runScorers({
    output: agentOutput,
    expected: testCase.expected,
    scorers: testCase.scorers,
  });

  // If human review required, wait for signal
  if (testCase.requiresHumanReview) {
    await activities.requestHumanReview({ caseId: testCase.id, output: agentOutput });

    // Wait for approval signal (can wait days!)
    const humanScore = await workflow.condition(
      () => humanReviewReceived,
      '7 days'
    );

    autoScores.push(humanScore);
  }

  return {
    caseId: testCase.id,
    output: agentOutput,
    scores: autoScores,
    passed: calculatePassed(autoScores, testCase.thresholds),
  };
}
```

### Activities (Non-Deterministic Operations)

```typescript
// Activities are retried automatically on failure
export const activities = {
  async runAgent(params: RunAgentParams): Promise<AgentOutput> {
    // Execute agent, capture trace
    // Retries on LLM timeout/rate limit
  },

  async runScorers(params: RunScorersParams): Promise<Score[]> {
    // Run each scorer
    // LLM judges retry automatically
  },

  async saveRunResults(params: SaveResultsParams): Promise<void> {
    // Write to ClickHouse
  },

  async requestHumanReview(params: ReviewParams): Promise<void> {
    // Send notification, create UI task
  },
};
```

---

## Implementation Phases

### Phase C.1: Infrastructure Setup
- [ ] Add Temporal server to docker-compose
- [ ] Set up Temporal namespace
- [ ] Create worker deployment
- [ ] Temporal UI access

### Phase C.2: Migrate Eval Runs
- [ ] Define evalRunWorkflow
- [ ] Define activities for agent execution, scoring
- [ ] Update API to start Temporal workflow
- [ ] Add workflow status to run detail page

### Phase C.3: Human-in-the-Loop
- [ ] Add review request activity
- [ ] Build review queue UI
- [ ] Implement approval signal handling
- [ ] Notification system (email/Slack)

### Phase C.4: A/B Testing
- [ ] Define abTestWorkflow
- [ ] Statistical significance calculator
- [ ] A/B test creation UI
- [ ] Results visualization

---

## Migration Strategy

### Gradual Adoption

1. **Week 1-2:** Deploy Temporal alongside existing system
2. **Week 3-4:** New eval runs use Temporal, old runs stay on direct execution
3. **Week 5-6:** Add human review feature (new capability)
4. **Week 7-8:** Migrate remaining flows, deprecate direct execution

### Rollback Plan

- Temporal workflows call same underlying code
- Can disable Temporal and fall back to direct API calls
- Database schema unchanged (Temporal is orchestration only)

---

## Operational Considerations

### Monitoring
- Temporal Web UI for workflow visibility
- Prometheus metrics from Temporal
- Custom dashboards for eval-specific metrics

### Scaling
- Workers scale horizontally
- Temporal server can be clustered
- ClickHouse handles write load

### Debugging
- Temporal history provides full replay
- Can inspect any workflow step
- Activity logs for troubleshooting

---

## Success Criteria

Phase C is complete when:

1. [ ] Eval runs execute via Temporal workflows
2. [ ] Failed evals auto-retry and complete
3. [ ] Human review workflow functional
4. [ ] A/B testing creates valid experiments
5. [ ] Temporal UI accessible to team
6. [ ] 99.9% eval completion rate (vs current ~95%)

---

## Open Questions

1. **Temporal Cloud vs self-hosted?** - Cloud is simpler, self-hosted is cheaper at scale
2. **Worker language?** - TypeScript (matches frontend) vs Python (matches backend)
3. **Approval SLA?** - How long can workflows wait for human review?
4. **Cost model?** - Does Temporal add significant cost?
