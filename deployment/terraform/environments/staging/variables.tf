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
  default     = []
}

variable "clickhouse_host" {
  description = "ClickHouse host address"
  type        = string
  default     = ""
}

variable "temporal_address" {
  description = "Temporal server address"
  type        = string
  default     = ""
}
