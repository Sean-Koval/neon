# Changelog

All notable changes to the Neon Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-01-XX

### Added

- **Core SDK**
  - `Neon` async client and `NeonSync` synchronous client
  - `NeonConfig` for client configuration
  - Pydantic models for all data types (Trace, Span, Score, etc.)

- **Tracing**
  - Context managers: `trace`, `span`, `generation`, `tool`, `retrieval`, `reasoning`, `planning`, `prompt`, `routing`, `memory`
  - `@traced` decorator for functions (sync and async)
  - Automatic context propagation with `contextvars`
  - Nested span support

- **Scorers**
  - Rule-based scorers: `contains`, `exact_match`, `tool_selection_scorer`, `json_match_scorer`, `latency_scorer`, `error_rate_scorer`, `token_efficiency_scorer`, `success_scorer`, `iteration_scorer`
  - LLM judge scorers: `llm_judge`, `response_quality_judge`, `safety_judge`, `helpfulness_judge`
  - Causal analysis: `causal_analysis_scorer`, `root_cause_scorer`, `analyze_causality`
  - Custom scorer support via `define_scorer` and `@scorer` decorator

- **ClickHouse Integration** (optional: `pip install neon-sdk[clickhouse]`)
  - `NeonClickHouseClient` for trace storage and analytics
  - Methods: `insert_traces`, `insert_spans`, `insert_scores`, `query_traces`, `get_trace_with_spans`, `get_dashboard_summary`, `get_daily_stats`, `get_score_trends`

- **Temporal Integration** (optional: `pip install neon-sdk[temporal]`)
  - `NeonTemporalClient` for durable workflow execution
  - Agent run workflows: `start_agent_run`, `get_agent_status`, `get_agent_progress`, `approve_agent`, `wait_for_agent_result`
  - Evaluation workflows: `start_eval_run`, `get_eval_progress`

- **Integrations**
  - Agent Lightning export format for RL training
  - Optimization signal generation module

### Notes

- Full feature parity with TypeScript SDK (`@neon/sdk`)
- Type-safe with comprehensive type hints
- PEP 561 compatible (includes `py.typed`)

[Unreleased]: https://github.com/neon-dev/neon/compare/python-sdk-v0.1.0...HEAD
[0.1.0]: https://github.com/neon-dev/neon/releases/tag/python-sdk-v0.1.0
