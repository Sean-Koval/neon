# Technical Decisions

> Finalized technical decisions for implementation.

**Last Updated:** 2026-01-18
**Status:** All major decisions finalized

---

## Technology Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| **Language** | Python | 3.11+ |
| **ML Platform** | MLflow | >=3.7.0 |
| **API Framework** | FastAPI | >=0.109.0 |
| **ORM** | SQLAlchemy | >=2.0.0 |
| **Validation** | Pydantic | >=2.5.0 |
| **Frontend** | Next.js | 14.x |
| **Database** | PostgreSQL | 16 |
| **LLM Access** | Vertex AI SDK | >=1.38.0 |
| **IaC** | Terraform | >=1.7.0 |
| **Cloud** | GCP | - |

---

## Finalized Decisions

### D1: Cloud Platform — GCP

**Decision:** GCP for all infrastructure

**Rationale:**
- Strong ML/AI services (Vertex AI)
- Cloud Run excellent for containerized APIs
- Integrated Vertex AI SDK for LLM scoring
- Terraform provider mature

---

### D2: Compute — Cloud Run + Cloud Run Jobs

**Decision:**
- Cloud Run for API and Frontend services
- Cloud Run Jobs for eval execution (up to 24hr timeout)

**Rationale:**
- Serverless, auto-scaling, pay-per-use
- Cloud Run Jobs supports long-running eval workloads
- Simpler than GKE for this use case

**Configuration:**
| Service | CPU | Memory | Timeout |
|---------|-----|--------|---------|
| API | 1 | 1Gi | 300s |
| Frontend | 1 | 512Mi | 60s |
| Eval Runner | 2 | 4Gi | 3600s (1hr) |

---

### D3: Database — Cloud SQL (PostgreSQL 16)

**Decision:** Cloud SQL for all environments

**Rationale:**
- Managed backups, HA, maintenance
- Native GCP integration
- pgvector extension available for future semantic search

**Configuration:**
| Environment | Tier | Storage |
|-------------|------|---------|
| Dev | db-f1-micro | 10GB |
| Prod | db-g1-small | 50GB |

---

### D4: MLflow Hosting — Both BYOM + Self-Hosted

**Decision:** Support both modes:
1. **BYOM (Bring Your Own MLflow)** — Users provide their MLflow tracking URI
2. **Self-hosted** — Terraform module deploys MLflow on Cloud Run for testing/standalone use

**Rationale:**
- BYOM for teams with existing MLflow infrastructure
- Self-hosted option for testing and users without MLflow
- Flexibility without forcing migration

**Implementation:**
```python
# Config supports both modes
class Config:
    mlflow_tracking_uri: str  # User's MLflow or our deployed instance
    mlflow_mode: Literal["byom", "managed"]
```

---

### D5: Frontend Hosting — Cloud Run

**Decision:** Cloud Run for Next.js frontend

**Rationale:**
- Keeps everything in GCP
- Good SSR support
- Consistent deployment model with API

---

### D6: LLM Scoring — Vertex AI SDK

**Decision:** Use Vertex AI SDK (`google-cloud-aiplatform`) for all LLM scoring

**Rationale:**
- GCP-native, consistent auth
- Access to Claude (via Model Garden), Gemini, and other models
- Single SDK for multiple model providers
- Enterprise features (logging, quotas, VPC-SC)

**Supported Models:**
| Model | Use Case | Cost Tier |
|-------|----------|-----------|
| **Claude 3.5 Sonnet** (default) | High-quality scoring | High |
| **Gemini 1.5 Pro** | Cost-effective alternative | Medium |
| **Gemini 1.5 Flash** | Fast, cheap scoring | Low |

**Implementation:**
```python
from google.cloud import aiplatform
from vertexai.generative_models import GenerativeModel

class LLMJudge:
    def __init__(self, model: str = "claude-3-5-sonnet"):
        self.model = GenerativeModel(model)

    async def score(self, prompt: str) -> float:
        response = await self.model.generate_content_async(prompt)
        return self._parse_score(response.text)
```

---

### D7: Secret Management — GCP Secret Manager

**Decision:** GCP Secret Manager for all credentials

**Secrets stored:**
- `anthropic-api-key` (if using direct API)
- `database-password`
- `mlflow-tracking-uri`
- `github-webhook-secret`

---

### D8: CI/CD — GitHub Actions + Cloud Build

**Decision:**
- GitHub Actions for orchestration and deployment
- Cloud Build for container image builds

**Rationale:**
- GitHub Actions familiar, flexible
- Cloud Build faster for GCP-native builds
- Workload Identity Federation for secure auth

---

### D9: Eval Job Execution — Cloud Run Jobs

**Decision:** Cloud Run Jobs with Cloud Tasks queue for scaling

**Rationale:**
- Up to 24hr timeout (sufficient for most evals)
- Cloud Tasks provides queue management, retries
- Scales to parallel job execution

**Architecture:**
```
GitHub Action → API → Cloud Tasks → Cloud Run Job
                         ↓
                   (queue + retry)
```

---

### D10: Observability — Cloud Monitoring + Cloud Trace

**Decision:** GCP-native observability stack

**Components:**
- Cloud Monitoring for metrics and alerts
- Cloud Trace for distributed tracing
- Cloud Logging for structured logs

---

## Decision Summary Matrix

| Decision | Choice | Status |
|----------|--------|--------|
| Cloud Platform | GCP | ✅ Decided |
| Compute | Cloud Run + Cloud Run Jobs | ✅ Decided |
| Database | Cloud SQL (PostgreSQL 16) | ✅ Decided |
| MLflow | BYOM + Self-hosted option | ✅ Decided |
| Frontend | Cloud Run | ✅ Decided |
| LLM Scoring | Vertex AI SDK | ✅ Decided |
| Secrets | GCP Secret Manager | ✅ Decided |
| CI/CD | GitHub Actions + Cloud Build | ✅ Decided |
| Eval Jobs | Cloud Run Jobs + Cloud Tasks | ✅ Decided |
| Observability | Cloud Monitoring + Trace | ✅ Decided |

---

## MLflow 3.7 Features We Leverage

From [MLflow Releases](https://mlflow.org/releases):

| Feature | How We Use It |
|---------|---------------|
| **Trace Comparison UI** | Built-in A/B view reduces custom UI work |
| **Multi-turn Evaluation** | Support for conversational agents |
| **OpenTelemetry Integration** | Standard instrumentation |
| **Session-level Traces** | Group related agent runs |
| **Experiment Prompts UI** | Prompt versioning built-in |

---

## Vertex AI SDK Usage

### Installation
```bash
pip install google-cloud-aiplatform>=1.38.0
```

### Authentication
```python
# Uses Application Default Credentials in GCP
# For local dev, use: gcloud auth application-default login
import vertexai
vertexai.init(project="your-project", location="us-central1")
```

### Model Access
```python
from vertexai.generative_models import GenerativeModel

# Gemini models (native)
gemini = GenerativeModel("gemini-1.5-pro")

# Claude via Model Garden
claude = GenerativeModel("claude-3-5-sonnet@20241022")
```

### Cost Optimization
```python
class ScorerConfig:
    # Use cheaper models for simple checks
    tool_selection_model: str = "gemini-1.5-flash"  # Fast, cheap
    reasoning_model: str = "claude-3-5-sonnet"      # Best quality
    grounding_model: str = "gemini-1.5-pro"         # Good balance
```
