# smart-actuator — top-level process launcher for J1

# ── Dev launchers ─────────────────────────────────────────────────────────────

## help: Print this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## install-brain: Install brain
install-brain:
	@cd brain && make install

## j1: Start the full J1 stack (sim + sidecar + brain + ui) using overmind/foreman
j1: j1-stop j1-build
	@if command -v overmind >/dev/null 2>&1; then \
		overmind start -f Procfile.j1; \
	elif command -v foreman >/dev/null 2>&1; then \
		foreman start -f Procfile.j1; \
	else \
		echo "Install overmind (brew install overmind) or foreman to use 'make j1'"; \
		exit 1; \
	fi

## j1-build: Pre-build the Rust binaries so the Procfile can exec them directly
j1-build:
	@cd smart-actuator && cargo build -p actuator-sim -p controller-sidecar

## j1-stop: Kill any leftover J1 processes (sim, sidecar) before a fresh start
j1-stop:
	@pkill -9 -f 'target/debug/actuator-sim' 2>/dev/null || true
	@pkill -9 -f 'target/debug/controller-sidecar' 2>/dev/null || true
	@lsof -ti tcp:50051 2>/dev/null | xargs kill -9 2>/dev/null || true
	@lsof -ti tcp:50052 2>/dev/null | xargs kill -9 2>/dev/null || true
	@rm -f /tmp/sidecar.sock smart-actuator/actuator_sim.pid smart-actuator/sidecar.pid 2>/dev/null || true

## smoke: Run the J1 headless smoke test
smoke:
	@bash scripts/smoke-j1.sh

## j2: Start the full J2 stack (same binaries, J2 config) using overmind/foreman
j2: j2-stop j2-build
	@if command -v overmind >/dev/null 2>&1; then \
		overmind start -f Procfile.j1; \
	elif command -v foreman >/dev/null 2>&1; then \
		foreman start -f Procfile.j1; \
	else \
		echo "Install overmind (brew install overmind) or foreman to use 'make j2'"; \
		exit 1; \
	fi

## j2-build: Pre-build Rust binaries for J2
j2-build:
	@cd smart-actuator && cargo build -p actuator-sim -p controller-sidecar

## j2-stop: Kill any leftover J2/J1 processes before a fresh start
j2-stop:
	@pkill -9 -f 'target/debug/actuator-sim' 2>/dev/null || true
	@pkill -9 -f 'target/debug/controller-sidecar' 2>/dev/null || true
	@lsof -ti tcp:50051 2>/dev/null | xargs kill -9 2>/dev/null || true
	@lsof -ti tcp:50052 2>/dev/null | xargs kill -9 2>/dev/null || true
	@rm -f /tmp/sidecar.sock smart-actuator/actuator_sim.pid smart-actuator/sidecar.pid 2>/dev/null || true

## smoke-j2: Run the J2 headless smoke test
smoke-j2:
	@bash scripts/smoke-j2.sh

# ── J3 — Onboard a machine ────────────────────────────────────────────────────

## j3: Start the J3 stack (sidecar + brain + ui — Brain owns sim spawning)
j3: j3-stop j3-build
	@if command -v overmind >/dev/null 2>&1; then \
		overmind start -f Procfile.j3; \
	elif command -v foreman >/dev/null 2>&1; then \
		foreman start -f Procfile.j3; \
	else \
		echo "Install overmind (brew install overmind) or foreman to use 'make j3'"; \
		exit 1; \
	fi

## j3-build: Pre-build Rust binaries for J3
j3-build:
	@cd smart-actuator && cargo build -p actuator-sim -p controller-sidecar

## j3-stop: Kill any leftover J3 processes before a fresh start
j3-stop:
	@pkill -9 -f 'target/debug/actuator-sim' 2>/dev/null || true
	@pkill -9 -f 'target/debug/controller-sidecar' 2>/dev/null || true
	@lsof -ti tcp:50051 2>/dev/null | xargs kill -9 2>/dev/null || true
	@for port in $$(seq 50100 50199); do lsof -ti tcp:$$port 2>/dev/null | xargs kill -9 2>/dev/null || true; done
	@rm -f /tmp/sidecar.sock /tmp/actuator_sim_*.pid smart-actuator/sidecar.pid 2>/dev/null || true

## smoke-j3: Run the J3 headless smoke test
smoke-j3:
	@bash scripts/smoke-j3.sh

