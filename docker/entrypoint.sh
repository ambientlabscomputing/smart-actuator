#!/bin/sh
set -e

# Ensure persistent data directories exist on first run
mkdir -p /data/templates /data/files

# ── nginx (serves the React UI and proxies /api to the brain) ────────────────
nginx

# ── controller-sidecar (Rust gRPC bridge to the actuators) ──────────────────
# CWD must be writable so the sidecar can create sidecar.pid / sidecar.log
cd /tmp
SIDECAR_CONFIG=/app/sidecar-config.yaml controller-sidecar run &

# ── brain (Python FastAPI — foreground so Docker signals propagate) ──────────
cd /app
exec brain run
