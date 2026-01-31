# Self-Hosting Guide

This guide walks you through deploying Neon on your own infrastructure using Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Configuration](#configuration)
- [Deployment Profiles](#deployment-profiles)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)
- [Resource Requirements](#resource-requirements)
- [Upgrade Instructions](#upgrade-instructions)
- [Platform-Specific Notes](#platform-specific-notes)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Recommended |
|----------|-----------------|-------------|
| Docker | 24.0+ | Latest |
| Docker Compose | 2.20+ | Latest |
| Git | 2.30+ | Latest |

### Hardware Requirements

See [Resource Requirements](#resource-requirements) for detailed specifications.

### Network Ports

Ensure the following ports are available:

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Frontend/API | Web dashboard and REST API |
| 5432 | PostgreSQL | Metadata database |
| 7233 | Temporal | Workflow orchestration (gRPC) |
| 8080 | Temporal UI | Workflow monitoring dashboard |
| 8123 | ClickHouse | HTTP interface for trace queries |
| 9000 | ClickHouse | Native TCP interface |
| 9092 | Redpanda | Kafka-compatible streaming (optional) |

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Sean-Koval/neon.git
cd neon
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your settings (see Configuration section)
# At minimum, set your LLM API keys if using LLM-based scorers
nano .env
```

### 3. Start Core Services

```bash
# Start ClickHouse and PostgreSQL (minimum required)
docker compose up -d

# Wait for services to be healthy
docker compose ps

# Verify ClickHouse is ready
curl http://localhost:8123/ping
# Should return: Ok.

# Verify PostgreSQL is ready
docker compose exec postgres pg_isready -U neon
# Should return: accepting connections
```

### 4. Start the Frontend

**Option A: Development Mode (recommended for getting started)**

```bash
cd frontend
bun install
bun dev
# Open http://localhost:3000
```

**Option B: Docker (production-like)**

```bash
docker compose --profile full up -d
# Open http://localhost:3000
```

### 5. Verify Installation

```bash
# Insert a test trace
curl -X POST http://localhost:3000/api/traces/ingest \
  -H "Content-Type: application/json" \
  -H "x-project-id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "trace_id": "test-'$(date +%s)'",
    "name": "hello-world",
    "status": "ok",
    "duration_ms": 100
  }'

# Open the dashboard
open http://localhost:3000
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Network                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐         ┌─────────────┐         ┌───────────┐ │
│  │   Browser   │────────▶│  Frontend   │────────▶│ ClickHouse│ │
│  │             │  :3000  │  (Next.js)  │  :8123  │  (Traces) │ │
│  └─────────────┘         └──────┬──────┘         └───────────┘ │
│                                 │                               │
│                                 │ :5432                         │
│                                 ▼                               │
│                          ┌─────────────┐                        │
│                          │  PostgreSQL │                        │
│                          │  (Metadata) │                        │
│                          └──────┬──────┘                        │
│                                 │                               │
│         ┌───────────────────────┼───────────────────────┐       │
│         │                       │                       │       │
│         ▼                       ▼                       ▼       │
│  ┌─────────────┐         ┌─────────────┐         ┌───────────┐ │
│  │  Temporal   │  :7233  │ Temporal UI │  :8080  │  Worker   │ │
│  │   Server    │◀────────│             │         │(Optional) │ │
│  └─────────────┘         └─────────────┘         └───────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Purpose | Required |
|---------|---------|----------|
| **ClickHouse** | Stores traces, spans, and scores. Provides fast analytical queries. | Yes |
| **PostgreSQL** | Stores metadata: projects, API keys, eval configs. Also used by Temporal. | Yes |
| **Frontend** | Next.js app serving the dashboard UI and REST API. | Yes |
| **Temporal** | Orchestrates durable eval workflows. | For managed execution |
| **Temporal UI** | Web interface for monitoring workflows. | Optional |
| **Temporal Worker** | Executes eval workflows with LLM calls. | For managed execution |
| **Redpanda** | High-throughput trace streaming (Kafka-compatible). | Optional |

---

## Configuration

### Environment Variables

Create a `.env` file in the project root. See `.env.example` for all options.

#### Required Variables

```bash
# PostgreSQL connection (metadata storage)
DATABASE_URL=postgresql://neon:neon@localhost:5432/neon

# ClickHouse connection (trace storage)
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=neon
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
```

#### LLM Provider Keys (for LLM-based scorers)

```bash
# At least one is required for llmJudge scorer
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

#### Temporal Configuration (if using managed execution)

```bash
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=agent-workers
```

#### Security (production)

```bash
# Secret key for signing tokens (change in production!)
NEON_SECRET_KEY=your-random-secret-key-at-least-32-chars

# Optional: API key for external clients
NEON_API_KEY=your-api-key
```

### Docker Compose Overrides

For local customizations, create `docker-compose.override.yml`:

```yaml
# docker-compose.override.yml
services:
  clickhouse:
    ports:
      - "18123:8123"  # Use different port

  postgres:
    environment:
      POSTGRES_PASSWORD: my-secure-password
```

---

## Deployment Profiles

Docker Compose profiles let you choose which services to run.

### Core Only (Minimum)

```bash
docker compose up -d
```

Starts: ClickHouse, PostgreSQL

Use this when:
- Running the frontend in development mode
- Only need trace storage and metadata

### With Temporal (Managed Execution)

```bash
docker compose --profile temporal up -d
```

Starts: ClickHouse, PostgreSQL, Temporal, Temporal UI

Use this when:
- Running durable eval workflows
- Need human-in-the-loop approvals
- Want automatic retry on failures

### Full Stack (Production)

```bash
docker compose --profile full up -d
```

Starts: All services including frontend and workers

Use this for:
- Production deployments
- Complete self-contained installation

### With Streaming (High Throughput)

```bash
docker compose --profile streaming up -d
```

Starts: Core + Redpanda (Kafka-compatible streaming)

Use this when:
- Ingesting >1000 traces/second
- Need buffered ingestion pipeline

### Multiple Profiles

```bash
# Temporal + Streaming
docker compose --profile temporal --profile streaming up -d
```

---

## Health Checks

### Endpoint Reference

| Service | Health Endpoint | Expected Response |
|---------|-----------------|-------------------|
| ClickHouse | `GET http://localhost:8123/ping` | `Ok.` |
| PostgreSQL | `pg_isready -U neon` | `accepting connections` |
| Temporal | `tctl cluster health` | `SERVING` |
| Frontend | `GET http://localhost:3000/api/health` | `{"status": "ok"}` |

### Checking Service Health

```bash
# All services status
docker compose ps

# ClickHouse
curl -s http://localhost:8123/ping && echo " ClickHouse OK"

# PostgreSQL
docker compose exec postgres pg_isready -U neon

# Temporal (if running)
docker compose exec temporal tctl cluster health

# View logs for unhealthy service
docker compose logs -f <service-name>
```

### Automated Health Check Script

```bash
#!/bin/bash
# health-check.sh

echo "Checking Neon services..."

# ClickHouse
if curl -s http://localhost:8123/ping | grep -q "Ok"; then
  echo "✓ ClickHouse: healthy"
else
  echo "✗ ClickHouse: unhealthy"
fi

# PostgreSQL
if docker compose exec -T postgres pg_isready -U neon > /dev/null 2>&1; then
  echo "✓ PostgreSQL: healthy"
else
  echo "✗ PostgreSQL: unhealthy"
fi

# Frontend
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
  echo "✓ Frontend: healthy"
else
  echo "✗ Frontend: not running or unhealthy"
fi

# Temporal (optional)
if docker compose ps temporal 2>/dev/null | grep -q "running"; then
  if docker compose exec -T temporal tctl cluster health 2>/dev/null | grep -q "SERVING"; then
    echo "✓ Temporal: healthy"
  else
    echo "✗ Temporal: unhealthy"
  fi
fi
```

---

## Troubleshooting

### Common Issues

#### ClickHouse: "Too many open files"

**Symptom:** ClickHouse crashes or refuses connections.

**Solution:** Increase file descriptor limits:

```bash
# Check current limits
ulimit -n

# Temporary fix (current session)
ulimit -n 262144

# Permanent fix (add to /etc/security/limits.conf)
* soft nofile 262144
* hard nofile 262144
```

The docker-compose.yml already sets ulimits for the container, but the host must support it.

#### PostgreSQL: "Connection refused"

**Symptom:** Frontend can't connect to PostgreSQL.

**Solution:**

1. Ensure PostgreSQL is running:
   ```bash
   docker compose ps postgres
   ```

2. Check if init script ran:
   ```bash
   docker compose logs postgres | grep "database system is ready"
   ```

3. Verify connection:
   ```bash
   docker compose exec postgres psql -U neon -c "SELECT 1"
   ```

#### Temporal: "Failed to connect to server"

**Symptom:** Temporal workflows don't start.

**Solution:**

1. Ensure PostgreSQL is fully initialized first:
   ```bash
   docker compose up -d postgres
   # Wait for healthy
   docker compose --profile temporal up -d temporal
   ```

2. Check Temporal logs:
   ```bash
   docker compose logs temporal
   ```

3. Verify connection:
   ```bash
   docker compose exec temporal tctl cluster health
   ```

#### Frontend: "CLICKHOUSE_URL not set"

**Symptom:** API routes return 500 errors.

**Solution:** Ensure environment variables are set:

```bash
# For development
export CLICKHOUSE_URL=http://localhost:8123
export DATABASE_URL=postgresql://neon:neon@localhost:5432/neon
bun dev

# For Docker
# Variables are set in docker-compose.yml
docker compose --profile full up -d
```

#### Docker: "port already in use"

**Symptom:** `docker compose up` fails with port conflict.

**Solution:** Find and stop the conflicting process:

```bash
# Find what's using port 5432
lsof -i :5432

# Or use different ports via override file
cat > docker-compose.override.yml << EOF
services:
  postgres:
    ports:
      - "15432:5432"
  clickhouse:
    ports:
      - "18123:8123"
EOF
```

### Logs

```bash
# All services
docker compose logs

# Specific service
docker compose logs clickhouse

# Follow logs
docker compose logs -f frontend

# Last 100 lines
docker compose logs --tail 100 temporal
```

### Reset Everything

```bash
# Stop and remove containers
docker compose down

# Also remove volumes (WARNING: deletes all data)
docker compose down -v

# Fresh start
docker compose up -d
```

---

## Resource Requirements

### Minimum (Development)

| Resource | Specification |
|----------|---------------|
| CPU | 2 cores |
| RAM | 4 GB |
| Disk | 10 GB SSD |

Suitable for:
- Local development
- < 1,000 traces/day
- Single user

### Recommended (Small Production)

| Resource | Specification |
|----------|---------------|
| CPU | 4 cores |
| RAM | 8 GB |
| Disk | 50 GB SSD |

Suitable for:
- Small team (< 10 users)
- < 100,000 traces/day
- 30-day retention

### Production (High Volume)

| Resource | Specification |
|----------|---------------|
| CPU | 8+ cores |
| RAM | 16+ GB |
| Disk | 200+ GB NVMe SSD |

Suitable for:
- Large team (10+ users)
- > 100,000 traces/day
- 90-day retention

### Per-Service Breakdown

| Service | CPU | RAM | Disk |
|---------|-----|-----|------|
| ClickHouse | 2+ cores | 4+ GB | 80%+ of total |
| PostgreSQL | 1 core | 1 GB | 5 GB |
| Temporal | 1 core | 1 GB | 1 GB |
| Frontend | 1 core | 512 MB | 500 MB |
| Temporal Worker | 1 core | 512 MB | 100 MB |

---

## Upgrade Instructions

### Standard Upgrade

```bash
# 1. Pull latest code
git pull origin main

# 2. Pull latest images
docker compose pull

# 3. Rebuild custom images
docker compose build

# 4. Restart services (minimal downtime)
docker compose up -d
```

### Database Migrations

ClickHouse and PostgreSQL schemas are initialized via `scripts/` SQL files on first start.

For schema updates:

```bash
# Check for new migrations in release notes

# Apply ClickHouse migrations
docker compose exec clickhouse clickhouse-client --query "$(cat scripts/migration-xxx.sql)"

# Apply PostgreSQL migrations
docker compose exec postgres psql -U neon -f /path/to/migration.sql
```

### Breaking Changes

Major version upgrades may require:

1. Backing up data
2. Running migration scripts
3. Updating environment variables

Always check the [CHANGELOG](../CHANGELOG.md) before upgrading.

---

## Platform-Specific Notes

### Linux

Works out of the box. Recommended for production.

```bash
# Ensure Docker is in rootless mode for security (optional)
dockerd-rootless-setuptool.sh install
```

### macOS

Docker Desktop required. Apple Silicon (M1/M2/M3) fully supported.

```bash
# Increase Docker Desktop resources if needed:
# Preferences → Resources → Advanced
# Recommended: 4 CPU, 8 GB RAM
```

**Note:** File system performance is slower than Linux. For development, consider running the frontend natively:

```bash
cd frontend && bun dev
```

### Windows (WSL2)

Requires Windows 10/11 with WSL2 and Docker Desktop.

```bash
# In PowerShell (as admin), ensure WSL2 is set up
wsl --install

# In WSL2 terminal
git clone https://github.com/Sean-Koval/neon.git
cd neon
docker compose up -d
```

**WSL2 Configuration** (create/edit `%USERPROFILE%\.wslconfig`):

```ini
[wsl2]
memory=8GB
processors=4
swap=2GB
```

**Port Access:** Access services at `localhost` from Windows browser.

### Cloud Providers

#### AWS EC2

```bash
# t3.medium or larger recommended
# Amazon Linux 2 or Ubuntu 22.04

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### GCP Compute Engine

```bash
# e2-medium or larger recommended
# Container-Optimized OS or Ubuntu 22.04

# Docker is pre-installed on Container-Optimized OS
docker compose up -d
```

#### Azure VM

```bash
# Standard_B2s or larger recommended
# Ubuntu 22.04

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

---

## Security Considerations

### Production Checklist

- [ ] Change default PostgreSQL password
- [ ] Set `NEON_SECRET_KEY` to a strong random value
- [ ] Enable HTTPS via reverse proxy (nginx, Traefik, Caddy)
- [ ] Restrict network access to necessary ports only
- [ ] Set up regular backups for PostgreSQL and ClickHouse
- [ ] Configure log rotation
- [ ] Review and limit API key scopes

### Reverse Proxy Example (nginx)

```nginx
server {
    listen 443 ssl;
    server_name neon.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Support

- **Documentation:** [docs/](../docs/)
- **Issues:** [GitHub Issues](https://github.com/Sean-Koval/neon/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Sean-Koval/neon/discussions)
