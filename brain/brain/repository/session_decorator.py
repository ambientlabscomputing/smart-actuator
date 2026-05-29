from brain.repository.session_maker import get_session

def with_session(func):
    async def wrapper(self, *args, **kwargs):
        async with get_session() as session:
            return await func(self, session, *args, **kwargs)
    return wrapper
