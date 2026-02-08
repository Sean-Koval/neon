# Frontend Dockerfile (Bun + Next.js)
#
# Multi-stage build optimized for production:
# - Uses bun for fast dependency installation and builds
# - Produces minimal production image with standalone output
#
# IMPORTANT: Build from repo root:
#   docker build -f frontend/Dockerfile -t neon-web .
#
# Or use docker-compose which handles this automatically.

FROM oven/bun:1.2-alpine AS base

# =============================================================================
# Dependencies Stage
# =============================================================================
FROM base AS deps
WORKDIR /app

# Copy root workspace files
COPY bun.lock ./

# Copy workspace package.json files
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/

# Create a minimal root package.json that only includes needed workspaces
RUN echo '{"name":"neon","private":true,"workspaces":["frontend","packages/shared"]}' > package.json

# Install all dependencies
RUN bun install || true

# =============================================================================
# Build Stage - copy everything from deps, then add source
# =============================================================================
FROM base AS builder
WORKDIR /app

# Copy entire deps workspace (includes node_modules, package.json, etc.)
COPY --from=deps /app ./

# Copy source code on top (node_modules excluded by .dockerignore)
COPY packages/shared ./packages/shared
COPY frontend ./frontend

# Build shared package first
WORKDIR /app/packages/shared
RUN bun run build 2>/dev/null || true

# Build frontend
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# =============================================================================
# Production Stage
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output (Next.js creates a self-contained bundle)
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output runs with node
CMD ["node", "server.js"]
