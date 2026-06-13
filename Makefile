# smart-actuator — top-level process launcher

# Docker image coordinates — override on the command line or via env vars:
#   make docker-build IMAGE_REPO=ghcr.io/ambientlabscomputing/smart-actuator IMAGE_TAG=v1.2.3
IMAGE_REPO ?= smart-actuator
IMAGE_TAG  ?= latest

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

## stop: Kill any leftover processes (sim, sidecar, brain) before a fresh start
stop:
	@pkill -9 -f 'target/debug/actuator-sim' 2>/dev/null || true
	@pkill -9 -f 'target/debug/controller-sidecar' 2>/dev/null || true
	@pkill -9 -f 'brain.main' 2>/dev/null || true
	@lsof -ti tcp:50051 2>/dev/null | xargs kill -9 2>/dev/null || true
	@lsof -ti tcp:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
	@for port in $$(seq 50100 50199); do lsof -ti tcp:$$port 2>/dev/null | xargs kill -9 2>/dev/null || true; done
	@rm -f /tmp/sidecar.sock /tmp/actuator_sim_*.pid smart-actuator/sidecar.pid 2>/dev/null || true
	@rm -f .overmind.sock

## firmware-%: Delegate firmware targets to the actuator-firmware crate Makefile
firmware-%:
	$(MAKE) -C smart-actuator/crates/actuator-firmware $@

## clean-db: Delete the brain's SQLite database to reset all state (machines, sessions, etc.) for a fresh start. The next 'make run' will create a new empty database.
clean-db:
	@rm -rf brain/brain.db
	@echo "Deleted brain/brain.db. The next 'make run' will start with a fresh database."

## docker-build: Build the Docker image (IMAGE_REPO and IMAGE_TAG are overridable)
docker-build:
	docker build -f docker/Dockerfile -t $(IMAGE_REPO):$(IMAGE_TAG) .

## docker-push: Push the image to the registry (run docker-build first)
docker-push:
	docker push $(IMAGE_REPO):$(IMAGE_TAG)

## docker-release: Build then push the image in one step
docker-release: docker-build docker-push
