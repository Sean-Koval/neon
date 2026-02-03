# Installation

## Requirements

- Python 3.11 or higher
- pip or uv package manager

## Basic Installation

Install the core SDK using pip:

```bash
pip install neon-sdk
```

Or using [uv](https://github.com/astral-sh/uv) (recommended):

```bash
uv add neon-sdk
```

## Optional Dependencies

The SDK has optional dependencies for extended functionality:

### Temporal Integration

For durable workflow execution:

```bash
pip install neon-sdk[temporal]
# or
uv add neon-sdk[temporal]
```

### ClickHouse Integration

For trace storage and analytics queries:

```bash
pip install neon-sdk[clickhouse]
# or
uv add neon-sdk[clickhouse]
```

### All Dependencies

Install everything at once:

```bash
pip install neon-sdk[all]
# or
uv add neon-sdk[all]
```

## Development Installation

For contributing to the SDK:

```bash
git clone https://github.com/neon-dev/neon.git
cd neon/packages/neon-sdk-python

# Using uv (recommended)
uv sync
uv pip install -e ".[dev,all]"

# Or using pip
pip install -e ".[dev,all]"
```

## Verifying Installation

```python
import neon_sdk
print(neon_sdk.__version__)  # Should print "0.1.0"

from neon_sdk import Neon, NeonConfig
from neon_sdk.tracing import trace
from neon_sdk.scorers import contains

print("Installation successful!")
```

## Next Steps

- [Quick Start Guide](quickstart.md) - Get started with basic usage
- [Tracing Guide](tracing.md) - Learn about tracing agent operations
- [Scorers Guide](scorers.md) - Evaluate your agents
