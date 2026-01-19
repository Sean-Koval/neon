# Cloud Run Service Module
# terraform/modules/cloud-run-service/main.tf

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "name" {
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
  type    = map(string)
  default = {}
}

variable "database_connection_name" {
  type    = string
  default = ""
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "cpu" {
  type    = number
  default = 1
}

variable "timeout" {
  type    = number
  default = 300
}

variable "allow_unauthenticated" {
  type    = bool
  default = true
}

# Service Account
resource "google_service_account" "main" {
  account_id   = "${var.name}-${var.environment}"
  display_name = "${var.name} (${var.environment})"
}

# Grant Cloud SQL Client role
resource "google_project_iam_member" "cloudsql" {
  count   = var.database_connection_name != "" ? 1 : 0
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.main.email}"
}

# Grant Secret Manager access
resource "google_project_iam_member" "secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.main.email}"
}

# Grant Vertex AI access
resource "google_project_iam_member" "vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.main.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  name     = "${var.name}-${var.environment}"
  location = var.region

  template {
    service_account = google_service_account.main.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    timeout = "${var.timeout}s"

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      # Environment variables
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Secrets
      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      # Health check
      startup_probe {
        http_get {
          path = "/health"
          port = 8000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8000
        }
        period_seconds = 30
      }
    }

    # Cloud SQL connection
    dynamic "volumes" {
      for_each = var.database_connection_name != "" ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.database_connection_name]
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Allow unauthenticated access
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  location = google_cloud_run_v2_service.main.location
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "url" {
  value = google_cloud_run_v2_service.main.uri
}

output "service_account_email" {
  value = google_service_account.main.email
}
