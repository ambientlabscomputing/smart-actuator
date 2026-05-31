"""
These methods provide UI utils for the CLI. 
They are used to display information to the user in a clear and concise way.
"""

def msg(msg: str, data: dict | None = None) -> None:
    """Print a message to the user, optionally with some data."""
    print(msg)
    if data:
        for key, value in data.items():
            print(f"  {key}: {value}")
