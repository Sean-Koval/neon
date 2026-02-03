variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "pool_id" {
  description = "The Workload Identity Pool ID"
  type        = string
  default     = "github-pool"
}

variable "pool_display_name" {
  description = "Display name for the Workload Identity Pool"
  type        = string
  default     = "GitHub Actions Pool"
}

variable "provider_id" {
  description = "The Workload Identity Provider ID"
  type        = string
  default     = "github-provider"
}

variable "service_account_id" {
  description = "The service account ID"
  type        = string
  default     = "github-actions"
}

variable "service_account_display_name" {
  description = "Display name for the service account"
  type        = string
  default     = "GitHub Actions Service Account"
}

variable "github_repositories" {
  description = "List of GitHub repositories that can authenticate (format: owner/repo)"
  type        = list(string)
}

variable "service_account_roles" {
  description = "List of IAM roles to grant to the service account"
  type        = list(string)
  default = [
    "roles/artifactregistry.writer",
    "roles/artifactregistry.reader",
  ]
}

variable "attribute_condition" {
  description = "CEL expression to restrict which tokens can authenticate"
  type        = string
  default     = null
  # Example: "assertion.repository_owner == 'your-org'"
}
