## help: Display this message
help:
	# TODO: auto-generate this help message from comments in the Makefile

## install: Install the package
install:
	pip install -e .

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

## test: Run tests
test:
	pytest tests