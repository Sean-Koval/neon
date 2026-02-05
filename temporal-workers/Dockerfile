# Temporal Workers Dockerfile (Bun build + Node runtime)
#
# Multi-stage build:
# - Uses bun for fast dependency installation and TypeScript compilation
# - Uses Node.js runtime for Temporal SDK compatibility (native bindings)
#
# Build: docker build -f temporal-workers/Dockerfile -t neon-temporal-worker .
# Run:   docker run --env-file .env neon-temporal-worker

FROM oven/bun:1.2-alpine AS base

# =============================================================================
# Dependencies Stage
# =============================================================================
FROM base AS deps
WORKDIR /app

# Copy package files
COPY temporal-workers/package.json ./

# Install dependencies with bun (faster than npm)
RUN bun install --frozen-lockfile || bun install

# =============================================================================
# Build Stage
# =============================================================================
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY temporal-workers/ ./

# Build TypeScript
RUN bun run build

# =============================================================================
# Production Stage
# =============================================================================
# Use Node.js runtime for Temporal SDK compatibility (has native bindings)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only (Temporal requires node runtime)
COPY temporal-workers/package.json ./
RUN npm install --omit=dev

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 temporal

USER temporal

# Health check - worker should stay running
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -x node || exit 1

CMD ["node", "dist/worker.js"]
