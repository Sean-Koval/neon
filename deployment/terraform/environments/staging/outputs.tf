output "frontend_url" {
  description = "URL of the frontend service"
  value       = module.neon_frontend.service_uri
}

output "workers_url" {
  description = "URL of the workers service"
  value       = module.neon_workers.service_uri
}

output "artifact_registry_url" {
  description = "URL for pip to use Artifact Registry"
  value       = module.artifact_registry.repository_url
}

output "github_actions_config" {
  description = "Configuration for GitHub Actions"
  value       = module.workload_identity.github_actions_auth_config
  sensitive   = true
}
