# Staging Environment
# Similar to production but with reduced resources

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# Artifact Registry - use same repo as prod (or separate)
module "artifact_registry" {
  source = "../../modules/artifact-registry"

  location      = var.region
  repository_id = "python-packages"
  description   = "Internal Python packages (staging)"

  reader_members = [
    "serviceAccount:${module.neon_frontend.service_account_email}",
    "serviceAccount:${module.neon_workers.service_account_email}",
  ]

  writer_members = [
    "serviceAccount:${module.workload_identity.service_account_email}",
  ]

  labels = {
    environment = "staging"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Workload Identity for GitHub Actions
module "workload_identity" {
  source = "../../modules/workload-identity"

  project_id = var.project_id

  pool_id    = "github-pool"
  provider_id = "github-provider"

  service_account_id = "github-actions"

  github_repositories = var.github_repositories

  service_account_roles = [
    "roles/artifactregistry.writer",
    "roles/artifactregistry.reader",
    "roles/run.developer",
  ]

  depends_on = [google_project_service.apis]
}

# Neon Frontend (Cloud Run) - Staging
module "neon_frontend" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-frontend-staging"
  service_account_id = "neon-frontend-staging"
  image              = "gcr.io/${var.project_id}/neon-frontend:staging"

  cpu    = "1"
  memory = "512Mi"

  min_instances = 1
  max_instances = 5

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    NODE_ENV             = "staging"
    LOG_LEVEL            = "info"
    CLICKHOUSE_HOST      = var.clickhouse_host
    TEMPORAL_ADDRESS     = var.temporal_address
  }

  allow_unauthenticated = true

  labels = {
    environment = "staging"
    component   = "frontend"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Neon Workers (Cloud Run) - Staging
module "neon_workers" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-workers-staging"
  service_account_id = "neon-workers-staging"
  image              = "gcr.io/${var.project_id}/neon-workers:staging"

  cpu    = "2"
  memory = "2Gi"

  min_instances = 1
  max_instances = 10

  timeout = "600s"

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    LOG_LEVEL            = "info"
    CLICKHOUSE_HOST      = var.clickhouse_host
    TEMPORAL_ADDRESS     = var.temporal_address
    TEMPORAL_NAMESPACE   = "staging"
    TEMPORAL_TASK_QUEUE  = "agent-workers-staging"
  }

  allow_unauthenticated = false
  invoker_members = [
    "serviceAccount:${module.neon_frontend.service_account_email}",
  ]

  labels = {
    environment = "staging"
    component   = "workers"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}
