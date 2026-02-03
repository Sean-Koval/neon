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

# Instructions
output "setup_instructions" {
  description = "Setup instructions"
  value       = <<-EOT
    ============================================
    Neon Dev Environment Deployed!
    ============================================

    Frontend URL: ${module.neon_frontend.service_uri}
    Workers URL:  ${module.neon_workers.service_uri}

    Artifact Registry (pip):
      ${module.artifact_registry.repository_url}

    GitHub Actions Secrets to configure:
      WIF_PROVIDER: ${module.workload_identity.github_actions_auth_config.workload_identity_provider}
      WIF_SERVICE_ACCOUNT: ${module.workload_identity.github_actions_auth_config.service_account}
      GCP_PROJECT_ID: ${var.project_id}

    Install SDK locally:
      pip config set global.index-url ${module.artifact_registry.repository_url}
      pip config set global.extra-index-url https://pypi.org/simple/
      pip install neon-sdk
    ============================================
  EOT
}
