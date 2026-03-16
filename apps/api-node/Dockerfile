## ─── Build stage ───
FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/api-node/package.json apps/api-node/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY apps/api-node/tsconfig.json ./
COPY apps/api-node/src/ ./src/

RUN npm run build

## ─── Production stage ───
FROM node:20-alpine AS production

WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -D appuser

COPY apps/api-node/package.json apps/api-node/package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY apps/api-node/drizzle/ ./drizzle/
COPY apps/api-node/drizzle.config.ts ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

USER appuser

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
