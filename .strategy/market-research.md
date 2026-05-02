# AgentOps / AIOps / LLMOps Competitive Landscape 2025-2026

## Market Research Report

**Date:** February 2026
**Scope:** Agent evaluation, observability, and development platforms
**Focus:** Competitive positioning for Neon agent evaluation platform

---

## Table of Contents

1. [Market Overview](#1-market-overview)
2. [Competitor Deep Dives](#2-competitor-deep-dives)
3. [Feature Comparison Matrix](#3-feature-comparison-matrix)
4. [Market Gaps & Unmet Needs](#4-market-gaps--unmet-needs)
5. [Emerging Trends](#5-emerging-trends)
6. [Enterprise Pain Points](#6-enterprise-pain-points)
7. [Neon Differentiation Opportunities](#7-neon-differentiation-opportunities)
8. [Strategic Recommendations](#8-strategic-recommendations)

---

## 1. Market Overview

### Market Size & Growth

- **AI Agents Market (2025):** $7.63B, projected to reach $182.97B by 2033 (49.6% CAGR)
- **2026 Projection:** ~$10.91B globally
- **North America:** 39.63% of global market share
- **Key drivers:** Automation demand, NLP advances, enterprise AI adoption

### Market Maturity

- **89%** of organizations have implemented some agent observability
- **62%** have detailed step-level tracing
- **57%** have agents in production (large enterprises leading)
- **32%** cite quality as the #1 production barrier
- **20%** cite latency as the #2 barrier

### The Shift: LLMOps → AgentOps

The market is undergoing a fundamental transition:
- **2023-2024:** Simple LLM observability (log prompt/response, track tokens)
- **2025:** Agent-aware tracing (tool calls, multi-step workflows, RAG pipelines)
- **2026+:** Full agent lifecycle platforms (build, test, deploy, monitor, optimize)

Most existing tools were built for the LLMOps era and are retrofitting agent support. This creates an opening for agent-native platforms.

---

## 2. Competitor Deep Dives

### Tier 1: Major Platforms (Well-funded, broad feature sets)

#### LangSmith (LangChain)
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Observability + evaluation for LangChain/LangGraph ecosystem |
| **Pricing** | Free (1 seat, 5k traces/mo), Plus $39/user/mo (10k traces), Enterprise custom |
| **Open Source** | No (proprietary SaaS), but LangChain framework is OSS |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Tracing, custom dashboards (P50/P99 latency, cost), evaluation datasets, prompt playground, agent debugging ("Polly" AI assistant for trace analysis) |
| **Differentiators** | Deep LangChain/LangGraph integration (1-env-var setup), largest ecosystem, "Polly" AI-assisted debugging (Dec 2025), BYOC & self-hosted options |
| **Weaknesses** | Vendor lock-in perception (LangChain-native), pricing scales with traces, no durable execution, limited multi-agent debugging |
| **Deployment** | Cloud, BYOC, Self-hosted |

#### Braintrust
| Attribute | Details |
|-----------|---------|
| **Core Focus** | AI observability with evals, datasets, and AI proxy |
| **Pricing** | Free (5 users, 1M spans, 10k outputs/mo), Pro $249/mo (unlimited spans), Enterprise custom |
| **Open Source** | No (proprietary) |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Evals with CI/CD (GitHub Action), AI proxy for routing/caching, interactive playground, "Loop" built-in optimization agent, Brainstore (custom query engine) |
| **Differentiators** | Generous free tier, built-in AI agent ("Loop") for prompt optimization, purpose-built data store (Brainstore, 24x faster), native CI/CD GitHub Action |
| **Weaknesses** | Steep jump from free to $249/mo Pro, closed-source, limited framework integrations vs LangSmith |
| **Deployment** | Cloud only |

#### Arize Phoenix
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Open-source AI observability & evaluation |
| **Pricing** | Free (OSS, fully self-hostable), Arize Cloud (paid tiers) |
| **Open Source** | Yes - fully OSS, no feature gates |
| **SDK Languages** | Python (primary), JS/TS via OpenTelemetry |
| **Key Features** | Distributed tracing, LLM evaluators (built-in + Ragas/DeepEval), prompt playground, datasets & experiments, cost tracking, prompt management (Apr 2025) |
| **Differentiators** | Fully open-source with no restrictions, built on OpenTelemetry standard, vendor/framework-agnostic, runs anywhere (local, Jupyter, cloud) |
| **Weaknesses** | Less polished UI than commercial tools, smaller community than Langfuse, enterprise support requires Arize Cloud |
| **Deployment** | Self-hosted (Docker/K8s), local, cloud |

#### Weights & Biases Weave
| Attribute | Details |
|-----------|---------|
| **Core Focus** | LLM tracing & evaluation integrated with W&B ML platform |
| **Pricing** | Free tier available, W&B pricing model (Teams $50/user/mo) |
| **Open Source** | Weave SDK is OSS, platform is SaaS |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Auto-patching LLM libraries, production trace monitoring, built-in scorers, evaluation leaderboards, online evals (preview), unified ML+LLM dashboard |
| **Differentiators** | Leverages existing W&B user base and ML experiment tracking, unified ML + LLM observability, strong enterprise presence |
| **Weaknesses** | Tied to W&B ecosystem, LLM features still maturing vs dedicated tools, complex pricing |
| **Deployment** | Cloud, self-hosted (enterprise) |

---

### Tier 2: Specialized & Growing Platforms

#### Patronus AI
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Automated LLM evaluation & security (enterprise) |
| **Pricing** | Custom/enterprise (AWS Marketplace subscription) |
| **Open Source** | No |
| **SDK Languages** | Python |
| **Key Features** | Pre-built evaluation models (hallucination, toxicity, PII), adversarial test case generation, FinanceBench (10k financial Q&A), LLM failure monitoring, MCP server |
| **Differentiators** | Security-first approach, adversarial testing at scale, domain-specific benchmarks (finance), evaluation foundation models |
| **Weaknesses** | Enterprise-only pricing (opaque), narrow focus on evaluation (not full lifecycle), limited SDK language support |

#### Galileo
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Agent reliability - evaluation + guardrails |
| **Pricing** | Free (5k traces/mo), Enterprise tiers |
| **Open Source** | No (proprietary) |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Evaluation Foundation Models (EFMs), Luna-2 guardrail models (<200ms, $0.02/M tokens), real-time guardrails SDK, agentic evaluations (Jan 2025), action interception |
| **Differentiators** | Purpose-built evaluation models (not LLM-as-judge), sub-200ms guardrails, real-time agent action interception, strong team (Google AI, Apple Siri, Google Brain), $68M funding |
| **Weaknesses** | Smaller community than LangSmith/Langfuse, guardrails focus may limit appeal for teams wanting full observability |

#### Humanloop
| Attribute | Details |
|-----------|---------|
| **Core Focus** | LLM evals + prompt management for enterprises |
| **Pricing** | Free (individual), Team $150/mo (5 users), Enterprise custom |
| **Open Source** | No |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Prompt versioning with diff views, evaluation automation, human-in-the-loop feedback, subject matter expert workflows, CI/CD integration |
| **Differentiators** | Strong prompt management UX, collaboration between engineers and domain experts, audit trails |
| **Weaknesses** | **Platform was set to sunset Sept 2025** - current status uncertain. If deprecated, validates market need but removes a competitor |

#### Portkey
| Attribute | Details |
|-----------|---------|
| **Core Focus** | AI Gateway with observability |
| **Pricing** | Starts $49/mo, Enterprise custom |
| **Open Source** | Gateway is OSS (GitHub) |
| **SDK Languages** | Python, TypeScript, REST |
| **Key Features** | Gateway routing to 200+ LLMs, 50+ guardrails, 40+ observability metrics, cost/latency analytics, request logging with 15+ filters |
| **Differentiators** | Gateway-first approach (routing, fallbacks, load balancing), broadest LLM provider support (200+), combined gateway + observability |
| **Weaknesses** | Gateway focus means evaluation features are thinner, less depth in agent-specific debugging |

#### Helicone
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Open-source LLM observability (minimal setup) |
| **Pricing** | Free (10k requests/mo), paid tiers |
| **Open Source** | Yes (OSS) |
| **SDK Languages** | Python, TypeScript, REST (URL-swap integration) |
| **Key Features** | 1-line integration (URL swap), session/trace debugging, prompt management, Redis-based caching (up to 95% cost reduction), unified API for 100+ providers |
| **Differentiators** | Simplest setup (URL change, no SDK needed), intelligent caching, cost optimization focus |
| **Weaknesses** | Lighter on evaluation capabilities, less agent-specific features, smaller community than Langfuse |

---

### Tier 3: Open-Source & Emerging Players

#### Langfuse
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Open-source LLM engineering platform |
| **Pricing** | Free (50k units, 2 users), Cloud tiers, Self-hosted free (MIT license) |
| **Open Source** | Yes - MIT license, 19k+ GitHub stars |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Tracing (multi-turn), prompt versioning + playground, LLM-as-judge + human feedback + custom evals, cost tracking, OpenTelemetry support, 50+ framework integrations |
| **Differentiators** | **OSS leader** (19k+ stars, MIT), self-host without restrictions, broadest integration ecosystem (50+ frameworks), strong community, startup/education discounts |
| **Weaknesses** | Self-hosted requires operational overhead, enterprise features need license key, less polished than commercial platforms |

#### AgentOps.ai
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Agent-native observability SDK |
| **Pricing** | Free tier, paid tiers (details unclear) |
| **Open Source** | SDK is OSS |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Auto-instrumentation, session replay (point-in-time precision), cost tracking, failure detection, 400+ framework integrations, multi-agent interaction tracking |
| **Differentiators** | Agent-first design (not LLM-first), session replay visualization, broadest framework support (400+), auto-instrumentation |
| **Weaknesses** | Smaller platform than tier-1 competitors, less evaluation depth, dashboard capabilities less mature |

#### Opik (Comet ML)
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Open-source LLM evaluation & observability |
| **Pricing** | Free (OSS), Comet Cloud tiers |
| **Open Source** | Yes |
| **SDK Languages** | Python, TypeScript (new 2025) |
| **Key Features** | Deep tracing, LLM-as-judge, experiment management, Agent Optimizer (automated prompt optimization, public beta), guardrails, multimodal support (audio preview), OpenTelemetry integration |
| **Differentiators** | Agent Optimizer (automated prompt/agent optimization), backed by Comet ML platform, multimodal support |
| **Weaknesses** | Newer entrant, smaller community than Langfuse/Phoenix, still maturing |

#### TruLens (TruEra)
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Evaluation & tracing with feedback functions |
| **Pricing** | Free (OSS) |
| **Open Source** | Yes |
| **SDK Languages** | Python |
| **Key Features** | Feedback functions (programmatic quality scoring), RAG Triad evaluation, OpenTelemetry integration, span-based evaluation, honest/harmless/helpful evals |
| **Differentiators** | Research-backed evaluation methodology (RAG Triad), programmatic feedback functions, OTel-native |
| **Weaknesses** | Python-only, smaller community, more framework than platform, limited UI |

#### DeepEval / Confident AI
| Attribute | Details |
|-----------|---------|
| **Core Focus** | LLM evaluation framework (pytest-like) |
| **Pricing** | DeepEval OSS free, Confident AI platform (paid) |
| **Open Source** | DeepEval is OSS (400k+ monthly downloads) |
| **SDK Languages** | Python |
| **Key Features** | 30+ built-in metrics, pytest-like interface, G-Eval (research-backed), agent trajectory evaluation, RAG verification, CI/CD integration |
| **Differentiators** | Familiar testing paradigm (pytest), research-backed metrics, 20M+ evaluations run, lightweight framework approach |
| **Weaknesses** | Python-only, evaluation-only (no observability), requires Confident AI for platform features |

#### LangWatch
| Attribute | Details |
|-----------|---------|
| **Core Focus** | Agent testing with simulations |
| **Pricing** | Free tier, paid tiers |
| **Open Source** | Yes (GitHub) |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Agent simulations (thousands of synthetic conversations), framework-agnostic AgentAdapter, multi-layer evaluation (functional, safety, performance, UX, regression), production monitoring |
| **Differentiators** | **Simulation-based testing** (unique in market), supports 10+ agent frameworks via AgentAdapter, combined testing + monitoring |
| **Weaknesses** | Newer entrant, smaller community, simulation approach still being validated by market |

#### Maxim AI
| Attribute | Details |
|-----------|---------|
| **Core Focus** | End-to-end simulation, evaluation & observability |
| **Pricing** | Paid tiers (enterprise focus) |
| **Open Source** | No |
| **SDK Languages** | Python, TypeScript |
| **Key Features** | Full agentic lifecycle (prompt engineering → simulation → eval → monitoring), production-grade evaluation, drift detection |
| **Differentiators** | Unified platform covering entire agent lifecycle, strong enterprise positioning |
| **Weaknesses** | Less community traction, enterprise-focused pricing |

---

## 3. Feature Comparison Matrix

| Feature | LangSmith | Braintrust | Arize Phoenix | Langfuse | Galileo | AgentOps | Opik | LangWatch | **Neon** |
|---------|-----------|------------|---------------|----------|---------|----------|------|-----------|---------|
| **Tracing** | Deep | Deep | Deep | Deep | Basic | Deep | Deep | Basic | Deep |
| **Evals-as-code** | Partial | Yes | Yes | Partial | Yes | No | Yes | Yes | **Yes** |
| **Durable Execution** | No | No | No | No | No | No | No | No | **Yes (Temporal)** |
| **Multi-agent Debug** | Limited | No | Limited | Limited | No | Yes | Limited | Yes (sim) | **Yes** |
| **Agent Simulations** | No | No | No | No | No | No | No | **Yes** | No (gap) |
| **Guardrails** | No | No | No | No | **Yes** | No | Yes | Yes | No (gap) |
| **Prompt Management** | Yes | Yes | Yes (new) | Yes | No | No | No | No | No (gap) |
| **CI/CD Integration** | Yes | **Native GH** | Manual | Manual | Manual | No | Manual | Yes | Partial |
| **Open Source** | No | No | **Yes** | **Yes (MIT)** | No | SDK only | Yes | Yes | No |
| **Self-hosted** | Yes | No | Yes | **Yes** | No | No | Yes | Yes | **Yes (Docker)** |
| **TypeScript SDK** | Yes | Yes | OTel | Yes | Yes | Yes | Yes (new) | Yes | **Yes** |
| **Python SDK** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **Yes** |
| **Regression Detection** | Limited | Statistical | No | No | No | No | No | Yes | **Yes** |
| **Cost Tracking** | Yes | Yes | Yes | Yes | No | Yes | Yes | No | Partial |
| **Session Replay** | No | No | No | No | No | **Yes** | No | No | No |

---

## 4. Market Gaps & Unmet Needs

### Gap 1: Durable Execution for Agent Workflows
**Nobody provides this well.** Current platforms observe agents but don't execute them. Teams use separate orchestration (LangGraph, CrewAI, bare async) alongside separate observability (LangSmith, Langfuse). The integration between execution and observability is manual and fragile. Neon's Temporal-based durable execution is **unique in the market**.

### Gap 2: True Multi-Agent Debugging
Multi-agent systems create cascading errors, emergent behaviors, and non-deterministic outcomes. Most platforms show flat trace trees — they don't visualize inter-agent communication, shared state mutations, or race conditions. Only AgentOps.ai attempts session replay; nobody does proper multi-agent topology visualization.

### Gap 3: Continuous Evaluation in Production
Most evaluation is pre-deployment (run eval suite → pass/fail → deploy). Continuous evaluation on production traffic with automated regression detection is rare. Carnegie Mellon research shows teams with established baselines detect regressions **3x faster**. Neon already has regression detection — this is a differentiator.

### Gap 4: Agent-Native Testing (Not LLM-Native)
Most tools test LLM outputs. Very few test agent behaviors — tool selection, planning, recovery from errors, multi-step goal completion. LangWatch's simulation approach is the closest, but it's still emerging. The market needs frameworks for testing agent trajectories, not just individual LLM calls.

### Gap 5: Unified Build-Test-Deploy-Monitor Platform
Every competitor covers 1-2 phases. Nobody offers:
- Define eval suites in code → Execute durably → Trace in production → Detect regressions → Feed back to eval suites

This closed-loop workflow is the "AgentOps 2.0" vision.

### Gap 6: Domain Expert Collaboration
Engineers write evals; domain experts review outputs. The handoff is awkward in most tools. Humanloop tried to solve this (now sunset?). Braintrust's playground helps. But the collaboration workflow between ML engineers, domain experts, and product managers remains broken.

### Gap 7: Cross-Framework Interoperability
Teams use multiple agent frameworks (LangGraph for one use case, CrewAI for another, custom for a third). Observability tools are framework-biased. OpenTelemetry is standardizing tracing, but evaluation and testing remain framework-specific.

---

## 5. Emerging Trends

### Trend 1: From LLMOps to AgentOps
The industry is shifting from monitoring individual LLM calls to monitoring autonomous agent systems. This requires:
- **Outcome-level metrics** (did the agent achieve its goal?) vs token-level metrics
- **Multi-turn conversation analysis** vs single request/response
- **Tool usage patterns** vs prompt/completion pairs
- **Planning and reasoning traces** vs input/output logs

### Trend 2: Eval-Driven Development
Teams are adopting "eval-driven development" — writing evaluation suites before building agents, similar to TDD. This requires:
- Evals-as-code (not UI-only configuration)
- CI/CD integration for regression testing
- Dataset management and versioning
- Statistical significance testing for regressions

### Trend 3: OpenTelemetry as the Standard
OpenTelemetry-based GenAI semantic conventions are emerging as the standard for agent tracing. Platforms that adopt OTel will benefit from:
- Vendor interoperability
- Existing enterprise observability stack integration
- Community-maintained instrumentation libraries

### Trend 4: Agent Simulations & Synthetic Testing
LangWatch pioneered simulation-based agent testing. Expect this to become standard:
- Synthetic user personas for multi-turn testing
- Edge case generation at scale
- Adversarial testing (Patronus AI's specialty)
- Scenario-based regression testing

### Trend 5: Real-Time Guardrails
Galileo's sub-200ms guardrails and Portkey's 50+ guardrail integrations show the market moving toward real-time safety:
- PII detection before agent actions execute
- Policy compliance checking
- Hallucination detection on outputs
- Action interception for high-risk operations

### Trend 6: AI-Assisted Debugging
LangSmith launched "Polly" (AI assistant for trace analysis) in Dec 2025. Braintrust has "Loop" for prompt optimization. Expect every platform to add AI-powered features:
- Root cause analysis from traces
- Suggested eval improvements
- Automated prompt optimization
- Anomaly explanation

### Trend 7: Compliance & Governance
Enterprise adoption drives compliance requirements:
- Audit logging of all agent actions
- Role-based access to traces and evals
- Data residency (BYOC, self-hosted)
- Regulatory reporting dashboards
- SOC 2, HIPAA, GDPR compliance

---

## 6. Enterprise Pain Points

### Critical Challenges (from research)

1. **Model Performance Gap:** Models degrade significantly on domain-specific data vs benchmarks. Teams lack tools to measure this gap continuously.

2. **Hallucination at Scale:** A single hallucinating agent can damage brand reputation, leak data, or create regulatory exposure. Detection must be real-time, not post-hoc.

3. **Evaluation Framework Paralysis:** Too many metrics, no clear methodology. Teams either over-index on accuracy (missing safety) or track too many metrics (analysis paralysis).

4. **Tool Sprawl:** Too many vendors, no unified workflow. Teams use separate tools for prompt management, evaluation, tracing, monitoring, and deployment.

5. **Collaboration Breakdown:** Engineers write code; domain experts know quality; product managers define requirements. No tool bridges all three effectively.

6. **Debugging Multi-Agent Systems:** Cascading errors, emergent behaviors, non-deterministic outcomes. Traditional debugging tools fail for distributed agent architectures.

7. **Cost Management:** Enterprise LLM costs scale rapidly. Teams need granular cost attribution by agent, workflow, customer, and model.

8. **Regression Detection:** Model updates, prompt changes, and dependency updates can silently degrade quality. Manual testing doesn't scale.

---

## 7. Neon Differentiation Opportunities

### Current Unique Advantages

| Advantage | Why It Matters | Competitors |
|-----------|---------------|-------------|
| **Durable Execution (Temporal)** | No other eval platform executes workflows durably. This is Neon's moat. | None — unique |
| **Evals-as-Code (TS + Python)** | Dual-SDK with code-first approach. Most competitors are UI-first or Python-only. | Braintrust, DeepEval (Python-only) |
| **ClickHouse Analytics** | Purpose-built for trace analytics at scale vs generic databases. | Braintrust (Brainstore) |
| **Regression Detection** | Automated detection of quality degradation. Most competitors lack this entirely. | Braintrust (statistical), LangWatch (monitoring) |
| **Self-Hosted (Docker Compose)** | Full platform self-hostable. Key for enterprise data residency. | Langfuse, Phoenix |

### What "10x Better" Looks Like

1. **Closed-loop eval workflow:** Define evals → Execute durably → Monitor production → Detect regressions → Auto-generate new test cases from failures → Feed back to eval suites. Nobody does this end-to-end.

2. **Agent topology visualization:** Show multi-agent communication graphs, not just flat traces. Visualize inter-agent dependencies, shared state, bottlenecks.

3. **Outcome-based evaluation:** Score agents on goal completion (did the customer get their refund?) not just output quality (was the response polite?).

4. **Time-travel debugging:** Replay agent executions step-by-step, modify inputs at any point, see how the agent would have behaved differently. Durable execution makes this possible.

5. **Eval-driven CI/CD:** Run eval suites on every PR, with statistical significance testing, automatic approval/rejection, and regression reports. Braintrust's GitHub Action is closest, but Neon can go deeper.

---

## 8. Strategic Recommendations

### Short-term (Next 3 months)

1. **Double down on durable execution as the differentiator.** No competitor offers this. Make it the headline feature. Position: "The only agent evaluation platform with durable execution."

2. **Add OpenTelemetry support.** This is becoming the standard. OTel integration unlocks enterprise observability stacks and reduces vendor lock-in concerns.

3. **Strengthen CI/CD integration.** GitHub Action for eval-on-PR with regression reports. Braintrust proves this is a winning feature.

4. **Improve multi-agent debugging UX.** Topology visualization, inter-agent message flows, cascading error detection.

### Medium-term (3-6 months)

5. **Add agent simulation testing.** LangWatch validates the market need. Neon's durable execution makes simulations more reliable (retries, fault tolerance).

6. **Build guardrails SDK.** Galileo and Portkey show demand. Real-time guardrails that integrate with durable workflows.

7. **Launch closed-loop eval workflow.** Production failures → auto-generated test cases → regression suite. This is the "AgentOps 2.0" vision.

8. **Prompt management.** Essential table-stakes feature. Langfuse, LangSmith, Helicone all have it.

### Long-term (6-12 months)

9. **AI-assisted debugging.** Trace analysis AI (like LangSmith's Polly) but powered by Neon's deeper execution data.

10. **Enterprise governance dashboard.** Compliance metrics, audit logging, RBAC, data residency. Required for large enterprise deals.

11. **Agent marketplace.** Templates for common agent patterns with pre-built eval suites. Reduce time-to-first-eval.

12. **Outcome-based evaluation framework.** Move beyond LLM output scoring to agent goal completion tracking.

### Positioning Strategy

**Not "another LLM observability tool."** Position Neon as:

> **"The agent evaluation platform with durable execution."**

Key messaging pillars:
- **Reliability:** Durable execution means evals never fail silently
- **Depth:** Code-first evals (not UI-click configs) for serious engineering teams
- **Closed-loop:** Production monitoring feeds back into evaluation suites
- **Self-hosted:** Full platform runs in your infrastructure
- **Dual-SDK:** TypeScript and Python, not one or the other

### Competitive Positioning Map

```
                    Agent-Native ↑
                                |
              Neon (target) ◆   |   ◆ AgentOps.ai
                                |
                    ◆ LangWatch |
                                |
   ◆ Galileo        ◆ Maxim    |
                                |
    ◆ Patronus                  |
                                |
 Eval-Only ←--------+---------→ Full Platform
                                |
                    ◆ W&B Weave |
         ◆ DeepEval             |   ◆ Braintrust
                                |
              ◆ TruLens         |   ◆ LangSmith
                                |
   ◆ Arize Phoenix  ◆ Langfuse |
         ◆ Helicone  ◆ Portkey |
                                |
                    LLM-Native ↓
```

Neon's target quadrant: **Agent-native + Full platform.** No competitor occupies this space today. The closest are LangSmith (full platform but LLM-native) and AgentOps.ai (agent-native but eval-weak).

---

## Appendix: Key Data Sources

- AI Agents Market Size: Grand View Research, GM Insights, Markets and Markets
- LangChain State of Agent Engineering 2025
- IBM AgentOps Research
- Carnegie Mellon regression detection research
- Platform-specific documentation and pricing pages
- Competitor GitHub repositories and changelogs
