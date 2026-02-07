# Monitoring Module - Notification Channels
# terraform/modules/monitoring/notifications.tf

# ---------------------------------------------------------------------------
# Email notification channel
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != "" ? 1 : 0
  project      = var.project_id
  display_name = "Neon Alerts Email (${var.environment})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# ---------------------------------------------------------------------------
# Slack webhook notification channel (optional)
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "slack" {
  count        = var.slack_webhook_url != "" ? 1 : 0
  project      = var.project_id
  display_name = "Neon Alerts Slack (${var.environment})"
  type         = "slack"

  labels = {
    channel_name = "#neon-alerts-${var.environment}"
  }

  sensitive_labels {
    auth_token = var.slack_webhook_url
  }
}

# ---------------------------------------------------------------------------
# PagerDuty notification channel (optional)
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "pagerduty" {
  count        = var.pagerduty_service_key != "" ? 1 : 0
  project      = var.project_id
  display_name = "Neon Alerts PagerDuty (${var.environment})"
  type         = "pagerduty"

  labels = {
    service_key = var.pagerduty_service_key
  }
}

# ---------------------------------------------------------------------------
# Collect all active channel IDs
# ---------------------------------------------------------------------------
locals {
  all_notification_channels = concat(
    var.notification_channels,
    var.alert_email != "" ? [google_monitoring_notification_channel.email[0].name] : [],
    var.slack_webhook_url != "" ? [google_monitoring_notification_channel.slack[0].name] : [],
    var.pagerduty_service_key != "" ? [google_monitoring_notification_channel.pagerduty[0].name] : [],
  )
}
