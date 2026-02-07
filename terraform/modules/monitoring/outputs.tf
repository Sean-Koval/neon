# Monitoring Module - Outputs
# terraform/modules/monitoring/outputs.tf

output "alert_policy_ids" {
  description = "Map of alert policy names to their IDs"
  value = var.enabled ? merge(
    { for k, v in google_monitoring_alert_policy.cloud_run_cpu : k => v.name },
    { for k, v in google_monitoring_alert_policy.cloud_run_memory : k => v.name },
    { "request_latency"                = google_monitoring_alert_policy.request_latency[0].name },
    { "error_rate_5xx"                 = google_monitoring_alert_policy.error_rate_5xx[0].name },
    { "instance_count_at_max"          = google_monitoring_alert_policy.instance_count_at_max[0].name },
    { "container_startup_latency"      = google_monitoring_alert_policy.container_startup_latency[0].name },
    { "clickhouse_query_latency"       = google_monitoring_alert_policy.clickhouse_query_latency[0].name },
    { "clickhouse_disk_usage"          = google_monitoring_alert_policy.clickhouse_disk_usage[0].name },
    { "clickhouse_connection_failures" = google_monitoring_alert_policy.clickhouse_connection_failures[0].name },
    { "workflow_failure_rate"          = google_monitoring_alert_policy.workflow_failure_rate[0].name },
    { "activity_timeout_rate"          = google_monitoring_alert_policy.activity_timeout_rate[0].name },
    { "task_queue_backlog"             = google_monitoring_alert_policy.task_queue_backlog[0].name },
    { "trace_ingestion_failures"       = google_monitoring_alert_policy.trace_ingestion_failures[0].name },
    { "batch_buffer_overflow"          = google_monitoring_alert_policy.batch_buffer_overflow[0].name },
    { "auth_failure_spike"             = google_monitoring_alert_policy.auth_failure_spike[0].name },
    { "api_error_rate"                 = google_monitoring_alert_policy.api_error_rate[0].name },
  ) : {}
}

output "notification_channel_ids" {
  description = "IDs of created notification channels"
  value = compact([
    var.alert_email != "" ? google_monitoring_notification_channel.email[0].name : "",
    var.slack_webhook_url != "" ? google_monitoring_notification_channel.slack[0].name : "",
    var.pagerduty_service_key != "" ? google_monitoring_notification_channel.pagerduty[0].name : "",
  ])
}

output "dashboard_url" {
  description = "URL of the GCP Monitoring dashboard"
  value       = var.enabled ? "https://console.cloud.google.com/monitoring/dashboards/custom/${google_monitoring_dashboard.main[0].id}?project=${var.project_id}" : ""
}
