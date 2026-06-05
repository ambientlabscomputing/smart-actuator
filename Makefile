# smart-actuator — top-level process launcher

## help: Print this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## install-brain: Install brain
install-brain:
	@cd brain && make install

## install-ui: Install UI
install-ui:
	@cd ui && npm install

## run: Start the full stack (sidecar + brain + ui — Brain spawns sims) via overmind/foreman
run: stop build
	@if command -v overmind >/dev/null 2>&1; then \
		overmind start -f Procfile; \
	elif command -v foreman >/dev/null 2>&1; then \
		foreman start -f Procfile; \
	else \
		echo "Install overmind (brew install overmind) or foreman to use 'make run'"; \
		exit 1; \
	fi

## build: Pre-build the Rust binaries so the Procfile can exec them directly
build:
	@cd smart-actuator && cargo build -p actuator-sim -p controller-sidecar

## stop: Kill any leftover processes (sim, sidecar) before a fresh start
stop:
	@pkill -9 -f 'target/debug/actuator-sim' 2>/dev/null || true
	@pkill -9 -f 'target/debug/controller-sidecar' 2>/dev/null || true
	@lsof -ti tcp:50051 2>/dev/null | xargs kill -9 2>/dev/null || true
	@for port in $$(seq 50100 50199); do lsof -ti tcp:$$port 2>/dev/null | xargs kill -9 2>/dev/null || true; done
	@rm -f /tmp/sidecar.sock /tmp/actuator_sim_*.pid smart-actuator/sidecar.pid 2>/dev/null || true

## firmware-%: Delegate firmware targets to the actuator-firmware crate Makefile
firmware-%:
	$(MAKE) -C smart-actuator/crates/actuator-firmware $@

clean-db:
	@rm -rf brain/brain.db
	@echo "Deleted brain/brain.db. The next 'make run' will start with a fresh database."
