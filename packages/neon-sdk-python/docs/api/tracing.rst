Tracing API Reference
=====================

Context managers and decorators for tracing agent operations.

Context Managers
----------------

.. autofunction:: neon_sdk.tracing.trace

.. autofunction:: neon_sdk.tracing.span

.. autofunction:: neon_sdk.tracing.generation

.. autofunction:: neon_sdk.tracing.tool

.. autofunction:: neon_sdk.tracing.retrieval

.. autofunction:: neon_sdk.tracing.reasoning

.. autofunction:: neon_sdk.tracing.planning

.. autofunction:: neon_sdk.tracing.prompt

.. autofunction:: neon_sdk.tracing.routing

.. autofunction:: neon_sdk.tracing.memory

Decorators
----------

.. autodecorator:: neon_sdk.tracing.traced

Context Utilities
-----------------

.. autofunction:: neon_sdk.tracing.get_current_trace

.. autofunction:: neon_sdk.tracing.get_current_span

Span Classes
------------

.. autoclass:: neon_sdk.tracing.TraceContext
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.tracing.SpanContext
   :members:
   :undoc-members:
