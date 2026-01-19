# AgentEval - Dev Environment
# terraform/environments/dev/main.tf

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.10.0"
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

# Variables
variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

# Cloud SQL (PostgreSQL)
module "database" {
  source = "../../modules/cloud-sql"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  instance_tier = "db-f1-micro"
  disk_size_gb  = 10
}

# MLflow on Cloud Run
module "mlflow" {
  source = "../../modules/mlflow"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  database_connection_name = module.database.connection_name
  database_url            = module.database.mlflow_database_url
}

# API on Cloud Run
module "api" {
  source = "../../modules/cloud-run-service"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name        = "agenteval-api"

  image = "gcr.io/${var.project_id}/agenteval-api:latest"

  env_vars = {
    ENVIRONMENT          = var.environment
    MLFLOW_TRACKING_URI  = module.mlflow.url
    GOOGLE_CLOUD_PROJECT = var.project_id
    VERTEX_AI_LOCATION   = var.region
  }

  secrets = {
    DATABASE_URL = module.database.database_url_secret_id
  }

  database_connection_name = module.database.connection_name

  min_instances = 0
  max_instances = 2
  memory        = "1Gi"
  cpu           = 1
}

# Frontend on Cloud Run
module "frontend" {
  source = "../../modules/cloud-run-service"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  name        = "agenteval-frontend"

  image = "gcr.io/${var.project_id}/agenteval-frontend:latest"

  env_vars = {
    NEXT_PUBLIC_API_URL = module.api.url
  }

  min_instances = 0
  max_instances = 2
  memory        = "512Mi"
  cpu           = 1
}

# Outputs
output "api_url" {
  value = module.api.url
}

output "frontend_url" {
  value = module.frontend.url
}

output "mlflow_url" {
  value = module.mlflow.url
}

output "database_connection_name" {
  value = module.database.connection_name
}
