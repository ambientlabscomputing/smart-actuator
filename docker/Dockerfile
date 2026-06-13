# ── Python builder ────────────────────────────────────────────────────────────
FROM python:3.13-slim-bookworm AS python_builder
WORKDIR /build
COPY brain/pyproject.toml brain/README.md ./
COPY brain/brain ./brain
# Build wheel then install it (so all deps land in site-packages for copying)
RUN pip install --no-cache-dir build \
 && python -m build --wheel --outdir /dist \
 && pip install --no-cache-dir /dist/*.whl

# ── Node builder ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS node_builder
WORKDIR /build
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# ── Rust builder ───────────────────────────────────────────────────────────────
FROM rust:1.87-bookworm AS rust_builder
# protobuf-compiler provides protoc, required by prost-build (actuator-proto)
RUN apt-get update \
 && apt-get install -y --no-install-recommends protobuf-compiler \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY smart-actuator/Cargo.toml smart-actuator/rust-toolchain.toml ./
COPY smart-actuator/crates ./crates
COPY smart-actuator/proto ./proto
RUN cargo build --release --bin controller-sidecar --bin actuator-sim

# ── Final image ────────────────────────────────────────────────────────────────
# Use the same Python base as the builder — all system .so files (libsqlite3,
# libssl, libffi, etc.) are already present so there are no missing shared libs.
FROM python:3.13-slim-bookworm

# Extra runtime deps: nginx (serves UI + proxies /api), OpenMP (scipy/numpy)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgomp1 \
      nginx \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install the pre-built brain wheel from the builder
COPY --from=python_builder /dist /dist
RUN pip install --no-cache-dir /dist/*.whl \
 && rm -rf /dist

WORKDIR /app

# Rust binaries
COPY --from=rust_builder /build/target/release/controller-sidecar /usr/local/bin/
COPY --from=rust_builder /build/target/release/actuator-sim        /usr/local/bin/

# Sidecar & sim configs (ships with source; overridable via volume mount)
COPY smart-actuator/crates/controller-sidecar/configs/default.yaml ./sidecar-config.yaml
COPY smart-actuator/crates/actuator-sim/configs/default.yaml        ./actuator-sim-config.yaml

# Built-in robot templates
COPY brain/templates ./templates

# React/Vite UI
COPY --from=node_builder /build/dist ./ui/dist

# Production overrides for the brain and nginx
COPY docker/brain-config.yaml ./config.yaml
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Startup script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# /data holds all mutable state: SQLite DB, logs, certs, uploaded files
VOLUME ["/data"]

# 80   → nginx (UI + /api proxy)
# 8080 → brain REST (internal; expose if direct access is needed)
# 50061 → brain gRPC
EXPOSE 80 8080 50061

ENTRYPOINT ["/entrypoint.sh"]
