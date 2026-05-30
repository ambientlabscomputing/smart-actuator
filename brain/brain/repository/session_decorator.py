from brain.repository.session_maker import get_session


def with_session(func):
    async def wrapper(self, *args, **kwargs):
        if kwargs.get("session") is not None:
            return await func(self, *args, **kwargs)
        async with get_session() as session:
            return await func(self, *args, **kwargs, session=session)

    return wrapper
