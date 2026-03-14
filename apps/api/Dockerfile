## ─── Stage 1: uv installer ────────────────────────────────────────────────────
FROM python:3.12-slim AS uv-installer

# Install uv (fast Rust-based pip replacement)
ADD https://astral.sh/uv/install.sh /tmp/install-uv.sh
RUN sh /tmp/install-uv.sh && mv /root/.local/bin/uv /usr/local/bin/uv

## ─── Stage 2: dependency builder ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

COPY --from=uv-installer /usr/local/bin/uv /usr/local/bin/uv

WORKDIR /app

# Install system deps needed for native extensions (psycopg, cryptography, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only manifests first — maximises layer cache
COPY pyproject.toml ./

# Install all dependencies into /app/.venv
ENV UV_PROJECT_ENVIRONMENT=/app/.venv
RUN uv venv /app/.venv \
 && uv pip install --python /app/.venv/bin/python --no-cache -e .

## ─── Stage 3: security scan ──────────────────────────────────────────────────
# Trivy scan is run in CI, not in the Docker build itself.
# To run locally: docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
#   aquasec/trivy image realstateos-api:latest

## ─── Stage 4: production image ───────────────────────────────────────────────
FROM python:3.12-slim AS production

# Metadata labels
LABEL org.opencontainers.image.title="RealEstateOS API" \
      org.opencontainers.image.description="FastAPI backend for Real Estate OS" \
      org.opencontainers.image.vendor="RealEstateOS" \
      org.opencontainers.image.version="1.0.0"

# Runtime system deps only (psycopg needs libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Non-root user for security
RUN groupadd -g 1001 appgroup \
 && useradd -u 1001 -g appgroup -m -s /sbin/nologin appuser

WORKDIR /app

# Copy virtualenv from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application source (owned by appuser)
COPY --chown=appuser:appgroup . .

# Activate venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    # Prevent Python from buffering logs
    PYTHONHASHSEED=random

# Drop root
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["sh", "scripts/start-api.sh"]
