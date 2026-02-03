Temporal API Reference
======================

Temporal client for durable workflow execution.

.. note::

   Requires the ``temporal`` extra: ``pip install neon-sdk[temporal]``

Client
------

.. autoclass:: neon_sdk.temporal.NeonTemporalClient
   :members:
   :undoc-members:

Configuration
-------------

.. autoclass:: neon_sdk.temporal.TemporalClientConfig
   :members:
   :undoc-members:

Agent Run Types
---------------

.. autoclass:: neon_sdk.temporal.StartAgentRunInput
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.temporal.AgentStatus
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.temporal.AgentProgress
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.temporal.AgentResult
   :members:
   :undoc-members:

Evaluation Types
----------------

.. autoclass:: neon_sdk.temporal.StartEvalRunInput
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.temporal.EvalProgress
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.temporal.EvalResults
   :members:
   :undoc-members:

Exceptions
----------

.. autoexception:: neon_sdk.temporal.TemporalError

.. autoexception:: neon_sdk.temporal.WorkflowNotFoundError

.. autoexception:: neon_sdk.temporal.WorkflowTimeoutError
