# Monitoring Module - Variables
# terraform/modules/monitoring/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "notification_channels" {
  description = "List of notification channel IDs for alert delivery"
  type        = list(string)
  default     = []
}

variable "cloud_run_services" {
  description = "Map of Cloud Run service names to monitor (key = logical name, value = deployed service name)"
  type        = map(string)
  default     = {}
}

variable "enabled" {
  description = "Whether alerting is enabled"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for alert notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pagerduty_service_key" {
  description = "PagerDuty service integration key (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Configurable thresholds with sensible defaults
# ---------------------------------------------------------------------------

variable "alert_thresholds" {
  description = "Configurable alert thresholds. Override individual values per environment."
  type = object({
    # Cloud Run
    cpu_utilization_percent      = optional(number, 80)
    memory_utilization_percent   = optional(number, 85)
    request_latency_p95_ms       = optional(number, 2000)
    error_rate_5xx_percent       = optional(number, 5)
    container_startup_latency_s  = optional(number, 5)

    # ClickHouse
    clickhouse_query_latency_ms  = optional(number, 5000)
    clickhouse_disk_usage_percent = optional(number, 80)

    # Temporal
    workflow_failure_rate_percent   = optional(number, 5)
    activity_timeout_rate_percent   = optional(number, 2)
    task_queue_backlog_threshold    = optional(number, 100)

    # Application
    trace_ingestion_failure_percent = optional(number, 5)
    auth_failure_spike_count        = optional(number, 50)
    api_error_rate_percent          = optional(number, 2)
  })
  default = {}
}

# Alignment periods and durations
variable "alignment_period" {
  description = "Alignment period for metric aggregation (seconds)"
  type        = string
  default     = "300s"
}

variable "duration" {
  description = "Duration the condition must hold before firing (seconds)"
  type        = string
  default     = "300s"
}
