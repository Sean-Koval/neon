# Infrastructure Architecture

> GCP infrastructure managed via Terraform

**Last Updated:** 2026-01-18

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GCP Project                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Cloud Load Balancer                          │   │
│  │                    (HTTPS, managed SSL cert)                        │   │
│  └────────────────────────────┬────────────────────────────────────────┘   │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                        │
│           ▼                   ▼                   ▼                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │   Cloud Run     │ │   Cloud Run     │ │   Cloud Run     │              │
│  │   (Frontend)    │ │   (API)         │ │   (MLflow)*     │              │
│  │                 │ │                 │ │                 │              │
│  │   Next.js 14    │ │   FastAPI       │ │   mlflow server │              │
│  │   Port 3000     │ │   Port 8000     │ │   Port 5000     │              │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘              │
│           │                   │                   │                        │
│           │                   ▼                   │                        │
│           │          ┌─────────────────┐          │                        │
│           │          │  Cloud Run Jobs │          │                        │
│           │          │  (Eval Runner)  │          │                        │
│           │          └────────┬────────┘          │                        │
│           │                   │                   │                        │
│           └───────────────────┼───────────────────┘                        │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Cloud SQL                                   │   │
│  │                      (PostgreSQL 16)                                 │   │
│  │                                                                      │   │
│  │   ┌──────────────────┐    ┌──────────────────┐                      │   │
│  │   │  agent_eval DB   │    │   mlflow DB      │                      │   │
│  │   │  (suites, runs)  │    │   (if self-host) │                      │   │
│  │   └──────────────────┘    └──────────────────┘                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │ Secret Manager  │ │ Cloud Storage   │ │ Artifact Reg.   │              │
│  │ (API keys,      │ │ (MLflow         │ │ (Container      │              │
│  │  LLM creds)     │ │  artifacts)     │ │  images)        │              │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                                                                             │
│  * MLflow optional - can use external/BYOM                                  │
└─────────────────────────────────────────────────────────────────────────────┘

External:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  GitHub         │  │  Claude API     │  │  User's MLflow  │
│  (CI/CD,        │  │  (LLM scoring)  │  │  (if BYOM)      │
│   Actions)      │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## GCP Services Used

| Service | Purpose | Tier/Config |
|---------|---------|-------------|
| **Cloud Run** | API, Frontend, MLflow | 1 vCPU, 512MB-2GB RAM |
| **Cloud Run Jobs** | Eval execution | 2 vCPU, 4GB RAM, 60min timeout |
| **Cloud SQL** | PostgreSQL database | db-f1-micro (dev), db-g1-small (prod) |
| **Cloud Storage** | MLflow artifacts | Standard storage |
| **Secret Manager** | Credentials | Pay per access |
| **Artifact Registry** | Container images | Standard |
| **Cloud Load Balancer** | HTTPS ingress | External HTTP(S) LB |
| **Cloud DNS** | Domain management | Optional |
| **Cloud Monitoring** | Observability | Default dashboards |
| **Cloud Build** | Container builds | Triggered by GitHub |

---

## Terraform Structure

```
terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       ├── terraform.tfvars
│       └── backend.tf
├── modules/
│   ├── cloud-run-service/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cloud-run-job/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cloud-sql/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── secrets/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── mlflow/              # Optional self-hosted MLflow
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── shared/
    └── backend.tf           # GCS backend config
```

---

## Core Terraform Modules

### Module: cloud-run-service

```hcl
# modules/cloud-run-service/main.tf

variable "name" {
  type = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "port" {
  type    = number
  default = 8080
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  type = list(object({
    name        = string
    secret_name = string
    version     = string
  }))
  default = []
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "allow_unauthenticated" {
  type    = bool
  default = false
}

resource "google_cloud_run_v2_service" "service" {
  name     = var.name
  location = var.region
  project  = var.project_id

  template {
    containers {
      image = var.image

      ports {
        container_port = var.port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.value.name
          value_source {
            secret_key_ref {
              secret  = env.value.secret_name
              version = env.value.version
            }
          }
        }
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "url" {
  value = google_cloud_run_v2_service.service.uri
}

output "name" {
  value = google_cloud_run_v2_service.service.name
}
```

### Module: cloud-run-job

```hcl
# modules/cloud-run-job/main.tf

variable "name" {
  type = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  type = list(object({
    name        = string
    secret_name = string
    version     = string
  }))
  default = []
}

variable "cpu" {
  type    = string
  default = "2"
}

variable "memory" {
  type    = string
  default = "4Gi"
}

variable "timeout" {
  type    = string
  default = "3600s"  # 1 hour
}

variable "max_retries" {
  type    = number
  default = 1
}

resource "google_cloud_run_v2_job" "job" {
  name     = var.name
  location = var.region
  project  = var.project_id

  template {
    template {
      containers {
        image = var.image

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        dynamic "env" {
          for_each = var.env_vars
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.secrets
          content {
            name = env.value.name
            value_source {
              secret_key_ref {
                secret  = env.value.secret_name
                version = env.value.version
              }
            }
          }
        }
      }

      timeout     = var.timeout
      max_retries = var.max_retries
    }
  }
}

output "name" {
  value = google_cloud_run_v2_job.job.name
}

output "id" {
  value = google_cloud_run_v2_job.job.id
}
```

### Module: cloud-sql

```hcl
# modules/cloud-sql/main.tf

variable "name" {
  type = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "tier" {
  type    = string
  default = "db-f1-micro"  # Dev: db-f1-micro, Prod: db-g1-small
}

variable "database_name" {
  type    = string
  default = "agent_eval"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

resource "google_sql_database_instance" "postgres" {
  name             = var.name
  database_version = "POSTGRES_16"
  region           = var.region
  project          = var.project_id

  deletion_protection = var.deletion_protection

  settings {
    tier = var.tier

    ip_configuration {
      ipv4_enabled = true
      # For Cloud Run, use Cloud SQL Proxy or private IP
      authorized_networks {
        name  = "allow-all"  # Tighten in production
        value = "0.0.0.0/0"
      }
    }

    backup_configuration {
      enabled            = true
      start_time         = "03:00"
      binary_log_enabled = false
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_user" "user" {
  name     = "agent_eval"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
  project  = var.project_id
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.name}-db-password"
  project   = var.project_id

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

output "connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "database_name" {
  value = google_sql_database.database.name
}

output "username" {
  value = google_sql_user.user.name
}

output "password_secret_id" {
  value = google_secret_manager_secret.db_password.secret_id
}

output "instance_ip" {
  value = google_sql_database_instance.postgres.public_ip_address
}
```

---

## Environment Configuration

### Dev Environment

```hcl
# environments/dev/main.tf

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "agent-eval-terraform-state"
    prefix = "dev"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  env = "dev"
}

# Database
module "database" {
  source = "../../modules/cloud-sql"

  name                = "agent-eval-${local.env}"
  project_id          = var.project_id
  region              = var.region
  tier                = "db-f1-micro"
  deletion_protection = false
}

# API Service
module "api" {
  source = "../../modules/cloud-run-service"

  name       = "agent-eval-api-${local.env}"
  project_id = var.project_id
  region     = var.region
  image      = "${var.region}-docker.pkg.dev/${var.project_id}/agent-eval/api:${var.api_image_tag}"
  port       = 8000
  cpu        = "1"
  memory     = "1Gi"

  env_vars = {
    ENVIRONMENT   = local.env
    DATABASE_HOST = module.database.instance_ip
    DATABASE_NAME = module.database.database_name
    DATABASE_USER = module.database.username
  }

  secrets = [
    {
      name        = "DATABASE_PASSWORD"
      secret_name = module.database.password_secret_id
      version     = "latest"
    },
    {
      name        = "ANTHROPIC_API_KEY"
      secret_name = "anthropic-api-key"
      version     = "latest"
    }
  ]

  allow_unauthenticated = true  # API auth handled at app level
}

# Frontend Service
module "frontend" {
  source = "../../modules/cloud-run-service"

  name       = "agent-eval-frontend-${local.env}"
  project_id = var.project_id
  region     = var.region
  image      = "${var.region}-docker.pkg.dev/${var.project_id}/agent-eval/frontend:${var.frontend_image_tag}"
  port       = 3000
  cpu        = "1"
  memory     = "512Mi"

  env_vars = {
    API_URL = module.api.url
  }

  allow_unauthenticated = true
}

# Eval Runner Job
module "eval_runner" {
  source = "../../modules/cloud-run-job"

  name       = "agent-eval-runner-${local.env}"
  project_id = var.project_id
  region     = var.region
  image      = "${var.region}-docker.pkg.dev/${var.project_id}/agent-eval/eval-runner:${var.api_image_tag}"
  cpu        = "2"
  memory     = "4Gi"
  timeout    = "3600s"

  env_vars = {
    ENVIRONMENT   = local.env
    DATABASE_HOST = module.database.instance_ip
    DATABASE_NAME = module.database.database_name
  }

  secrets = [
    {
      name        = "DATABASE_PASSWORD"
      secret_name = module.database.password_secret_id
      version     = "latest"
    },
    {
      name        = "ANTHROPIC_API_KEY"
      secret_name = "anthropic-api-key"
      version     = "latest"
    },
    {
      name        = "MLFLOW_TRACKING_URI"
      secret_name = "mlflow-tracking-uri"
      version     = "latest"
    }
  ]
}

# Outputs
output "api_url" {
  value = module.api.url
}

output "frontend_url" {
  value = module.frontend.url
}

output "database_connection" {
  value     = module.database.connection_name
  sensitive = true
}
```

### Variables

```hcl
# environments/dev/variables.tf

variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "GCP region"
}

variable "api_image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for API"
}

variable "frontend_image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for frontend"
}
```

---

## GitHub Actions Deployment

```yaml
# .github/workflows/deploy.yml

name: Deploy to GCP

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - prod

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: us-central1
  REGISTRY: us-central1-docker.pkg.dev

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGISTRY }}

      - name: Build and push API
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/agent-eval/api:${{ github.sha }} ./api
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/agent-eval/api:${{ github.sha }}

      - name: Build and push Frontend
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/agent-eval/frontend:${{ github.sha }} ./frontend
          docker push ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/agent-eval/frontend:${{ github.sha }}

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'dev' }}

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7.0"

      - name: Terraform Init
        working-directory: terraform/environments/${{ inputs.environment || 'dev' }}
        run: terraform init

      - name: Terraform Apply
        working-directory: terraform/environments/${{ inputs.environment || 'dev' }}
        run: |
          terraform apply -auto-approve \
            -var="project_id=${{ env.PROJECT_ID }}" \
            -var="api_image_tag=${{ github.sha }}" \
            -var="frontend_image_tag=${{ github.sha }}"
```

---

## Cost Estimate (Dev Environment)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| Cloud Run (API) | 1 vCPU, 1GB, ~100K requests | ~$5 |
| Cloud Run (Frontend) | 1 vCPU, 512MB, ~50K requests | ~$3 |
| Cloud Run Jobs | 2 vCPU, 4GB, ~100 job hours | ~$10 |
| Cloud SQL | db-f1-micro, 10GB | ~$10 |
| Cloud Storage | 10GB artifacts | ~$1 |
| Secret Manager | ~1K accesses | ~$1 |
| Artifact Registry | 5GB images | ~$1 |
| **Total (Dev)** | | **~$30/month** |

### Production Estimate

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| Cloud Run (API) | 2 vCPU, 2GB, HA | ~$50 |
| Cloud Run (Frontend) | 1 vCPU, 1GB, HA | ~$25 |
| Cloud Run Jobs | 4 vCPU, 8GB, ~500 job hours | ~$100 |
| Cloud SQL | db-g1-small, HA, 50GB | ~$80 |
| Cloud Storage | 100GB artifacts | ~$5 |
| Load Balancer | External HTTPS | ~$20 |
| **Total (Prod)** | | **~$280/month** |

---

## Bootstrap Steps

```bash
# 1. Create GCP project
gcloud projects create agent-eval-dev --name="AgentEval Dev"

# 2. Enable APIs
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com

# 3. Create Terraform state bucket
gsutil mb -l us-central1 gs://agent-eval-terraform-state

# 4. Create Artifact Registry
gcloud artifacts repositories create agent-eval \
  --repository-format=docker \
  --location=us-central1

# 5. Create initial secrets
echo -n "your-anthropic-key" | gcloud secrets create anthropic-api-key --data-file=-
echo -n "your-mlflow-uri" | gcloud secrets create mlflow-tracking-uri --data-file=-

# 6. Set up Workload Identity Federation for GitHub Actions
# (See GCP docs for detailed steps)

# 7. Initialize Terraform
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```
