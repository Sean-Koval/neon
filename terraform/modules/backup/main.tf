# Backup Infrastructure Module
# terraform/modules/backup/main.tf
#
# Provisions GCS buckets, Cloud Scheduler jobs, and IAM for database backups.

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "clickhouse_backup_retention_days" {
  description = "Days to retain ClickHouse backups"
  type        = number
  default     = 30
}

variable "postgres_backup_retention_days" {
  description = "Days to retain PostgreSQL backups"
  type        = number
  default     = 30
}

variable "clickhouse_full_schedule" {
  description = "Cron schedule for ClickHouse full backups"
  type        = string
  default     = "0 2 * * 0" # Weekly Sunday 2 AM UTC
}

variable "clickhouse_incremental_schedule" {
  description = "Cron schedule for ClickHouse incremental backups"
  type        = string
  default     = "0 2 * * 1-6" # Mon-Sat 2 AM UTC
}

variable "postgres_schedule" {
  description = "Cron schedule for PostgreSQL backups"
  type        = string
  default     = "0 3 * * *" # Daily 3 AM UTC
}

variable "backup_image" {
  description = "Docker image for backup Cloud Run jobs"
  type        = string
  default     = ""
}

variable "alert_notification_channels" {
  description = "Notification channel IDs for backup failure alerts"
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# GCS Buckets
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "clickhouse_backups" {
  name     = "neon-clickhouse-backups-${var.environment}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = var.clickhouse_backup_retention_days
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age            = 7
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    service     = "neon"
    component   = "clickhouse-backup"
  }
}

resource "google_storage_bucket" "postgres_backups" {
  name     = "neon-postgres-backups-${var.environment}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = var.postgres_backup_retention_days
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age            = 7
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    service     = "neon"
    component   = "postgres-backup"
  }
}

# ---------------------------------------------------------------------------
# IAM - Backup Service Account
# ---------------------------------------------------------------------------

resource "google_service_account" "backup" {
  account_id   = "neon-backup-${var.environment}"
  display_name = "Neon Backup Service Account (${var.environment})"
  project      = var.project_id
}

resource "google_storage_bucket_iam_member" "clickhouse_backup_writer" {
  bucket = google_storage_bucket.clickhouse_backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backup.email}"
}

resource "google_storage_bucket_iam_member" "postgres_backup_writer" {
  bucket = google_storage_bucket.postgres_backups.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backup.email}"
}

# Allow the backup SA to read Cloud SQL instances (for pg_dump via proxy)
resource "google_project_iam_member" "backup_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backup.email}"
}

# Allow Cloud Scheduler to invoke Cloud Run jobs
resource "google_project_iam_member" "backup_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.backup.email}"
}

# ---------------------------------------------------------------------------
# Cloud Scheduler - Backup Cron Jobs
# ---------------------------------------------------------------------------

resource "google_cloud_scheduler_job" "clickhouse_full_backup" {
  name        = "neon-clickhouse-full-backup-${var.environment}"
  description = "Weekly full ClickHouse backup"
  schedule    = var.clickhouse_full_schedule
  time_zone   = "Etc/UTC"
  project     = var.project_id
  region      = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/neon-ch-backup-${var.environment}:run"

    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [{
          env = [
            { name = "BACKUP_TYPE", value = "full" },
            { name = "GCS_BUCKET", value = google_storage_bucket.clickhouse_backups.name },
            { name = "RETENTION_DAYS", value = tostring(var.clickhouse_backup_retention_days) },
          ]
        }]
      }
    }))

    oauth_token {
      service_account_email = google_service_account.backup.email
    }
  }
}

resource "google_cloud_scheduler_job" "clickhouse_incremental_backup" {
  name        = "neon-clickhouse-incr-backup-${var.environment}"
  description = "Daily incremental ClickHouse backup"
  schedule    = var.clickhouse_incremental_schedule
  time_zone   = "Etc/UTC"
  project     = var.project_id
  region      = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/neon-ch-backup-${var.environment}:run"

    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [{
          env = [
            { name = "BACKUP_TYPE", value = "incremental" },
            { name = "GCS_BUCKET", value = google_storage_bucket.clickhouse_backups.name },
            { name = "RETENTION_DAYS", value = tostring(var.clickhouse_backup_retention_days) },
          ]
        }]
      }
    }))

    oauth_token {
      service_account_email = google_service_account.backup.email
    }
  }
}

resource "google_cloud_scheduler_job" "postgres_backup" {
  name        = "neon-postgres-backup-${var.environment}"
  description = "Daily PostgreSQL backup"
  schedule    = var.postgres_schedule
  time_zone   = "Etc/UTC"
  project     = var.project_id
  region      = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/neon-pg-backup-${var.environment}:run"

    body = base64encode(jsonencode({
      overrides = {
        containerOverrides = [{
          env = [
            { name = "GCS_BUCKET", value = google_storage_bucket.postgres_backups.name },
            { name = "RETENTION_DAYS", value = tostring(var.postgres_backup_retention_days) },
          ]
        }]
      }
    }))

    oauth_token {
      service_account_email = google_service_account.backup.email
    }
  }
}

# ---------------------------------------------------------------------------
# Monitoring & Alerting
# ---------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "backup_failure" {
  count        = length(var.alert_notification_channels) > 0 ? 1 : 0
  display_name = "Neon Backup Failure (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "ClickHouse backup job failed"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_job"
        resource.labels.job_name=~"neon-ch-backup-${var.environment}"
        severity>=ERROR
      EOT
    }
  }

  conditions {
    display_name = "PostgreSQL backup job failed"

    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_job"
        resource.labels.job_name=~"neon-pg-backup-${var.environment}"
        severity>=ERROR
      EOT
    }
  }

  notification_channels = var.alert_notification_channels

  alert_strategy {
    auto_close = "604800s" # 7 days
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "clickhouse_backup_bucket" {
  value = google_storage_bucket.clickhouse_backups.name
}

output "postgres_backup_bucket" {
  value = google_storage_bucket.postgres_backups.name
}

output "backup_service_account_email" {
  value = google_service_account.backup.email
}
