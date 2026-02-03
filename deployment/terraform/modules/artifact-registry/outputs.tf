output "repository_id" {
  description = "The repository ID"
  value       = google_artifact_registry_repository.python_packages.repository_id
}

output "repository_name" {
  description = "The full repository name"
  value       = google_artifact_registry_repository.python_packages.name
}

output "repository_url" {
  description = "The repository URL for pip"
  value       = "https://${var.location}-python.pkg.dev/${google_artifact_registry_repository.python_packages.project}/${var.repository_id}/simple/"
}

output "location" {
  description = "The repository location"
  value       = google_artifact_registry_repository.python_packages.location
}
