# Cloud Run Module
# Deploys Neon services to Cloud Run

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

# Service Account for Cloud Run
resource "google_service_account" "cloud_run" {
  account_id   = var.service_account_id
  display_name = "${var.service_name} Cloud Run Service Account"
  description  = "Service account for ${var.service_name} Cloud Run service"
}

# Grant Artifact Registry reader to Cloud Run SA
resource "google_project_iam_member" "artifact_registry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Additional IAM roles for the service account
resource "google_project_iam_member" "additional_roles" {
  for_each = toset(var.service_account_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "service" {
  name     = var.service_name
  location = var.location
  ingress  = var.ingress

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = var.startup_cpu_boost
      }

      # Environment variables from map
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Environment variables from secrets
      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_name
              version = env.value.version
            }
          }
        }
      }

      # Artifact Registry pip configuration
      env {
        name  = "PIP_INDEX_URL"
        value = var.pip_index_url
      }
      env {
        name  = "PIP_EXTRA_INDEX_URL"
        value = "https://pypi.org/simple/"
      }

      ports {
        container_port = var.container_port
      }

      startup_probe {
        http_get {
          path = var.health_check_path
          port = var.container_port
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = var.health_check_path
          port = var.container_port
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    # VPC connector for private networking
    dynamic "vpc_access" {
      for_each = var.vpc_connector != null ? [1] : []
      content {
        connector = var.vpc_connector
        egress    = var.vpc_egress
      }
    }

    timeout = var.timeout
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = var.labels

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,  # Image managed by CI/CD
    ]
  }
}

# IAM: Allow unauthenticated access (if public)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.service.location
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# IAM: Allow specific members to invoke
resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  project  = var.project_id
  location = google_cloud_run_v2_service.service.location
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = each.value
}

# Custom domain mapping (optional)
resource "google_cloud_run_domain_mapping" "domain" {
  count = var.custom_domain != null ? 1 : 0

  location = var.location
  name     = var.custom_domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.service.name
  }
}
