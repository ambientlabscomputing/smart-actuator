## help: Display this message
help:
	@echo "Usage: make [target]"
	@echo "Available targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## install: Install the package and dev dependencies
install:
	pip install -e ".[dev]"

## setup: Setup local environment (install dependencies, generate gRPC stubs, pre-commit hooks)
setup: install proto
	pre-commit install

## proto: Regenerate gRPC stubs from proto/actuator.proto
proto:
	python -m grpc_tools.protoc \
		--proto_path=proto \
		--python_out=interface \
		--pyi_out=interface \
		--grpc_python_out=interface \
		proto/actuator.proto
	sed -i '' 's/^import actuator_pb2/from actuator_sim.interface import actuator_pb2/' interface/actuator_pb2_grpc.py

## run: Run the simulator
run:
	actuator_sim run

## lint: Run ruff linter and formatter check
lint:
	ruff check .
	ruff format --check .

## fmt: Auto-fix lint issues and format code
fmt:
	ruff check --fix .
	ruff format .

## test: Run tests
test:
	pytest tests