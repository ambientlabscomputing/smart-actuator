#!/usr/bin/env python3
"""
Extract the FastAPI OpenAPI schema without starting the server.

Usage: python scripts/extract_openapi.py > public-ui/public/docs/api/openapi.json
"""
import json
import sys
from pathlib import Path

# Make the brain package importable from any working directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "brain"))

from brain.interface.app import create_app

app = create_app()
schema = app.openapi()
print(json.dumps(schema, indent=2))
