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

output "custom_domain" {
  description = "Custom domain for the frontend (if configured)"
  value       = var.frontend_domain
}

# Instructions
output "deployment_info" {
  description = "Deployment information"
  value       = <<-EOT
    ============================================
    Neon Production Environment
    ============================================

    Frontend URL: ${module.neon_frontend.service_uri}
    Custom Domain: ${var.frontend_domain != null ? var.frontend_domain : "Not configured"}

    Workers URL:  ${module.neon_workers.service_uri}

    Artifact Registry (pip):
      ${module.artifact_registry.repository_url}

    Secrets to configure in Secret Manager:
      - neon-clickhouse-password
      - neon-anthropic-api-key

    Run:
      gcloud secrets versions add neon-clickhouse-password --data-file=<password-file>
      gcloud secrets versions add neon-anthropic-api-key --data-file=<api-key-file>

    ============================================
  EOT
}
