/**
 * Compare Queries
 *
 * Centralized query module for run comparison operations.
 * Moves raw ClickHouse queries out of the compare API route.
 */

import { getClickHouseClient } from '../../../clickhouse'
import { executeQuery, type QueryResult } from '../query-builder'

// =============================================================================
// Types
// =============================================================================

/** Score record from ClickHouse for a specific run */
export interface RunScoreRecord {
  run_id: string
  trace_id: string
  case_id: string | null
  name: string
  value: number
}

/** Trace record with run info */
export interface RunTraceRecord {
  run_id: string
  trace_id: string
  name: string
  agent_version: string | null
}

// =============================================================================
// Queries
// =============================================================================

/** Get trace info for the given run IDs */
export async function getRunTraces(
  baselineRunId: string,
  candidateRunId: string,
): Promise<QueryResult<RunTraceRecord[]>> {
  return executeQuery(
    'compare.runTraces',
    { baselineRunId, candidateRunId },
    async () => {
      const ch = getClickHouseClient()
      const result = await ch.query({
        query: `
          SELECT DISTINCT
            run_id,
            trace_id,
            name,
            agent_version
          FROM traces
          WHERE run_id IN ({baselineId:String}, {candidateId:String})
        `,
        query_params: {
          baselineId: baselineRunId,
          candidateId: candidateRunId,
        },
        format: 'JSONEachRow',
      })
      return result.json<RunTraceRecord>()
    },
    15_000,
  )
}

/** Get scores for the given run IDs */
export async function getRunScores(
  baselineRunId: string,
  candidateRunId: string,
): Promise<QueryResult<RunScoreRecord[]>> {
  return executeQuery(
    'compare.runScores',
    { baselineRunId, candidateRunId },
    async () => {
      const ch = getClickHouseClient()
      const result = await ch.query({
        query: `
          SELECT
            s.run_id,
            s.trace_id,
            s.case_id,
            s.name,
            s.value
          FROM scores s
          WHERE s.run_id IN ({baselineId:String}, {candidateId:String})
          ORDER BY s.name, s.trace_id
        `,
        query_params: {
          baselineId: baselineRunId,
          candidateId: candidateRunId,
        },
        format: 'JSONEachRow',
      })
      return result.json<RunScoreRecord>()
    },
    15_000,
  )
}
