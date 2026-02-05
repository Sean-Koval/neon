# Frontend Dockerfile (Bun + Next.js)
#
# Multi-stage build optimized for production:
# - Uses bun for fast dependency installation and builds
# - Produces minimal production image with standalone output
#
# IMPORTANT: Build from repo root with context set to frontend:
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
COPY package.json bun.lock ./

# Copy workspace package.json files
COPY frontend/package.json ./frontend/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN cd frontend && bun install --frozen-lockfile || bun install

# =============================================================================
# Build Stage
# =============================================================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copy source code
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
COPY --from=builder /app/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output runs with node
CMD ["node", "server.js"]
