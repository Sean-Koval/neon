#!/bin/bash
# Setup Workload Identity Federation for GitHub Actions
#
# This script configures GCP to allow GitHub Actions to authenticate
# without service account keys (more secure).
#
# Prerequisites:
# - gcloud CLI authenticated with sufficient permissions
# - GCP project created
#
# Usage:
#   ./setup-workload-identity.sh <project-id> <github-org/repo>
#
# Example:
#   ./setup-workload-identity.sh my-project-id Sean-Koval/neon

set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <project-id> <github-org/repo>}"
GITHUB_REPO="${2:?Usage: $0 <project-id> <github-org/repo>}"

POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"
SERVICE_ACCOUNT_NAME="github-actions"

echo "=== Setting up Workload Identity Federation ==="
echo "Project: $PROJECT_ID"
echo "GitHub Repo: $GITHUB_REPO"
echo ""

# Get project number
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
echo "Project Number: $PROJECT_NUMBER"

# Enable required APIs
echo ""
echo "=== Enabling APIs ==="
gcloud services enable \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iamcredentials.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# Create Workload Identity Pool
echo ""
echo "=== Creating Workload Identity Pool ==="
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="Workload Identity Pool for GitHub Actions" \
  2>/dev/null || echo "Pool already exists"

# Create OIDC Provider
echo ""
echo "=== Creating OIDC Provider ==="
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  2>/dev/null || echo "Provider already exists"

# Create Service Account
echo ""
echo "=== Creating Service Account ==="
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Service Account" \
  --description="Service account for GitHub Actions CI/CD" \
  2>/dev/null || echo "Service account already exists"

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant Artifact Registry permissions
echo ""
echo "=== Granting Artifact Registry permissions ==="
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/artifactregistry.writer" \
  --condition=None

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/artifactregistry.reader" \
  --condition=None

# Allow GitHub to impersonate the service account
echo ""
echo "=== Allowing GitHub to impersonate service account ==="
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"

# Output the values needed for GitHub Actions
echo ""
echo "=========================================="
echo "=== Setup Complete! ==="
echo "=========================================="
echo ""
echo "Add these secrets to your GitHub repository:"
echo ""
echo "GCP_PROJECT_ID:"
echo "  $PROJECT_ID"
echo ""
echo "GCP_PROJECT_NUMBER:"
echo "  $PROJECT_NUMBER"
echo ""
echo "WIF_PROVIDER:"
echo "  projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
echo ""
echo "WIF_SERVICE_ACCOUNT:"
echo "  $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "=========================================="
echo ""
echo "GitHub Actions workflow configuration:"
echo ""
cat << EOF
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}'
    service_account: '${SERVICE_ACCOUNT_EMAIL}'
EOF
