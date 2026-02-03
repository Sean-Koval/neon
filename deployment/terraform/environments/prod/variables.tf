variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "github_repositories" {
  description = "GitHub repositories that can authenticate via Workload Identity"
  type        = list(string)
}

variable "vpc_network" {
  description = "VPC network name for the VPC connector"
  type        = string
  default     = "default"
}

variable "vpc_connector_cidr" {
  description = "CIDR range for the VPC connector"
  type        = string
  default     = "10.8.0.0/28"
}

variable "clickhouse_host" {
  description = "ClickHouse host address"
  type        = string
}

variable "temporal_address" {
  description = "Temporal server address"
  type        = string
}

variable "frontend_domain" {
  description = "Custom domain for the frontend"
  type        = string
  default     = null
}

variable "frontend_version" {
  description = "Version tag for frontend image"
  type        = string
  default     = "latest"
}

variable "workers_version" {
  description = "Version tag for workers image"
  type        = string
  default     = "latest"
}

variable "artifact_registry_readers" {
  description = "Additional IAM members who can read from Artifact Registry"
  type        = list(string)
  default     = []
}

variable "alert_notification_channels" {
  description = "Notification channels for alerts"
  type        = list(string)
  default     = []
}
