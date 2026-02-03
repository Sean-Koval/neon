Neon SDK for Python
===================

.. image:: https://img.shields.io/pypi/v/neon-sdk.svg
   :target: https://pypi.org/project/neon-sdk/
   :alt: PyPI version

.. image:: https://img.shields.io/pypi/pyversions/neon-sdk.svg
   :target: https://pypi.org/project/neon-sdk/
   :alt: Python versions

.. image:: https://readthedocs.org/projects/neon-sdk/badge/?version=latest
   :target: https://neon-sdk.readthedocs.io/en/latest/?badge=latest
   :alt: Documentation Status

Python SDK for agent evaluation with tracing, scoring, and observability. Full feature parity with the TypeScript SDK.

Features
--------

- **Tracing**: Context managers and decorators for tracing agent operations
- **Scorers**: Rule-based and LLM-powered evaluation scorers
- **ClickHouse Integration**: Direct access to trace storage and analytics
- **Temporal Integration**: Durable workflow execution for evaluations
- **Type Safety**: Comprehensive type hints with PEP 561 support

Quick Start
-----------

Installation
^^^^^^^^^^^^

.. code-block:: bash

   # Core SDK
   pip install neon-sdk

   # With optional dependencies
   pip install neon-sdk[temporal]     # Durable workflows
   pip install neon-sdk[clickhouse]   # Analytics
   pip install neon-sdk[all]          # Everything

Basic Usage
^^^^^^^^^^^

.. code-block:: python

   from neon_sdk import Neon, NeonConfig
   from neon_sdk.tracing import trace, generation, tool
   from neon_sdk.scorers import contains, llm_judge

   # Create client
   client = Neon(NeonConfig(api_key="your-api-key"))

   # Trace your agent
   with trace("my-agent"):
       with generation("gpt-call", model="gpt-4"):
           response = call_llm(prompt)

       with tool("search", tool_name="web_search"):
           results = search(query)

   # Evaluate with scorers
   scorer = contains(["success", "completed"])
   result = scorer.evaluate(context)

Contents
--------

.. toctree::
   :maxdepth: 2
   :caption: User Guide

   guides/installation
   guides/quickstart
   guides/tracing
   guides/scorers
   guides/clickhouse
   guides/temporal
   guides/migration

.. toctree::
   :maxdepth: 2
   :caption: API Reference

   api/client
   api/tracing
   api/scorers
   api/types
   api/clickhouse
   api/temporal

.. toctree::
   :maxdepth: 1
   :caption: Project

   changelog


Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
