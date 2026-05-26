## help: Display this message
help:
	@echo "Usage: make [target]"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## build: Build all workspace crates
build:
	cargo build --workspace

## test: Run all workspace tests
test:
	cargo test --workspace

## fmt: Format all workspace code
fmt:
	cargo fmt --all

## lint: Check formatting and run clippy
lint:
	cargo fmt --all --check
	cargo clippy --workspace -- -D warnings

## run: Run the actuator simulator with the default config
run:
	ACTUATOR_SIM_CONFIG=crates/actuator-sim/configs/default.yaml \
		cargo run -p actuator-sim -- run

## proto: Regenerate gRPC code (handled automatically by build.rs)
proto:
	cargo build -p actuator-proto
