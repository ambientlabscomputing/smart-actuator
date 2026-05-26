## help: Display this message
help:
	@echo "Usage: make [target]"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## install: Install Python dependencies
install:
	pip install -e ".[dev]"

## proto: Generate gRPC Python stubs from proto/sidecar.proto
proto:
	mkdir -p brain/interface/grpc/generated
	python -m grpc_tools.protoc \
		-I ../smart-actuator/proto \
		--python_out=brain/interface/grpc/generated \
		--grpc_python_out=brain/interface/grpc/generated \
		../smart-actuator/proto/sidecar.proto
	touch brain/interface/grpc/generated/__init__.py
	# Fix absolute import in generated grpc stub so it works as a package module
	sed -i '' 's/^import sidecar_pb2/from . import sidecar_pb2/g' \
		brain/interface/grpc/generated/sidecar_pb2_grpc.py

## run: Start the Brain REST+gRPC server
run:
	python -m brain.main
