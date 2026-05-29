"""
gRPC async server setup.

Usage (from main.py or an async entry point):

    server = create_grpc_server(brain_service, config)
    await server.start()
    await server.wait_for_termination()

Once brain_pb2_grpc is generated, uncomment the
add_BrainServiceServicer_to_server call below.
"""

import grpc

from brain.interface.grpc.servicer import BrainServicer
from brain.service.service import BrainService
from brain.utils.config import Config
from brain.utils.logger import logger


def create_grpc_server(service: BrainService, config: Config) -> grpc.aio.Server:
    """
    Build and return a configured grpc.aio.Server.

    The caller is responsible for calling server.start() and
    server.wait_for_termination().
    """
    servicer = BrainServicer(service)
    server = grpc.aio.server()

    # Uncomment once brain_pb2_grpc is generated:
    # from brain.interface.grpc.generated import brain_pb2_grpc
    # brain_pb2_grpc.add_BrainServiceServicer_to_server(servicer, server)

    address = f"{config.grpc.host}:{config.grpc.port}"
    server.add_insecure_port(address)
    logger.info("gRPC server configured on %s", address)
    return server
