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
run: build
	@ACTUATOR_SIM_CONFIG=crates/actuator-sim/configs/default.yaml \
		./target/debug/actuator-sim run -d

## stop: Stop the running actuator simulator (by killing the PID in the PID file)
stop:
	@ACTUATOR_SIM_CONFIG=crates/actuator-sim/configs/default.yaml \
		./target/debug/actuator-sim stop

## run-sidecar: Run the controller sidecar with the default config
run-sidecar: build
	@SIDECAR_CONFIG=crates/controller-sidecar/configs/default.yaml \
		./target/debug/controller-sidecar run

## stop-sidecar: Stop the running controller sidecar (by killing the PID in the PID file)
stop-sidecar:
	@SIDECAR_CONFIG=crates/controller-sidecar/configs/default.yaml \
		./target/debug/controller-sidecar stop

## proto: Regenerate gRPC code (handled automatically by build.rs)
proto:
	cargo build -p actuator-proto
