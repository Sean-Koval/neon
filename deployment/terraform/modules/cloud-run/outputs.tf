output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_v2_service.service.name
}

output "service_uri" {
  description = "The URI of the Cloud Run service"
  value       = google_cloud_run_v2_service.service.uri
}

output "service_id" {
  description = "The ID of the Cloud Run service"
  value       = google_cloud_run_v2_service.service.id
}

output "service_account_email" {
  description = "The email of the service account"
  value       = google_service_account.cloud_run.email
}

output "latest_revision" {
  description = "The latest revision of the service"
  value       = google_cloud_run_v2_service.service.latest_ready_revision
}

output "custom_domain_status" {
  description = "Custom domain mapping status"
  value       = var.custom_domain != null ? google_cloud_run_domain_mapping.domain[0].status : null
}
