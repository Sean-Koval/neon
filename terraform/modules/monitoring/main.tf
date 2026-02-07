# Monitoring Module - Alert Policies
# terraform/modules/monitoring/main.tf
#
# Comprehensive alerting for the Neon agent evaluation platform.
# Covers Cloud Run services, ClickHouse, Temporal, and application-level metrics.

locals {
  thresholds = var.alert_thresholds
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    platform    = "neon"
  }
}

# =============================================================================
# CLOUD RUN ALERTS
# =============================================================================

# ---------------------------------------------------------------------------
# 1. CPU utilization > threshold for 5 min (per service)
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "cloud_run_cpu" {
  for_each     = var.enabled ? var.cloud_run_services : {}
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run CPU High - ${each.key}"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: CPU utilization on Cloud Run service `${each.value}` exceeds ${local.thresholds.cpu_utilization_percent}% for 5 minutes.

      **Impact**: Degraded request processing, increased latency, potential request timeouts.

      **Remediation**:
      1. Check for traffic spikes in Cloud Run metrics
      2. Review recent deployments for performance regressions
      3. Consider increasing CPU allocation or max instance count
      4. Profile the application for CPU-intensive operations
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "CPU utilization > ${local.thresholds.cpu_utilization_percent}% on ${each.value}"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.value}\" AND metric.type = \"run.googleapis.com/container/cpu/utilizations\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.cpu_utilization_percent / 100
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MEAN"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 2. Memory utilization > threshold for 5 min (per service)
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "cloud_run_memory" {
  for_each     = var.enabled ? var.cloud_run_services : {}
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run Memory High - ${each.key}"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Memory utilization on Cloud Run service `${each.value}` exceeds ${local.thresholds.memory_utilization_percent}% for 5 minutes.

      **Impact**: OOM kills, service restarts, request failures.

      **Remediation**:
      1. Check for memory leaks using profiling tools
      2. Review recent deployments for memory regression
      3. Increase memory allocation in Cloud Run service config
      4. Check for large payload processing or unbounded caches
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Memory utilization > ${local.thresholds.memory_utilization_percent}% on ${each.value}"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.value}\" AND metric.type = \"run.googleapis.com/container/memory/utilizations\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.memory_utilization_percent / 100
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MEAN"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 3. Request latency P95 > threshold for 5 min
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "request_latency" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run Request Latency High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: P95 request latency across Cloud Run services exceeds ${local.thresholds.request_latency_p95_ms}ms for 5 minutes.

      **Impact**: Poor user experience, potential timeout errors, SLO violations.

      **Remediation**:
      1. Check downstream dependency health (ClickHouse, Temporal, Postgres)
      2. Look for slow database queries or external API calls
      3. Review recent deployments for performance regressions
      4. Check if scaling limits are being hit
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Request latency P95 > ${local.thresholds.request_latency_p95_ms}ms"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.request_latency_p95_ms
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 4. Error rate (5xx) > threshold for 3 min
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "error_rate_5xx" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run 5xx Error Rate High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: 5xx error rate exceeds ${local.thresholds.error_rate_5xx_percent}% for 3 minutes.

      **Impact**: Users experiencing server errors, potential data loss, broken workflows.

      **Remediation**:
      1. Check Cloud Run logs for error details
      2. Verify downstream service health (database, Temporal, ClickHouse)
      3. Check for deployment issues or misconfigurations
      4. Review error patterns for root cause (OOM, timeout, dependency failure)
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "5xx error rate > ${local.thresholds.error_rate_5xx_percent}%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.error_rate_5xx_percent
      duration        = "180s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 5. Instance count at max scaling limit
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "instance_count_at_max" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run At Max Instance Limit"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Cloud Run service has reached its maximum instance count and cannot scale further.

      **Impact**: Request queuing, increased latency, potential 429/503 errors under load.

      **Remediation**:
      1. Increase max_instances in Cloud Run configuration
      2. Optimize per-request resource usage to handle more load per instance
      3. Check for traffic anomalies or DDoS patterns
      4. Consider implementing request rate limiting
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Instance count at max scaling limit"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/instance_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 6. Container startup latency > threshold
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "container_startup_latency" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Cloud Run Slow Container Startup"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Container startup latency exceeds ${local.thresholds.container_startup_latency_s}s.

      **Impact**: Cold start delays affecting user experience, especially during scale-up events.

      **Remediation**:
      1. Optimize container image size (use smaller base images)
      2. Reduce application initialization time
      3. Set min_instances > 0 to keep warm instances available
      4. Review startup probes and health check configuration
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Container startup latency > ${local.thresholds.container_startup_latency_s}s"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/startup_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.container_startup_latency_s * 1000
      duration        = "0s"

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.labels.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# =============================================================================
# CLICKHOUSE ALERTS (log-based metrics)
# =============================================================================

# ---------------------------------------------------------------------------
# Log-based metrics for ClickHouse monitoring
# ---------------------------------------------------------------------------
resource "google_logging_metric" "clickhouse_query_latency" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/clickhouse-query-latency"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"clickhouse\" AND jsonPayload.event=\"query_complete\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    display_name = "ClickHouse Query Latency"
  }

  value_extractor = "EXTRACT(jsonPayload.duration_ms)"

  bucket_options {
    explicit_buckets {
      bounds = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    }
  }
}

resource "google_logging_metric" "clickhouse_connection_failures" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/clickhouse-connection-failures"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"clickhouse\" AND severity>=ERROR AND jsonPayload.event=\"connection_failed\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "ClickHouse Connection Failures"
  }
}

# ---------------------------------------------------------------------------
# 7. ClickHouse query latency high
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "clickhouse_query_latency" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] ClickHouse Query Latency High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: ClickHouse query latency P95 exceeds ${local.thresholds.clickhouse_query_latency_ms}ms.

      **Impact**: Slow dashboard loading, trace query timeouts, degraded analytics.

      **Remediation**:
      1. Check ClickHouse system.query_log for slow queries
      2. Review table partition strategy and indexes
      3. Check disk I/O and memory pressure on ClickHouse
      4. Consider adding materialized views for heavy queries
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "ClickHouse query latency P95 > ${local.thresholds.clickhouse_query_latency_ms}ms"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/clickhouse-query-latency\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.clickhouse_query_latency_ms
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.clickhouse_query_latency]
}

# ---------------------------------------------------------------------------
# 8. ClickHouse disk usage > threshold
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "clickhouse_disk_usage" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] ClickHouse Disk Usage High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: ClickHouse disk usage exceeds ${local.thresholds.clickhouse_disk_usage_percent}%.

      **Impact**: Write failures, data loss, service crash if disk fills completely.

      **Remediation**:
      1. Check data retention policies (TTL on tables)
      2. Run OPTIMIZE TABLE to merge parts and reclaim space
      3. Review partition scheme and drop old partitions
      4. Increase disk allocation
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "ClickHouse disk usage > ${local.thresholds.clickhouse_disk_usage_percent}%"

    condition_threshold {
      filter          = "resource.type = \"gce_instance\" AND metric.type = \"agent.googleapis.com/disk/percent_used\" AND metric.labels.device = starts_with(\"clickhouse\")"
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.clickhouse_disk_usage_percent
      duration        = var.duration

      aggregations {
        alignment_period   = var.alignment_period
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels
}

# ---------------------------------------------------------------------------
# 9. ClickHouse connection failures
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "clickhouse_connection_failures" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] ClickHouse Connection Failures"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: ClickHouse connection failures detected.

      **Impact**: Trace ingestion stopped, dashboard queries failing, data loss.

      **Remediation**:
      1. Check ClickHouse service health and logs
      2. Verify network connectivity between Cloud Run and ClickHouse
      3. Check ClickHouse max_connections and connection pool settings
      4. Restart ClickHouse if unresponsive
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "ClickHouse connection failures > 0"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/clickhouse-connection-failures\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.clickhouse_connection_failures]
}

# =============================================================================
# TEMPORAL ALERTS (log-based metrics)
# =============================================================================

# ---------------------------------------------------------------------------
# Log-based metrics for Temporal monitoring
# ---------------------------------------------------------------------------
resource "google_logging_metric" "temporal_workflow_failures" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/temporal-workflow-failures"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"temporal\" AND jsonPayload.event=\"workflow_failed\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Temporal Workflow Failures"
  }
}

resource "google_logging_metric" "temporal_workflow_completions" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/temporal-workflow-completions"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"temporal\" AND jsonPayload.event=\"workflow_completed\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Temporal Workflow Completions"
  }
}

resource "google_logging_metric" "temporal_activity_timeouts" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/temporal-activity-timeouts"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"temporal\" AND jsonPayload.event=\"activity_timeout\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Temporal Activity Timeouts"
  }
}

resource "google_logging_metric" "temporal_task_queue_backlog" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/temporal-task-queue-backlog"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"temporal\" AND jsonPayload.event=\"task_queue_depth\""

  metric_descriptor {
    metric_kind  = "GAUGE"
    value_type   = "INT64"
    display_name = "Temporal Task Queue Backlog"
  }

  value_extractor = "EXTRACT(jsonPayload.queue_depth)"
}

# ---------------------------------------------------------------------------
# 10. Workflow failure rate > threshold
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "workflow_failure_rate" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Temporal Workflow Failure Rate High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Temporal workflow failure rate exceeds ${local.thresholds.workflow_failure_rate_percent}%.

      **Impact**: Evaluation runs failing, incomplete results, user-visible errors.

      **Remediation**:
      1. Check Temporal UI for failed workflow details and stack traces
      2. Review worker logs for error patterns
      3. Verify external dependencies (LLM APIs, database connections)
      4. Check for poison pill messages or malformed eval configurations
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Workflow failure rate > ${local.thresholds.workflow_failure_rate_percent}%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-workflow-failures\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.workflow_failure_rate_percent
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.temporal_workflow_failures]
}

# ---------------------------------------------------------------------------
# 11. Activity timeout rate > threshold
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "activity_timeout_rate" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Temporal Activity Timeout Rate High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Temporal activity timeout rate exceeds ${local.thresholds.activity_timeout_rate_percent}%.

      **Impact**: Evaluation steps timing out, workflows retrying excessively, slow completion times.

      **Remediation**:
      1. Check which activities are timing out in Temporal UI
      2. Review activity timeout configuration (start-to-close, schedule-to-close)
      3. Verify external API response times (LLM providers)
      4. Consider increasing timeout values or adding circuit breakers
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Activity timeout rate > ${local.thresholds.activity_timeout_rate_percent}%"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-activity-timeouts\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.activity_timeout_rate_percent
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.temporal_activity_timeouts]
}

# ---------------------------------------------------------------------------
# 12. Task queue backlog growing
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "task_queue_backlog" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Temporal Task Queue Backlog Growing"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Temporal task queue backlog exceeds ${local.thresholds.task_queue_backlog_threshold} pending tasks.

      **Impact**: Evaluation processing delayed, growing queue indicates workers cannot keep up.

      **Remediation**:
      1. Check worker instance count and health
      2. Scale up Temporal workers (increase max_instances)
      3. Check for stuck or long-running activities consuming worker capacity
      4. Review task queue metrics in Temporal UI for processing patterns
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Task queue backlog > ${local.thresholds.task_queue_backlog_threshold}"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-task-queue-backlog\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.task_queue_backlog_threshold
      duration        = var.duration

      aggregations {
        alignment_period   = var.alignment_period
        per_series_aligner = "ALIGN_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.temporal_task_queue_backlog]
}

# =============================================================================
# APPLICATION-LEVEL ALERTS (log-based metrics)
# =============================================================================

# ---------------------------------------------------------------------------
# Log-based metrics for application monitoring
# ---------------------------------------------------------------------------
resource "google_logging_metric" "trace_ingestion_failures" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/trace-ingestion-failures"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"trace-ingestion\" AND severity>=ERROR"

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Trace Ingestion Failures"
  }
}

resource "google_logging_metric" "batch_buffer_overflow" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/batch-buffer-overflow"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"batch-buffer\" AND jsonPayload.event=\"overflow\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Batch Buffer Overflow Events"
  }
}

resource "google_logging_metric" "auth_failures" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/auth-failures"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.event=\"auth_failure\""

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "Authentication Failures"
  }
}

resource "google_logging_metric" "api_errors" {
  count   = var.enabled ? 1 : 0
  project = var.project_id
  name    = "neon-${var.environment}/api-errors"

  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.component=\"api\" AND severity>=ERROR"

  metric_descriptor {
    metric_kind  = "DELTA"
    value_type   = "INT64"
    display_name = "API Errors"
  }
}

# ---------------------------------------------------------------------------
# 13. Trace ingestion failure rate
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "trace_ingestion_failures" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Trace Ingestion Failure Rate High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Trace ingestion failure rate exceeds ${local.thresholds.trace_ingestion_failure_percent}%.

      **Impact**: Missing trace data, incomplete evaluation results, gaps in observability.

      **Remediation**:
      1. Check ClickHouse health and connectivity
      2. Review trace payload format for validation errors
      3. Check for ClickHouse write capacity limits
      4. Verify batch buffer is not full (see batch buffer overflow alert)
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Trace ingestion failures elevated"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/trace-ingestion-failures\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.trace_ingestion_failure_percent
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.trace_ingestion_failures]
}

# ---------------------------------------------------------------------------
# 14. Batch buffer overflow warnings
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "batch_buffer_overflow" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Batch Buffer Overflow"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Batch buffer overflow events detected. Traces are being dropped.

      **Impact**: Data loss - traces that overflow the buffer are discarded permanently.

      **Remediation**:
      1. Increase batch buffer size in application configuration
      2. Reduce batch flush interval to write more frequently
      3. Check ClickHouse write throughput for bottlenecks
      4. Scale up workers to reduce per-instance trace volume
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Batch buffer overflow events > 0"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/batch-buffer-overflow\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "60s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.batch_buffer_overflow]
}

# ---------------------------------------------------------------------------
# 15. Authentication failure spikes
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "auth_failure_spike" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] Authentication Failure Spike"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Authentication failures exceed ${local.thresholds.auth_failure_spike_count} in 5 minutes.

      **Impact**: Potential brute-force attack, misconfigured clients, or auth service degradation.

      **Remediation**:
      1. Check source IPs for brute-force patterns
      2. Review auth failure logs for common error reasons
      3. Verify auth provider (API keys, OAuth) is functioning
      4. Consider implementing rate limiting or IP blocking if malicious
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Auth failures > ${local.thresholds.auth_failure_spike_count} in 5 min"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/auth-failures\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.auth_failure_spike_count
      duration        = "0s"

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.auth_failures]
}

# ---------------------------------------------------------------------------
# 16. API error rate > threshold
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "api_error_rate" {
  count        = var.enabled ? 1 : 0
  project      = var.project_id
  display_name = "[${upper(var.environment)}] API Error Rate High"
  combiner     = "OR"
  enabled      = var.enabled

  documentation {
    content   = <<-EOT
      **Alert**: Application API error rate exceeds ${local.thresholds.api_error_rate_percent}%.

      **Impact**: API consumers receiving errors, broken dashboard functionality, SDK failures.

      **Remediation**:
      1. Check application logs for error patterns and stack traces
      2. Verify database connectivity and query health
      3. Check for deployment issues or configuration changes
      4. Review error types (validation, auth, internal) for targeted fixes
    EOT
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "API error rate elevated"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/api-errors\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.thresholds.api_error_rate_percent
      duration        = var.duration

      aggregations {
        alignment_period     = var.alignment_period
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  notification_channels = local.all_notification_channels
  user_labels           = local.labels

  depends_on = [google_logging_metric.api_errors]
}
