# Production Environment
# Deploys Neon platform to GCP with production-grade settings

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
  #   prefix = "neon/prod"
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
    "cloudkms.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# VPC Connector for private networking
resource "google_vpc_access_connector" "connector" {
  name          = "neon-vpc-connector"
  region        = var.region
  network       = var.vpc_network
  ip_cidr_range = var.vpc_connector_cidr

  min_instances = 2
  max_instances = 10

  depends_on = [google_project_service.apis]
}

# Artifact Registry for Python packages
module "artifact_registry" {
  source = "../../modules/artifact-registry"

  location      = var.region
  repository_id = "python-packages"
  description   = "Internal Python packages (production)"

  reader_members = concat(
    [
      "serviceAccount:${module.neon_frontend.service_account_email}",
      "serviceAccount:${module.neon_workers.service_account_email}",
    ],
    var.artifact_registry_readers
  )

  writer_members = [
    "serviceAccount:${module.workload_identity.service_account_email}",
  ]

  labels = {
    environment = "prod"
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

  # Restrict to specific branch for prod
  attribute_condition = "assertion.ref == 'refs/heads/main'"

  service_account_roles = [
    "roles/artifactregistry.writer",
    "roles/artifactregistry.reader",
    "roles/run.developer",
  ]

  depends_on = [google_project_service.apis]
}

# Neon Frontend (Cloud Run) - Production
module "neon_frontend" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-frontend"
  service_account_id = "neon-frontend"
  image              = "gcr.io/${var.project_id}/neon-frontend:${var.frontend_version}"

  cpu    = "2"
  memory = "1Gi"

  min_instances     = 2  # Always warm
  max_instances     = 20
  cpu_idle          = false  # Keep CPU allocated
  startup_cpu_boost = true

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    NODE_ENV             = "production"
    LOG_LEVEL            = "info"
    LOG_FORMAT           = "json"
    CLICKHOUSE_HOST      = var.clickhouse_host
    CLICKHOUSE_PORT      = "8123"
    TEMPORAL_ADDRESS     = var.temporal_address
  }

  secret_env_vars = {
    CLICKHOUSE_PASSWORD = {
      secret_name = google_secret_manager_secret.clickhouse_password.secret_id
      version     = "latest"
    }
  }

  vpc_connector = google_vpc_access_connector.connector.id
  vpc_egress    = "PRIVATE_RANGES_ONLY"

  allow_unauthenticated = true
  custom_domain         = var.frontend_domain

  service_account_roles = [
    "roles/secretmanager.secretAccessor",
  ]

  labels = {
    environment = "prod"
    component   = "frontend"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Neon Workers (Cloud Run) - Production
module "neon_workers" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  location   = var.region

  service_name       = "neon-workers"
  service_account_id = "neon-workers"
  image              = "gcr.io/${var.project_id}/neon-workers:${var.workers_version}"

  cpu    = "4"
  memory = "4Gi"

  min_instances     = 3  # Always warm
  max_instances     = 50
  cpu_idle          = false
  startup_cpu_boost = true

  timeout = "900s"  # 15 min for long-running evals

  pip_index_url = module.artifact_registry.repository_url

  env_vars = {
    LOG_LEVEL            = "info"
    LOG_FORMAT           = "json"
    CLICKHOUSE_HOST      = var.clickhouse_host
    CLICKHOUSE_PORT      = "8123"
    TEMPORAL_ADDRESS     = var.temporal_address
    TEMPORAL_NAMESPACE   = "production"
    TEMPORAL_TASK_QUEUE  = "agent-workers"
  }

  secret_env_vars = {
    CLICKHOUSE_PASSWORD = {
      secret_name = google_secret_manager_secret.clickhouse_password.secret_id
      version     = "latest"
    }
    ANTHROPIC_API_KEY = {
      secret_name = google_secret_manager_secret.anthropic_api_key.secret_id
      version     = "latest"
    }
  }

  vpc_connector = google_vpc_access_connector.connector.id
  vpc_egress    = "ALL_TRAFFIC"

  allow_unauthenticated = false
  invoker_members = [
    "serviceAccount:${module.neon_frontend.service_account_email}",
  ]

  service_account_roles = [
    "roles/secretmanager.secretAccessor",
  ]

  labels = {
    environment = "prod"
    component   = "workers"
    managed-by  = "terraform"
  }

  depends_on = [google_project_service.apis]
}

# Secrets
resource "google_secret_manager_secret" "clickhouse_password" {
  secret_id = "neon-clickhouse-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "neon-anthropic-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Alert policy for errors
resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "Neon High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run Error Rate > 5%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = var.alert_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }
}
