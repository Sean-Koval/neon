# Artifact Registry Module
# Creates Python package repository for internal SDK distribution

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

# Python package repository
resource "google_artifact_registry_repository" "python_packages" {
  location      = var.location
  repository_id = var.repository_id
  description   = var.description
  format        = "PYTHON"

  labels = var.labels
}

# IAM: Allow specified members to read packages
resource "google_artifact_registry_repository_iam_member" "readers" {
  for_each = toset(var.reader_members)

  project    = google_artifact_registry_repository.python_packages.project
  location   = google_artifact_registry_repository.python_packages.location
  repository = google_artifact_registry_repository.python_packages.name
  role       = "roles/artifactregistry.reader"
  member     = each.value
}

# IAM: Allow specified members to write packages
resource "google_artifact_registry_repository_iam_member" "writers" {
  for_each = toset(var.writer_members)

  project    = google_artifact_registry_repository.python_packages.project
  location   = google_artifact_registry_repository.python_packages.location
  repository = google_artifact_registry_repository.python_packages.name
  role       = "roles/artifactregistry.writer"
  member     = each.value
}
