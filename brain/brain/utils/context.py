"""Request-scoped context variables propagated across async boundaries."""

from contextvars import ContextVar

#: The current request's journey ID.  Set by _JourneyIdMiddleware so that
#: downstream gRPC calls can attach it to outbound metadata.
journey_id_var: ContextVar[str] = ContextVar("journey_id", default="")
