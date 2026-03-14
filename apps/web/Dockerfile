## ─── Stage 1: dependency installer ──────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests only for better layer caching
COPY package.json package-lock.json ./

# Install all deps (needed for build)
RUN npm ci --no-audit --no-fund

## ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Inherit node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Build argument for API URL (injected at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js with standalone output
RUN npm run build

## ─── Stage 3: production runner ──────────────────────────────────────────────
FROM node:20-alpine AS production

LABEL org.opencontainers.image.title="RealEstateOS Web" \
      org.opencontainers.image.description="Next.js frontend for Real Estate OS" \
      org.opencontainers.image.vendor="RealEstateOS"

# Minimal runtime deps
RUN apk add --no-cache \
    ca-certificates \
    curl \
    dumb-init

# Non-root user for security
RUN addgroup -g 1001 appgroup \
 && adduser -u 1001 -G appgroup -D -s /sbin/nologin appuser

WORKDIR /app

# Copy standalone output (smallest possible footprint)
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

USER appuser

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/ || exit 1

# Use dumb-init to handle signals properly (PID 1)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
