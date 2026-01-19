# Assumptions to Validate

## Critical Assumptions

Must be true for this project to succeed.

### A1: Agent-specific evaluation is meaningfully different from generic LLM evaluation

**Assumption:** Generic LLM judges ("was this helpful?") don't capture agent failure modes. Teams need specialized scorers for tool selection, reasoning quality, and grounding.

**Risk if wrong:** We're solving a problem that doesn't exist — generic judges are sufficient.

**Validation approach:**
- Interview 3-5 agent teams about their evaluation approaches
- Ask: "What failures do your current evals miss?"
- Review agent failure case studies

**Evidence so far:**
- Medium — Agent failures are observably different (wrong tool, bad reasoning, hallucinated actions)
- But unclear if custom scorers are needed vs. better prompts for generic judges

---

### A2: Teams will adopt tooling that builds on MLflow

**Assumption:** Teams already using or willing to use MLflow will adopt extensions rather than switching to a completely new platform.

**Risk if wrong:** Teams prefer all-in-one solutions (LangSmith) over MLflow + extensions.

**Validation approach:**
- Survey MLflow users about extension adoption
- Check MLflow community forums for extension demand
- Test with 2-3 teams

**Evidence so far:**
- Medium — MLflow has massive adoption, but unclear how many use GenAI features
- Some teams locked into LangChain → LangSmith ecosystem

---

### A3: CI/CD integration is a killer feature

**Assumption:** Teams want quality gates in their deployment pipeline and would block PRs based on agent eval results.

**Risk if wrong:** Teams view this as overhead / too slow / not worth the friction.

**Validation approach:**
- Ask teams: "Would you block a PR if agent quality dropped 10%?"
- Check if teams have any automated agent testing today

**Evidence so far:**
- Low — Assumed based on general software engineering practices
- Need validation that agent teams have mature enough practices

---

### A4: Regression detection provides clear value

**Assumption:** Teams struggle to know if changes made agents worse, and automated regression detection would save significant debugging time.

**Risk if wrong:** Teams don't make changes frequently enough, or manual testing is sufficient.

**Validation approach:**
- Ask teams: "How often do you discover agent regressions in production?"
- Quantify time spent debugging production issues

**Evidence so far:**
- Medium — Anecdotally common, but need data

---

## Important Assumptions

Should be true for optimal success.

### A5: Teams will invest in defining eval test suites

**Assumption:** Teams will spend time defining expected behaviors and test cases rather than just using generic judges.

**Risk if wrong:** Adoption friction — teams won't invest upfront to get value.

**Validation approach:**
- Test with 2-3 teams: how long to define first test suite?
- What's the activation energy?

**Evidence so far:**
- Low — Defining good tests is work; need to make it very easy

---

### A6: MLflow 3.0 APIs are stable enough to build on

**Assumption:** MLflow's GenAI APIs (tracing, spans, scorers) are stable and won't break our integrations.

**Risk if wrong:** Maintenance burden chasing MLflow changes.

**Validation approach:**
- Review MLflow changelog stability
- Talk to MLflow team / community about roadmap

**Evidence so far:**
- Medium — MLflow 3.0 is recent; APIs may still evolve

---

### A7: Custom frontend provides value over MLflow UI

**Assumption:** Our custom Next.js UI for regression comparison and test suite management provides better UX than extending MLflow's UI.

**Risk if wrong:** Wasted effort — should be MLflow plugin instead.

**Validation approach:**
- Prototype both approaches
- User test with 3 teams

**Evidence so far:**
- Low — Need to evaluate MLflow UI extensibility

---

## Assumptions Tracker

| # | Assumption | Criticality | Evidence | Status |
|---|------------|-------------|----------|--------|
| A1 | Agent-specific eval is different | Critical | Medium | Untested |
| A2 | Teams will adopt MLflow extensions | Critical | Medium | Untested |
| A3 | CI/CD integration is killer feature | Critical | Low | Untested |
| A4 | Regression detection provides value | Critical | Medium | Untested |
| A5 | Teams will define test suites | Important | Low | Untested |
| A6 | MLflow APIs are stable | Important | Medium | Untested |
| A7 | Custom frontend beats MLflow UI | Important | Low | Untested |

## Validation Plan

### Week 1
- [ ] Interview 3 agent teams (A1, A2, A3, A4)
- [ ] Review MLflow 3.0 API stability (A6)

### Week 2
- [ ] Prototype custom scorer (A1)
- [ ] Test CI/CD integration feasibility (A3)
- [ ] Evaluate MLflow UI extensibility (A7)
