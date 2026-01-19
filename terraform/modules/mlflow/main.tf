# MLflow on Cloud Run Module
# terraform/modules/mlflow/main.tf

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "database_connection_name" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

# GCS bucket for artifacts
resource "google_storage_bucket" "artifacts" {
  name     = "${var.project_id}-mlflow-artifacts-${var.environment}"
  location = var.region

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }
}

# Service Account
resource "google_service_account" "mlflow" {
  account_id   = "mlflow-${var.environment}"
  display_name = "MLflow (${var.environment})"
}

# Grant storage access
resource "google_storage_bucket_iam_member" "artifacts" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.mlflow.email}"
}

# Grant Cloud SQL access
resource "google_project_iam_member" "cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.mlflow.email}"
}

# Store database URL in Secret Manager
resource "google_secret_manager_secret" "mlflow_db_url" {
  secret_id = "mlflow-database-url-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "mlflow_db_url" {
  secret      = google_secret_manager_secret.mlflow_db_url.id
  secret_data = var.database_url
}

# Grant secret access
resource "google_secret_manager_secret_iam_member" "mlflow_db_url" {
  secret_id = google_secret_manager_secret.mlflow_db_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mlflow.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "mlflow" {
  name     = "mlflow-${var.environment}"
  location = var.region

  template {
    service_account = google_service_account.mlflow.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "ghcr.io/mlflow/mlflow:v2.19.0"

      args = [
        "mlflow", "server",
        "--backend-store-uri", "$(MLFLOW_BACKEND_STORE_URI)",
        "--default-artifact-root", "gs://${google_storage_bucket.artifacts.name}",
        "--host", "0.0.0.0",
        "--port", "5000"
      ]

      ports {
        container_port = 5000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name = "MLFLOW_BACKEND_STORE_URI"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.mlflow_db_url.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 5000
        }
        initial_delay_seconds = 10
        period_seconds        = 10
        failure_threshold     = 5
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.database_connection_name]
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Allow unauthenticated access (for dev - consider restricting in prod)
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.environment == "dev" ? 1 : 0
  location = google_cloud_run_v2_service.mlflow.location
  name     = google_cloud_run_v2_service.mlflow.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "url" {
  value = google_cloud_run_v2_service.mlflow.uri
}

output "artifacts_bucket" {
  value = google_storage_bucket.artifacts.name
}
