# ClickHouse Migrations

This directory contains SQL migrations for the ClickHouse database.

## Migration Order

Run migrations in order:

1. `001_initial_schema.sql` - Base tables (traces, spans, scores)
2. `002_materialized_views.sql` - Dashboard aggregation views
3. `003_add_indexes.sql` - Skip indexes for query optimization

## Running Migrations

### Fresh Installation

For a new database, run the main init script which includes everything:

```bash
clickhouse-client --host localhost --query "$(cat scripts/clickhouse-init.sql)"
```

### Existing Installation

For existing databases, run only the needed migrations:

```bash
# Add indexes to existing tables
clickhouse-client --host localhost --multiquery < frontend/lib/migrations/003_add_indexes.sql
```

### Using Docker

```bash
# Connect to running ClickHouse container
docker exec -i neon-clickhouse-1 clickhouse-client --multiquery < frontend/lib/migrations/003_add_indexes.sql
```

## Verifying Indexes

Check that indexes were created:

```sql
SELECT name, type_full, expr, granularity
FROM system.data_skipping_indices
WHERE database = 'neon'
ORDER BY table, name;
```

## Benchmarking

Before and after applying indexes, run the benchmark script:

```bash
cd frontend && bun run ../scripts/benchmark-indexes.ts
```

This will measure query performance and verify index usage.

## Index Types

| Type | Use Case | Example |
|------|----------|---------|
| `bloom_filter(0.01)` | High-cardinality strings (IDs) | trace_id, span_id |
| `set(8)` | Low-cardinality enums | status, span_type |
| `minmax` | Range queries on ordered columns | timestamp |

## Rollback

To remove indexes (if needed):

```sql
ALTER TABLE neon.traces DROP INDEX idx_trace_id;
-- Repeat for each index
```
