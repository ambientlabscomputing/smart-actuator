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

## install-public-ui: Install public UI dependencies
install-public-ui:
	@cd public-ui && npm install

## install-pre-commit: Install pre-commit and activate git hooks
install-pre-commit:
	@python3 -m pip install --user pre-commit
	@python3 -m pre_commit install --install-hooks

## pre-commit: Run all pre-commit hooks across the repo
pre-commit:
	@python3 -m pre_commit run --all-files

## wasm-build: Compile the actuator-wasm crate to WebAssembly (output: smart-actuator/pkg-wasm/)
wasm-build:
	@wasm-pack build smart-actuator/crates/actuator-wasm --target web --out-dir ../../pkg-wasm

## public-ui-docs: Generate static docs artifacts for publishing under /docs (requires brain deps installed)
public-ui-docs:
	@pip install -q -e brain/"[dev]" --quiet
	@bash scripts/generate_public_docs.sh

## public-ui-dev: Build WASM then start the public UI dev server (hot reload)
public-ui-dev: wasm-build
	@cd public-ui && npm install && npx vite

## public-ui-build: Build WASM then produce a production public UI bundle (output: public-ui/dist/)
public-ui-build: wasm-build public-ui-docs
	@cd public-ui && npm install && npx tsc -b && npx vite build

## public-ui-preview: Build WASM + production bundle, then serve it locally for inspection
public-ui-preview: public-ui-build
	@cd public-ui && npx vite preview

## deploy-public-ui: Build WASM + production bundle and deploy to Cloudflare Pages (jogactuators.com)
deploy-public-ui: public-ui-build
	@cd public-ui && wrangler pages deploy dist --project-name jog-actuators-com --branch main

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
	@lsof -ti tcp:15061 2>/dev/null | xargs kill -9 2>/dev/null || true
	@lsof -ti tcp:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
	@for port in $$(seq 15100 15199); do lsof -ti tcp:$$port 2>/dev/null | xargs kill -9 2>/dev/null || true; done
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
docker-push: docker-ghcr-login
	docker push $(IMAGE_REPO):$(IMAGE_TAG)

## docker-run: Run the Docker image locally, mapping ports 50051 (gRPC) and 8080 (UI) and mounting /tmp for the sidecar socket. Useful for testing the production image locally.
#   make docker-run IMAGE_REPO=ghcr.io/ambientlabscomputing/smart-actuator IMAGE_TAG=latest
docker-run: docker-ghcr-login
	docker run --rm -p 50051:50051 -p 80:80 $(IMAGE_REPO):$(IMAGE_TAG)

## docker-pull: Pull the image from the registry (run docker-build first)
docker-pull: docker-ghcr-login
	docker pull $(IMAGE_REPO):$(IMAGE_TAG)

## docker-run-

## docker-release: Build then push the image in one step
docker-release: docker-ghcr-login docker-build docker-push

## docker-ghcr-login: Log into GitHub Container Registry (ghcr.io) using the GitHub CLI (gh). This is needed before pushing to ghcr.io.
docker-ghcr-login:
	@gh auth token | docker login ghcr.io -u $$(gh api user --jq .login) --password-stdin
	@echo "Logged into ghcr.io as $$(gh api user --jq .login)"
