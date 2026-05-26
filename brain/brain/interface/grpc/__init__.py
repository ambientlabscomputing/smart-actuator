# gRPC interface adapter for the Brain service.
#
# Code generation (run from the repo root after adding grpcio-tools to dev deps):
#
#   python -m grpc_tools.protoc \
#     -I smart-actuator/proto \
#     --python_out=brain/brain/interface/grpc/generated \
#     --grpc_python_out=brain/brain/interface/grpc/generated \
#     smart-actuator/proto/brain.proto
#
# The generated files (brain_pb2.py, brain_pb2_grpc.py) land in the
# brain/interface/grpc/generated/ package.  They are .gitignore-d and
# regenerated as part of the build; do not edit them by hand.
