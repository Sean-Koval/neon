# Neon API

FastAPI backend for the Neon agent evaluation platform.

## Development

```bash
# Setup
uv venv .venv
source .venv/bin/activate
uv pip install -e ".[dev]"

# Run
uvicorn src.main:app --reload --port 8000

# Test
pytest -v

# Linting
ruff check .

# Type checking
mypy src
```

## Endpoints

- `GET /health` - Health check
- `GET /` - API info
- `GET /docs` - OpenAPI documentation
