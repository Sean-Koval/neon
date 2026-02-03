# Neon Deployment

This directory contains deployment configurations for the Neon platform.

## Structure

```
deployment/
├── github-actions/          # CI/CD workflows
│   ├── publish-python-sdk.yml
│   ├── test-python-sdk.yml
│   └── setup-workload-identity.sh
├── kustomize/               # GKE deployments (Kubernetes)
│   ├── base/                # Base manifests
│   └── overlays/            # Environment-specific patches
│       ├── dev/
│       ├── staging/
│       └── prod/
└── terraform/               # Cloud Run & infrastructure
    ├── modules/             # Reusable modules
    │   ├── artifact-registry/
    │   ├── cloud-run/
    │   └── workload-identity/
    └── environments/        # Environment configs
        ├── dev/
        ├── staging/
        └── prod/
```

## Quick Start

### 1. Set Up Infrastructure (one-time)

```bash
# Initialize Artifact Registry and Workload Identity
cd terraform/environments/dev
terraform init
terraform apply
```

### 2. Copy GitHub Actions to .github/workflows/

```bash
cp deployment/github-actions/*.yml .github/workflows/
```

### 3. Deploy to GKE

```bash
# Dev environment
kubectl apply -k deployment/kustomize/overlays/dev

# Production
kubectl apply -k deployment/kustomize/overlays/prod
```

### 4. Deploy to Cloud Run

```bash
cd terraform/environments/prod
terraform apply
```

## Prerequisites

- GCP Project with billing enabled
- `gcloud` CLI authenticated
- `kubectl` configured for your GKE cluster
- `terraform` >= 1.0
- GitHub repository secrets configured

## Environment Variables

Set these in GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_PROJECT_NUMBER` | Your GCP project number |
| `GAR_LOCATION` | Artifact Registry location (e.g., `us-central1`) |
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | Service account email |
