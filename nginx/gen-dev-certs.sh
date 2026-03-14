#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local development.
# Output: nginx/ssl/server.crt  nginx/ssl/server.key
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/ssl"
mkdir -p "$SSL_DIR"

if [[ -f "$SSL_DIR/server.crt" && -f "$SSL_DIR/server.key" ]]; then
    echo "Dev certs already exist at $SSL_DIR — skipping."
    exit 0
fi

openssl req -x509 \
    -nodes \
    -days 365 \
    -newkey rsa:2048 \
    -keyout "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.crt" \
    -subj "/CN=localhost/O=RealEstateOS Dev/C=BR" \
    -addext "subjectAltName=DNS:localhost,DNS:api,IP:127.0.0.1"

echo "Self-signed cert generated at $SSL_DIR"
echo "Add nginx/ssl/ to .gitignore — never commit private keys!"
