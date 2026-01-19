# Initial Research

## MLflow 3.0+ GenAI Capabilities

### What MLflow Already Has

Based on [MLflow 3.0 documentation](https://mlflow.org/docs/3.6.0/genai/mlflow-3/):

| Feature | Description | Quality |
|---------|-------------|---------|
| **Tracing** | End-to-end observability for GenAI apps | Production-ready |
| **Typed Spans** | TOOL, CHAT_MODEL, RETRIEVER, etc. | Good |
| **Span Search** | `trace.search_spans(span_type=SpanType.TOOL)` | Good |
| **LLM Judges** | Built-in automated evaluation | Good |
| **Online Monitoring** | Auto-run judges on traces | New |
| **Trace Dashboard** | Performance metrics, quality metrics, tool call summaries | Good |
| **Framework Support** | LangChain, LlamaIndex, PydanticAI, smolagents | Broad |
| **Distributed Tracing** | Cross-service trace propagation | New |
| **LoggedModel** | First-class model entity with lineage | New |

### What MLflow Lacks (Our Opportunity)

| Gap | Description |
|-----|-------------|
| **Agent-specific scorers** | No built-in rubrics for tool selection, reasoning quality |
| **Regression detection** | No automated comparison between agent versions |
| **CI/CD integration** | No GitHub Actions, no quality gates |
| **Test suite management** | No structured way to define expected behaviors |
| **A/B comparison UI** | Basic comparison, not agent-optimized |
| **Failure → test pipeline** | No workflow to convert failures to test cases |

### MLflow Scorer Interface

```python
from mlflow.genai.scorers import Scorer
from mlflow.entities import Trace

class CustomScorer(Scorer):
    def score(self, trace: Trace) -> float:
        # Access spans, analyze behavior
        tool_spans = trace.search_spans(span_type=SpanType.TOOL)
        # Return score 0.0 - 1.0
        return score
```

This is extensible — we can build custom scorers on top.

---

## Competitive Landscape Summary

Based on research from [Arize](https://arize.com/llm-evaluation-platforms-top-frameworks/), [Braintrust](https://www.braintrust.dev/articles/best-llm-tracing-tools-2026), and [Softcery](https://softcery.com/lab/top-8-observability-platforms-for-ai-agents-in-2025):

### LangSmith
- **Best for:** LangChain/LangGraph teams
- **Strengths:** Native integration, great tracing, easy setup
- **Weaknesses:** Limited eval detail, no CI/CD gates, LangChain lock-in
- **Pricing:** Free 5K traces, $39/mo for 50K

### Braintrust
- **Best for:** Evaluation-first teams, TypeScript/JavaScript
- **Strengths:** Side-by-side comparison, experiment framework
- **Weaknesses:** Limited agent tracing, not production-scale observability
- **Pricing:** Usage-based

### Arize Phoenix
- **Best for:** Open-source, framework-agnostic, self-hosted
- **Strengths:** 50+ instrumentations, session-level agent eval, free unlimited
- **Weaknesses:** Complex UI, steep learning curve
- **Pricing:** Free (open source)

### Langfuse
- **Best for:** Open-source, self-hosting, deep integrations
- **Strengths:** Transparency, custom workflows, good eval + observability balance
- **Weaknesses:** Less polished than commercial options
- **Pricing:** Free (open source) + cloud option

### Key Insight

> "Helicone focuses on monitoring, Braintrust focuses on evaluation, Phoenix balances both."

No one focuses specifically on **agent-specific evaluation + CI/CD integration + regression detection**.

---

## Technical Foundation

### OpenTelemetry as Standard

From [LakFS research](https://lakefs.io/blog/llm-observability-tools/):

> "OpenTelemetry has become the standard framework for LLM tracing, providing vendor-neutral instrumentation... Each step in the workflow, such as prompt processing, model inferencing, retrieval actions, and response generation, is captured as an individual span."

MLflow uses OpenTelemetry-compatible tracing (OpenInference).

### Market Trends (2025-2026)

From [O-Mega guide](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide):

> "The boundaries between evaluation, observability, and security will continue to blur. Meta-LLMs will likely take over the heavy lifting—generating tests, proposing rubrics, and adapting to new failure patterns in real-time."

> "Observability platforms will likely add features to monitor compliance... Already, some tools allow logging of reasons or explanations for actions."

---

## Agent Failure Modes

What agent-specific scorers need to evaluate:

### 1. Tool Selection Failures
- Called wrong tool for the task
- Called unnecessary tools (wasted compute)
- Failed to call required tools
- Called tools in wrong order

### 2. Reasoning Failures
- Incorrect chain-of-thought
- Premature conclusion
- Ignored relevant information
- Circular reasoning

### 3. Grounding Failures
- Hallucinated tool outputs
- Made claims not supported by tool results
- Invented data not retrieved

### 4. Termination Failures
- Stopped too early (incomplete)
- Continued unnecessarily (wasted compute)
- Got stuck in loops

### 5. Context Failures
- Lost track of original goal
- Ignored user constraints
- Misunderstood instructions

---

## Initial Technical Direction

### Build on MLflow because:
1. ✅ Already has tracing, spans, basic judges
2. ✅ OpenTelemetry-compatible
3. ✅ Framework integrations exist
4. ✅ Open source, widely adopted
5. ✅ Extensible scorer interface

### Add value through:
1. Agent-specific scorer library
2. Regression detection system
3. CI/CD integration (GitHub Action)
4. Test suite management UI
5. A/B comparison view

### Don't rebuild:
- Tracing infrastructure
- Span storage
- Basic LLM judges
- Framework instrumentation
