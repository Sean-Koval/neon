# Neon SDK Examples

Interactive Jupyter notebooks demonstrating the Neon Python SDK.

## Notebooks

| Notebook | Description |
|----------|-------------|
| [01_getting_started.ipynb](01_getting_started.ipynb) | Basic tracing and scorers |
| [02_advanced_scorers.ipynb](02_advanced_scorers.ipynb) | LLM judges and causal analysis |
| [03_clickhouse_analytics.ipynb](03_clickhouse_analytics.ipynb) | Trace storage and analytics |
| [04_temporal_workflows.ipynb](04_temporal_workflows.ipynb) | Durable workflow execution |

## Prerequisites

Install the SDK:

```bash
pip install neon-sdk
# or
uv add neon-sdk
```

For specific features:

```bash
# ClickHouse integration
pip install neon-sdk[clickhouse]

# Temporal integration
pip install neon-sdk[temporal]

# Everything
pip install neon-sdk[all]
```

## Running the Notebooks

### With Jupyter

```bash
pip install jupyter
jupyter notebook
```

### With VS Code

Install the "Jupyter" extension and open the notebooks directly.

### With JupyterLab

```bash
pip install jupyterlab
jupyter lab
```

## Infrastructure Setup

Some notebooks require running infrastructure:

### ClickHouse (for notebook 03)

```bash
docker run -d --name clickhouse -p 8123:8123 clickhouse/clickhouse-server
```

### Temporal (for notebook 04)

```bash
# From the project root
docker compose --profile temporal up -d
```

## Resources

- [Documentation](https://neon-sdk.readthedocs.io)
- [API Reference](https://neon-sdk.readthedocs.io/en/latest/api/)
- [GitHub Repository](https://github.com/neon-dev/neon)
