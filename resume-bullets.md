# Neon — Resume Bullet Points

> Pick the role(s) closest to the target job. Mix and match bullets across roles.

---

## ML Engineer — Agent Evaluation Platform

- Designed and built an evals-as-code framework with 43 composable scorers (LLM-judge, trajectory analysis, causal inference, parameter accuracy) across TypeScript and Python SDKs, enabling reproducible agent evaluation pipelines
- Implemented DSPy-style programmatic prompt optimization with 3 strategies (coordinate ascent, example selection, LLM reflection), achieving iterative score improvement with configurable convergence thresholds
- Engineered training data export pipelines supporting HuggingFace TRL (SFT, DPO, KTO), DSPy, and OpenAI fine-tuning formats, bridging evaluation traces to model improvement loops
- Built trajectory scoring algorithms measuring path optimality, step consistency, error recovery efficiency, and plan adherence across multi-step agent executions
- Developed ML-based failure pattern detection with feature extraction, clustering, and signature generation to identify recurring failure modes across agent traces

---

## AI Platform Engineer — Durable Execution Infrastructure

- Architected an 88K+ LOC Turbo monorepo (7 workspaces, TypeScript/Python) with durable execution via Temporal workflows, supporting parallel eval runs, A/B experiments, and training loops with state-machine orchestration
- Built a real-time observability pipeline ingesting agent traces through OpenTelemetry collectors into ClickHouse (13 tables/views, bloom filter indexes, monthly partitioning), enabling sub-second analytics queries
- Implemented statistically rigorous A/B testing workflows with Welch's t-test, Mann-Whitney U, and bootstrap confidence intervals for comparing agent variants with configurable significance thresholds
- Developed anomaly detection and cascade failure pipelines identifying performance regressions and correlated failures across distributed agent systems
- Shipped 15+ PRs across 4 sprints, closing 60%+ of backlog issues while maintaining CI/CD quality gates with 352 test files and enforced coverage thresholds

---

## Product Manager, AI/ML — Evaluation & Experimentation

- Defined and shipped an end-to-end agent evaluation platform spanning dual-language SDKs, CLI, dashboard, and durable execution backend — from architecture spec to 360+ commits across 100+ PRs
- Designed evals-as-code developer experience with TypeScript and Python SDKs, reducing eval suite definition from manual configuration to <20 lines of code per suite
- Drove experimentation infrastructure supporting A/B testing, prompt optimization, and regression detection with statistical rigor (p-value, effect size, confidence intervals)
- Built a real-time analytics dashboard (Next.js 16, React 19, tRPC) with agent registry, trace visualization, optimization dashboards, and root-cause analysis overlays
- Prioritized and delivered OSS self-hosted readiness across 5 PRs, enabling single-command docker compose deployment with 8 services

---

## Data Scientist — Agent Performance Analytics

- Built a causal analysis engine for agent debugging, constructing dependency graphs across tool calls to identify root causes of failures in multi-step agent trajectories
- Implemented statistical comparison framework with Student's t-test, Welch's t-test, Mann-Whitney U, and bootstrap confidence intervals for rigorous agent variant analysis
- Developed 43 evaluation scorers covering tool selection accuracy, token efficiency, latency profiling, output quality, and safety — with LLM-as-judge and rule-based approaches
- Created root-cause synthesis pipeline aggregating failure patterns, correlation analysis, and anomaly signals into actionable debugging insights for agent developers
- Designed prompt optimization feedback loops leveraging preference signals, demonstration data, and evaluation metrics to drive measurable prompt quality improvements across iterations

---

## Key Metrics (swap into any bullet)

| Metric | Value |
|--------|-------|
| Codebase | 88K+ LOC |
| Scorers | 43 composable scorers |
| SDKs | TypeScript + Python (dual-language) |
| Temporal Workflows | 5 (eval-run, A/B test, training loop, progressive rollout, agent-run) |
| ClickHouse Schema | 13 tables/views, 12 skip indexes, 90-day TTL |
| Test Files | 352 with enforced CI coverage |
| Commits | 360+ |
| PRs | 100+ |
| Export Formats | 5 (TRL-SFT, TRL-DPO, TRL-KTO, DSPy, OpenAI FT) |
| Docker Services | 8 (ClickHouse, Postgres, Temporal, Redpanda, OTel, Worker, Frontend, UI) |
