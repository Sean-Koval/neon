# Scope Definition

## Scope Tiers

### MVP (1 Week Build)

**Goal:** Prove that agent-specific evaluation + CI/CD integration provides value to teams using MLflow.

**Target:** 5-6 working days

#### In Scope

| Feature | Why Essential | Acceptance Criteria |
|---------|---------------|---------------------|
| 3 Custom Scorers | Core value prop | ToolSelection, Reasoning, Grounding work |
| Test Suite Model | Foundation | CRUD via CLI works |
| Eval Runner | Execute tests | Run suite against agent, store results |
| Regression Detection | Key differentiator | Compare two runs, identify regressions |
| CLI Tool | Developer workflow | `agent-eval run`, `agent-eval compare` work |
| GitHub Action | CI/CD integration | PR check pass/fail works |
| Basic UI | Visibility | Suite list, run results, regression diff |

#### Explicitly Out of Scope (MVP)

| Feature | Why Deferred | When to Add |
|---------|--------------|-------------|
| More than 3 scorers | MVP validation first | V1 |
| Web-based suite editor | CLI is sufficient | V1 |
| Failure → test case workflow | Nice-to-have | V1 |
| Real-time streaming | Complexity | V1 |
| Multi-agent comparison | Scope creep | V2 |
| Custom scorer builder UI | Power user feature | V2 |
| Slack/Discord notifications | Polish | V1 |
| MLflow UI plugin | Research needed | V2 |

#### MVP Success Criteria

- [ ] Can define eval suite with 5+ test cases in <15 min
- [ ] Can run eval suite and get scores via CLI
- [ ] Can compare two agent versions and see regressions
- [ ] GitHub Action blocks PR when quality drops below threshold
- [ ] UI shows run results and regression diff

---

### V1 (MVP + 2-3 Weeks)

**Goal:** Production-ready with full scorer library and polished UX

#### Additional Scope

| Feature | Priority | Rationale |
|---------|----------|-----------|
| 5+ Additional Scorers | P1 | Cover more failure modes |
| Web-based Suite Editor | P1 | Lower barrier to entry |
| Failure → Test Case | P1 | Close the feedback loop |
| Slack Notifications | P1 | Alerting on regressions |
| Score Trend Charts | P2 | Visualize quality over time |
| Export to MLflow | P2 | Integration with existing dashboards |
| Custom Scorer SDK | P2 | Let users define their own |

#### V1 Success Criteria

- [ ] 8+ scorers covering common agent failure modes
- [ ] Non-technical users can create test cases via UI
- [ ] Production failures can become test cases in 2 clicks
- [ ] Quality trends visible over last 30 days
- [ ] Used by 2+ external teams

---

### Future Vision (V2+)

| Feature | When | Depends On |
|---------|------|------------|
| MLflow UI Plugin | V2 | MLflow plugin API research |
| Multi-agent orchestration eval | V2 | Demand validation |
| Auto-generated test cases | V2 | LLM capabilities |
| Scorer marketplace | V3 | Community adoption |
| SaaS offering | V3 | Demand and funding |

---

## MVP Build Plan (5-6 Days)

### Day 1: Foundation
- [ ] Project setup (FastAPI, Postgres, Next.js scaffolding)
- [ ] Data models (Suite, Case, Run, Result)
- [ ] Database schema and migrations
- [ ] MLflow integration spike

### Day 2: Scorers
- [ ] ToolSelectionScorer implementation
- [ ] ReasoningQualityScorer implementation
- [ ] GroundingScorer implementation
- [ ] Unit tests for scorers

### Day 3: Eval Runner + CLI
- [ ] Eval runner (execute suite, collect results)
- [ ] `agent-eval run` CLI command
- [ ] `agent-eval compare` CLI command
- [ ] Regression detection algorithm

### Day 4: CI/CD + API
- [ ] GitHub Action (run, compare, pass/fail)
- [ ] Backend API endpoints (suites, runs, compare)
- [ ] API authentication (API keys)

### Day 5: Frontend
- [ ] Dashboard page (overview)
- [ ] Suite list + detail pages
- [ ] Run results page
- [ ] Regression comparison view

### Day 6: Polish + Deploy
- [ ] Docker Compose setup
- [ ] Documentation (README, quickstart)
- [ ] Demo agent + suite for testing
- [ ] Deploy to test environment

---

## Scope Boundaries

### Users

**In scope:**
- AI engineers building agents with MLflow tracing
- Teams using LangChain, LlamaIndex, or custom agents
- Platform teams standardizing agent quality practices

**Out of scope:**
- Teams not using MLflow (consider later)
- Non-technical users (V1)
- Hobbyists without CI/CD workflows

### Use Cases

**In scope:**
- Evaluating tool-using agents
- Detecting regressions before deployment
- Blocking PRs with quality issues
- Comparing agent versions

**Out of scope:**
- General LLM evaluation (chatbots without tools)
- Real-time production monitoring (use MLflow)
- Model training/fine-tuning
- Prompt optimization (different product)

### Technical Boundaries

**In scope:**
- Agents with MLflow tracing enabled
- Python agents
- GitHub-based CI/CD

**Out of scope:**
- Non-MLflow tracing systems
- Non-Python agents (TypeScript support in V1)
- GitLab/Bitbucket CI (V1)

---

## Assumptions

Scope assumes:

1. **MLflow 3.0 APIs are stable** — We're building on their Scorer interface
2. **Teams have MLflow tracing set up** — Not building tracing from scratch
3. **3 scorers are enough for MVP** — Can expand based on feedback
4. **CLI-first is acceptable** — Web UI for suite creation can wait
5. **GitHub is primary CI** — Other CI systems in V1

---

## Scope Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MLflow API changes | High | Pin versions, test thoroughly |
| Scorer quality (garbage in/out) | Medium | Validate with real agents |
| CI/CD execution time | Medium | Optimize, allow parallelization |
| Scope creep | Medium | Strict MVP definition, defer features |

---

## Scope Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-18 | Build on MLflow, not from scratch | MLflow has tracing, spans, judges already |
| 2026-01-18 | 3 scorers for MVP | Enough to validate, expand based on feedback |
| 2026-01-18 | CLI-first, web later | Faster to build, developers are primary users |
| 2026-01-18 | GitHub Actions only (MVP) | Most common, well-documented |
| 2026-01-18 | Self-hosted first | Simpler, teams control their data |
