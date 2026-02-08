FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install uv

# Copy project files
COPY pyproject.toml ./
COPY *.py ./

# Install dependencies
RUN uv pip install --system -e "."

# Default: interactive mode
CMD ["python", "run_agent.py"]
