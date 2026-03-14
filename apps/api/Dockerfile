FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install dependencies first (layer cache)
COPY pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

# Copy application code
COPY . /app

# Create non-root user
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid appuser --shell /bin/sh appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

CMD ["sh", "scripts/start-api.sh"]
