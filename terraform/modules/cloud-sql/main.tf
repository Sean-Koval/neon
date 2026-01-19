# Cloud SQL PostgreSQL Module
# terraform/modules/cloud-sql/main.tf

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type = string
}

variable "instance_tier" {
  type    = string
  default = "db-f1-micro"
}

variable "disk_size_gb" {
  type    = number
  default = 10
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = false
}

# Cloud SQL Instance
resource "google_sql_database_instance" "main" {
  name             = "agenteval-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier      = var.instance_tier
    disk_size = var.disk_size_gb
    disk_type = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = "projects/${var.project_id}/global/networks/default"
    }

    backup_configuration {
      enabled                        = var.environment == "prod"
      start_time                     = "03:00"
      point_in_time_recovery_enabled = var.environment == "prod"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = var.environment == "prod"
}

# Databases
resource "google_sql_database" "main" {
  name     = "agenteval"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_database" "mlflow" {
  name     = "mlflow"
  instance = google_sql_database_instance.main.name
}

# User
resource "google_sql_user" "main" {
  name     = "agenteval"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Store password in Secret Manager
resource "google_secret_manager_secret" "db_password" {
  secret_id = "agenteval-db-password-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# Store database URL in Secret Manager
resource "google_secret_manager_secret" "database_url" {
  secret_id = "agenteval-database-url-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql+asyncpg://agenteval:${random_password.db_password.result}@/agenteval?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
}

# Outputs
output "connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "instance_name" {
  value = google_sql_database_instance.main.name
}

output "database_url_secret_id" {
  value = google_secret_manager_secret.database_url.secret_id
}

output "mlflow_database_url" {
  value     = "postgresql://agenteval:${random_password.db_password.result}@/mlflow?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  sensitive = true
}
