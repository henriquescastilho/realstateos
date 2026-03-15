## ─── Stage 1: dependency builder ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system deps needed for native extensions (psycopg, cryptography, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only manifests first — maximises layer cache
COPY pyproject.toml ./

# Install all dependencies system-wide (no venv complexity across stages)
RUN pip install --no-cache-dir .

## ─── Stage 2: production image ───────────────────────────────────────────────
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

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source (owned by appuser)
COPY --chown=appuser:appgroup . .

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random

# Drop root
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
