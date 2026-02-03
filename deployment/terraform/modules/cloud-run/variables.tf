variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "location" {
  description = "The Cloud Run location"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "The name of the Cloud Run service"
  type        = string
}

variable "image" {
  description = "The container image to deploy"
  type        = string
}

variable "service_account_id" {
  description = "The service account ID for the Cloud Run service"
  type        = string
}

variable "service_account_roles" {
  description = "Additional IAM roles for the service account"
  type        = list(string)
  default     = []
}

variable "container_port" {
  description = "The container port"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU allocation"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory allocation"
  type        = string
  default     = "512Mi"
}

variable "cpu_idle" {
  description = "Whether CPU should be throttled when idle"
  type        = bool
  default     = true
}

variable "startup_cpu_boost" {
  description = "Whether to boost CPU during startup"
  type        = bool
  default     = true
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "timeout" {
  description = "Request timeout"
  type        = string
  default     = "300s"
}

variable "env_vars" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Environment variables from Secret Manager"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {}
}

variable "pip_index_url" {
  description = "The pip index URL for Artifact Registry"
  type        = string
}

variable "health_check_path" {
  description = "Path for health check probes"
  type        = string
  default     = "/health"
}

variable "ingress" {
  description = "Ingress settings (INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER)"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "vpc_connector" {
  description = "VPC connector for private networking"
  type        = string
  default     = null
}

variable "vpc_egress" {
  description = "VPC egress setting (ALL_TRAFFIC, PRIVATE_RANGES_ONLY)"
  type        = string
  default     = "PRIVATE_RANGES_ONLY"
}

variable "allow_unauthenticated" {
  description = "Whether to allow unauthenticated access"
  type        = bool
  default     = false
}

variable "invoker_members" {
  description = "List of IAM members who can invoke the service"
  type        = list(string)
  default     = []
}

variable "custom_domain" {
  description = "Custom domain for the service"
  type        = string
  default     = null
}

variable "labels" {
  description = "Labels to apply to the service"
  type        = map(string)
  default = {
    managed-by = "terraform"
  }
}
