Scorers API Reference
=====================

Evaluation scorers for agent performance.

Rule-Based Scorers
------------------

.. autofunction:: neon_sdk.scorers.contains

.. autoclass:: neon_sdk.scorers.ContainsConfig
   :members:

.. autofunction:: neon_sdk.scorers.exact_match

.. autoclass:: neon_sdk.scorers.ExactMatchConfig
   :members:

.. autofunction:: neon_sdk.scorers.tool_selection_scorer

.. autofunction:: neon_sdk.scorers.json_match_scorer

.. autofunction:: neon_sdk.scorers.latency_scorer

.. autoclass:: neon_sdk.scorers.LatencyThresholds
   :members:

.. autofunction:: neon_sdk.scorers.error_rate_scorer

.. autofunction:: neon_sdk.scorers.token_efficiency_scorer

.. autofunction:: neon_sdk.scorers.success_scorer

.. autofunction:: neon_sdk.scorers.iteration_scorer

LLM Judge Scorers
-----------------

.. autofunction:: neon_sdk.scorers.llm_judge

.. autoclass:: neon_sdk.scorers.LLMJudgeConfig
   :members:

Pre-built Judges
^^^^^^^^^^^^^^^^

.. autodata:: neon_sdk.scorers.response_quality_judge

.. autodata:: neon_sdk.scorers.safety_judge

.. autodata:: neon_sdk.scorers.helpfulness_judge

Causal Analysis
---------------

.. autofunction:: neon_sdk.scorers.causal_analysis_scorer

.. autoclass:: neon_sdk.scorers.CausalAnalysisConfig
   :members:

.. autofunction:: neon_sdk.scorers.root_cause_scorer

.. autofunction:: neon_sdk.scorers.analyze_causality

Custom Scorers
--------------

.. autofunction:: neon_sdk.scorers.define_scorer

.. autoclass:: neon_sdk.scorers.ScorerConfig
   :members:

.. autodecorator:: neon_sdk.scorers.scorer

Base Types
----------

.. autoclass:: neon_sdk.scorers.EvalContext
   :members:

.. autoclass:: neon_sdk.scorers.ScoreResult
   :members:

.. autoclass:: neon_sdk.scorers.Scorer
   :members:

.. autoclass:: neon_sdk.scorers.ScoreDataType
   :members:
