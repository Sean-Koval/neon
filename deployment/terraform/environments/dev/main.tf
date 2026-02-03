# Development Environment
# Deploys Neon platform to GCP (Cloud Run + supporting infra)

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Backend configuration - uncomment and configure for your setup
  # backend "gcs" {
  #   bucket = "your-terraform-state-bucket"
  #   prefix = "neon/dev"
  # }
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
    "vpcaccess.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# Artifact Registry for Python packages
module "artifact_registry" {
  source = "../../modules/artifact-registry"

  location      = var.region
  repository_id = "python-packages"
  description   = "Internal Python packages (dev)"

  reader_members = [
    "serviceAccount:${module.neon_frontend.service_account_email}",
    "serviceAccount:${module.neon_workers.service_account_email}",
  ]

  writer_members = [
    "serviceAccount:${module.workload_identity.service_account_email}",
  ]

  labels = {
    environment = "dev"
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

# Neon Frontend (Cloud Run)
module "neon_frontend" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-frontend-dev"
  service_account_id = "neon-frontend-dev"
  image              = "gcr.io/${var.project_id}/neon-frontend:dev"

  cpu    = "1"
  memory = "512Mi"

  min_instances = 0
  max_instances = 2

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    NODE_ENV             = "development"
    LOG_LEVEL            = "debug"
    CLICKHOUSE_HOST      = var.clickhouse_host
    CLICKHOUSE_PORT      = "8123"
    TEMPORAL_ADDRESS     = var.temporal_address
  }

  allow_unauthenticated = true  # Dev environment

  labels = {
    environment = "dev"
    component   = "frontend"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Neon Workers (Cloud Run)
module "neon_workers" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-workers-dev"
  service_account_id = "neon-workers-dev"
  image              = "gcr.io/${var.project_id}/neon-workers:dev"

  cpu    = "1"
  memory = "1Gi"

  min_instances = 0
  max_instances = 3

  timeout = "600s"  # Longer timeout for workers

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    LOG_LEVEL            = "debug"
    CLICKHOUSE_HOST      = var.clickhouse_host
    CLICKHOUSE_PORT      = "8123"
    TEMPORAL_ADDRESS     = var.temporal_address
    TEMPORAL_NAMESPACE   = "default"
    TEMPORAL_TASK_QUEUE  = "agent-workers-dev"
  }

  service_account_roles = [
    "roles/secretmanager.secretAccessor",
  ]

  allow_unauthenticated = false
  invoker_members = [
    "serviceAccount:${module.neon_frontend.service_account_email}",
  ]

  labels = {
    environment = "dev"
    component   = "workers"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}
