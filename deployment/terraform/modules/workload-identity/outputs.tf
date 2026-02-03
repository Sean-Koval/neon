output "pool_name" {
  description = "The full name of the Workload Identity Pool"
  value       = google_iam_workload_identity_pool.github.name
}

output "provider_name" {
  description = "The full name of the Workload Identity Provider"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_email" {
  description = "The email of the service account"
  value       = google_service_account.github_actions.email
}

output "workload_identity_provider" {
  description = "The Workload Identity Provider string for GitHub Actions"
  value       = google_iam_workload_identity_pool_provider.github.name
}

# Output ready-to-use GitHub Actions configuration
output "github_actions_auth_config" {
  description = "Configuration for google-github-actions/auth"
  value = {
    workload_identity_provider = google_iam_workload_identity_pool_provider.github.name
    service_account            = google_service_account.github_actions.email
  }
}
