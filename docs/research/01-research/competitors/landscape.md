# Competitive Landscape

## Market Map

```
                    EVALUATION FOCUS
                          ↑
                          │
        [Braintrust]      │      [AgentEval Target]
             ●            │            ★
                          │
    ←─────────────────────┼─────────────────────→
    GENERIC LLM           │         AGENT-SPECIFIC
                          │
        [LangSmith]       │      [Arize Phoenix]
             ●            │            ●
                          │
                          ↓
                   OBSERVABILITY FOCUS
```

**Our position:** Agent-specific evaluation with CI/CD integration — a gap no one fully owns.

---

## Direct Competitors

### None Own the Full Space

No competitor offers: **Agent-specific scorers + Regression detection + CI/CD gates + MLflow-native**

This is a greenfield opportunity within the MLflow ecosystem.

---

## Adjacent Competitors

### 1. LangSmith (LangChain)

**What they do:** Tracing + basic evaluation for LangChain apps

**Strengths:**
| Strength | Detail |
|----------|--------|
| Native LangChain integration | One env variable setup |
| Excellent tracing | Shows every step, tool call, retrieval |
| Established brand | Go-to for LangChain teams |
| Good developer experience | Easy to get started |

**Weaknesses:**
| Weakness | Detail |
|----------|--------|
| LangChain lock-in | Limited value outside ecosystem |
| Basic evaluation | Generic judges, no agent-specific rubrics |
| No CI/CD integration | Manual eval runs only |
| No regression detection | Can't compare versions systematically |
| Closed source | Can't extend or self-host (except enterprise) |

**Pricing:** Free 5K traces/mo, $39/mo Developer (50K traces)

**Threat level:** Medium — could add features, but ecosystem lock-in limits them

**Source:** [Braintrust comparison](https://www.braintrust.dev/articles/best-llm-tracing-tools-2026)

---

### 2. Braintrust

**What they do:** Evaluation-first platform with experiment framework

**Strengths:**
| Strength | Detail |
|----------|--------|
| Evaluation focus | Core strength, not bolted on |
| Side-by-side comparison | Good experiment UI |
| TypeScript/JavaScript support | Strong for JS teams |
| Custom database (Brainstore) | 86x faster full-text search |

**Weaknesses:**
| Weakness | Detail |
|----------|--------|
| Limited agent tracing | "Advanced use case" not core feature |
| Only 5 instrumentations | vs. 50+ for Arize |
| No agent-specific eval | Doesn't trace agents well |
| Not production-scale observability | Better for experimentation |

**Pricing:** Usage-based

**Threat level:** Low — different focus (experimentation vs. production CI/CD)

**Source:** [Arize comparison](https://arize.com/docs/phoenix/learn/resources/faqs/braintrust-open-source-alternative-llm-evaluation-platform-comparison)

---

### 3. Arize Phoenix

**What they do:** Open-source observability + evaluation

**Strengths:**
| Strength | Detail |
|----------|--------|
| Open source | Free, unlimited, self-host |
| 50+ instrumentations | Most framework coverage |
| Agent evaluation | Session-level, path eval, convergence |
| Online monitoring | Auto-run judges on production traces |
| OpenInference | OTel-compatible tracing |

**Weaknesses:**
| Weakness | Detail |
|----------|--------|
| Complex UI | Overwhelming for non-data scientists |
| No CI/CD integration | No quality gates |
| Learning curve | Heavy on charts and statistics |

**Pricing:** Free (open source)

**Threat level:** High — closest to our space, but no CI/CD focus

**Source:** [Arize docs](https://arize.com/llm-evaluation-platforms-top-frameworks/)

---

### 4. Langfuse

**What they do:** Open-source LLM observability + evaluation

**Strengths:**
| Strength | Detail |
|----------|--------|
| Open source | Transparency, self-hosting |
| Good balance | Observability + evaluation |
| Prompt versioning | Link versions to traces |
| Growing adoption | Active community |

**Weaknesses:**
| Weakness | Detail |
|----------|--------|
| Less polished | Than commercial options |
| No CI/CD integration | Manual processes |
| Generic evaluation | Not agent-specific |

**Pricing:** Free (open source) + cloud option

**Threat level:** Medium — could expand into our space

---

### 5. MLflow 3.0 (Databricks)

**What they do:** The foundation we build on

**Strengths:**
| Strength | Detail |
|----------|--------|
| Massive adoption | Industry standard for ML |
| GenAI features | Tracing, spans, LLM judges |
| Open source | Extensible |
| Databricks backing | Enterprise credibility |

**Weaknesses:**
| Weakness | Detail |
|----------|--------|
| Generic judges | Not agent-specific |
| No regression detection | Basic comparison only |
| No CI/CD gates | Not in core product |
| UI limitations | Not optimized for agent workflows |

**Pricing:** Free (open source) + Databricks managed

**Relationship:** Partner, not competitor — we extend MLflow

**Source:** [MLflow 3.0 docs](https://mlflow.org/docs/3.6.0/genai/mlflow-3/)

---

## Competitive Positioning

### Feature Comparison Matrix

| Capability | LangSmith | Braintrust | Arize Phoenix | Langfuse | MLflow | AgentEval |
|------------|-----------|------------|---------------|----------|--------|-----------|
| **Tracing** | ✅ | ⚠️ | ✅ | ✅ | ✅ | Uses MLflow |
| **Generic LLM judges** | ✅ | ✅ | ✅ | ✅ | ✅ | Uses MLflow |
| **Agent-specific scorers** | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ |
| **Regression detection** | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ |
| **CI/CD gates** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Test suite management** | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |
| **A/B comparison** | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **Open source** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Self-hosted** | Enterprise | Enterprise | ✅ | ✅ | ✅ | ✅ |

### Positioning Statement

> For agent teams using MLflow who need to prevent regressions and automate quality gates, AgentEval provides agent-specific scorers, version comparison, and CI/CD integration — unlike generic LLM evaluation tools that don't understand agent failure modes.

---

## Competitive Response Scenarios

### If Arize adds CI/CD integration
- They have agent eval but no CI/CD focus
- Our deeper CI/CD integration (GitHub Actions, quality gates) is differentiated
- We're MLflow-native; they're their own ecosystem

### If LangSmith adds agent-specific eval
- They're locked to LangChain ecosystem
- We're framework-agnostic via MLflow
- CI/CD integration remains a gap for them

### If MLflow adds these features natively
- Possible in long term (Databricks resources)
- We can contribute upstream or pivot to complementary features
- First-mover advantage in the meantime

---

## Moat Assessment

| Moat Type | Strength | Notes |
|-----------|----------|-------|
| Network effects | Low | No inherent network effects |
| Switching costs | Medium | Test suites and scorers create lock-in |
| Technical | Medium | Agent-specific scorers require domain expertise |
| Brand/trust | Building | Need to establish in MLflow community |
| Distribution | Medium | MLflow ecosystem provides reach |

**Primary moat:** Best agent-specific evaluation + CI/CD integration for MLflow users

---

## Sources

- [Arize LLM Evaluation Platforms](https://arize.com/llm-evaluation-platforms-top-frameworks/)
- [Braintrust LLM Tracing Tools 2026](https://www.braintrust.dev/articles/best-llm-tracing-tools-2026)
- [Softcery AI Observability Platforms 2025](https://softcery.com/lab/top-8-observability-platforms-for-ai-agents-in-2025)
- [O-Mega Agent Observability Guide 2026](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide)
- [Databricks MLflow 3.0 Blog](https://www.databricks.com/blog/mlflow-30-unified-ai-experimentation-observability-and-governance)
