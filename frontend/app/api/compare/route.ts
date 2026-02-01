/**
 * Compare API
 *
 * POST /api/compare - Compare two evaluation runs and identify regressions
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getClickHouseClient } from '@/lib/clickhouse'
import type { CompareRequest, CompareResponse, RegressionItem } from '@/lib/types'

/**
 * Score record from ClickHouse for a specific run
 */
interface RunScoreRecord {
  run_id: string
  trace_id: string
  case_id: string | null
  name: string
  value: number
}

/**
 * Trace record with run info
 */
interface RunTraceRecord {
  run_id: string
  trace_id: string
  name: string
  agent_version: string | null
}

/**
 * POST /api/compare
 *
 * Compare two evaluation runs and identify regressions.
 *
 * Request body:
 * {
 *   baseline_run_id: string;
 *   candidate_run_id: string;
 *   threshold?: number; // default 0.05
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: CompareRequest = await request.json()

    // Validate required fields
    if (!body.baseline_run_id) {
      return NextResponse.json(
        { error: 'baseline_run_id is required' },
        { status: 400 },
      )
    }
    if (!body.candidate_run_id) {
      return NextResponse.json(
        { error: 'candidate_run_id is required' },
        { status: 400 },
      )
    }
    if (body.baseline_run_id === body.candidate_run_id) {
      return NextResponse.json(
        { error: 'baseline_run_id and candidate_run_id must be different' },
        { status: 400 },
      )
    }

    const threshold = body.threshold ?? 0.05

    const ch = getClickHouseClient()

    // Get run info (agent versions) from traces
    const runsResult = await ch.query({
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
        baselineId: body.baseline_run_id,
        candidateId: body.candidate_run_id,
      },
      format: 'JSONEachRow',
    })

    const runTraces = await runsResult.json<RunTraceRecord>()

    // Extract agent versions
    const baselineTraces = runTraces.filter(t => t.run_id === body.baseline_run_id)
    const candidateTraces = runTraces.filter(t => t.run_id === body.candidate_run_id)

    if (baselineTraces.length === 0) {
      return NextResponse.json(
        { error: `Baseline run ${body.baseline_run_id} not found` },
        { status: 404 },
      )
    }
    if (candidateTraces.length === 0) {
      return NextResponse.json(
        { error: `Candidate run ${body.candidate_run_id} not found` },
        { status: 404 },
      )
    }

    const baselineVersion = baselineTraces[0]?.agent_version ?? null
    const candidateVersion = candidateTraces[0]?.agent_version ?? null

    // Get scores for both runs
    const scoresResult = await ch.query({
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
        baselineId: body.baseline_run_id,
        candidateId: body.candidate_run_id,
      },
      format: 'JSONEachRow',
    })

    const scores = await scoresResult.json<RunScoreRecord>()

    // Separate scores by run
    const baselineScores = scores.filter(s => s.run_id === body.baseline_run_id)
    const candidateScores = scores.filter(s => s.run_id === body.candidate_run_id)

    // Build maps for comparison
    // Key: trace_name or case_id + scorer_name
    type ScoreKey = string
    const makeKey = (score: RunScoreRecord, traceName: string): ScoreKey => {
      const caseKey = score.case_id || traceName
      return `${caseKey}::${score.name}`
    }

    // Create trace_id to trace_name map
    const traceNameMap = new Map<string, string>()
    for (const trace of runTraces) {
      traceNameMap.set(trace.trace_id, trace.name)
    }

    // Map baseline scores
    const baselineMap = new Map<ScoreKey, { score: number; caseName: string; scorer: string }>()
    for (const score of baselineScores) {
      const traceName = traceNameMap.get(score.trace_id) || score.trace_id
      const key = makeKey(score, traceName)
      const caseName = score.case_id || traceName
      baselineMap.set(key, {
        score: score.value,
        caseName,
        scorer: score.name,
      })
    }

    // Map candidate scores
    const candidateMap = new Map<ScoreKey, { score: number; caseName: string; scorer: string }>()
    for (const score of candidateScores) {
      const traceName = traceNameMap.get(score.trace_id) || score.trace_id
      const key = makeKey(score, traceName)
      const caseName = score.case_id || traceName
      candidateMap.set(key, {
        score: score.value,
        caseName,
        scorer: score.name,
      })
    }

    // Compare scores
    const regressions: RegressionItem[] = []
    const improvements: RegressionItem[] = []
    let unchanged = 0

    // Calculate overall scores
    let baselineTotal = 0
    let candidateTotal = 0
    let baselineCount = 0
    let candidateCount = 0

    for (const score of baselineScores) {
      baselineTotal += score.value
      baselineCount++
    }
    for (const score of candidateScores) {
      candidateTotal += score.value
      candidateCount++
    }

    const baselineAvg = baselineCount > 0 ? baselineTotal / baselineCount : 0
    const candidateAvg = candidateCount > 0 ? candidateTotal / candidateCount : 0

    // Compare each test case/scorer combination
    const allKeys = new Set([...baselineMap.keys(), ...candidateMap.keys()])

    for (const key of allKeys) {
      const baseline = baselineMap.get(key)
      const candidate = candidateMap.get(key)

      if (!baseline || !candidate) {
        // Test case only exists in one run - skip for now
        // Could be flagged as "new test" or "removed test" in the future
        continue
      }

      const delta = candidate.score - baseline.score

      if (delta < -threshold) {
        // Regression: candidate score dropped below threshold
        regressions.push({
          case_name: baseline.caseName,
          scorer: baseline.scorer,
          baseline_score: baseline.score,
          candidate_score: candidate.score,
          delta,
        })
      } else if (delta > threshold) {
        // Improvement: candidate score improved above threshold
        improvements.push({
          case_name: baseline.caseName,
          scorer: baseline.scorer,
          baseline_score: baseline.score,
          candidate_score: candidate.score,
          delta,
        })
      } else {
        unchanged++
      }
    }

    // Sort by absolute delta (most significant changes first)
    regressions.sort((a, b) => a.delta - b.delta) // Most negative first
    improvements.sort((a, b) => b.delta - a.delta) // Most positive first

    const response: CompareResponse = {
      baseline: {
        id: body.baseline_run_id,
        agent_version: baselineVersion,
      },
      candidate: {
        id: body.candidate_run_id,
        agent_version: candidateVersion,
      },
      passed: regressions.length === 0,
      overall_delta: candidateAvg - baselineAvg,
      regressions,
      improvements,
      unchanged,
      threshold,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error comparing runs:', error)

    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          error: 'ClickHouse service unavailable',
          details: 'The database is not reachable. Please ensure ClickHouse is running.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to compare runs', details: String(error) },
      { status: 500 },
    )
  }
}
