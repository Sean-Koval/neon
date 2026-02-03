ClickHouse API Reference
========================

ClickHouse client for trace storage and analytics.

.. note::

   Requires the ``clickhouse`` extra: ``pip install neon-sdk[clickhouse]``

Client
------

.. autoclass:: neon_sdk.clickhouse.NeonClickHouseClient
   :members:
   :undoc-members:

Configuration
-------------

.. autoclass:: neon_sdk.clickhouse.ClickHouseConfig
   :members:
   :undoc-members:

Data Records
------------

.. autoclass:: neon_sdk.clickhouse.TraceRecord
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.clickhouse.SpanRecord
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.clickhouse.ScoreRecord
   :members:
   :undoc-members:

Analytics Types
---------------

.. autoclass:: neon_sdk.clickhouse.DashboardSummary
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.clickhouse.DailyStats
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.clickhouse.ScoreTrend
   :members:
   :undoc-members:

.. autoclass:: neon_sdk.clickhouse.HourlyDistribution
   :members:
   :undoc-members:
