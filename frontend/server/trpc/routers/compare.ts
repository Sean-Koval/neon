/**
 * Compare Router
 *
 * tRPC procedures for comparing evaluation runs and detecting regressions.
 * Performs score-by-score comparison with threshold-based regression detection.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { getClickHouseClient } from "@/lib/clickhouse";
import type { RegressionItem } from "@/lib/types";
import { logger } from "@/lib/logger";

/**
 * Score record from ClickHouse for a specific run.
 */
interface RunScoreRecord {
  run_id: string;
  trace_id: string;
  case_id: string | null;
  name: string;
  value: number;
}

/**
 * Trace record with run info.
 */
interface RunTraceRecord {
  run_id: string;
  trace_id: string;
  name: string;
  agent_version: string | null;
}

export const compareRouter = router({
  /**
   * Compare two evaluation runs and identify regressions.
   * Maps from: POST /api/compare
   */
  traces: publicProcedure
    .input(
      z.object({
        baseline_run_id: z.string(),
        candidate_run_id: z.string(),
        threshold: z.number().min(0).max(1).default(0.05),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.baseline_run_id === input.candidate_run_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "baseline_run_id and candidate_run_id must be different",
        });
      }

      try {
        const ch = getClickHouseClient();

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
            baselineId: input.baseline_run_id,
            candidateId: input.candidate_run_id,
          },
          format: "JSONEachRow",
        });

        const runTraces = await runsResult.json<RunTraceRecord>();

        // Extract agent versions
        const baselineTraces = runTraces.filter(
          (t) => t.run_id === input.baseline_run_id,
        );
        const candidateTraces = runTraces.filter(
          (t) => t.run_id === input.candidate_run_id,
        );

        if (baselineTraces.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Baseline run ${input.baseline_run_id} not found`,
          });
        }
        if (candidateTraces.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Candidate run ${input.candidate_run_id} not found`,
          });
        }

        const baselineVersion = baselineTraces[0]?.agent_version ?? null;
        const candidateVersion = candidateTraces[0]?.agent_version ?? null;

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
            baselineId: input.baseline_run_id,
            candidateId: input.candidate_run_id,
          },
          format: "JSONEachRow",
        });

        const scores = await scoresResult.json<RunScoreRecord>();

        // Separate scores by run
        const baselineScores = scores.filter(
          (s) => s.run_id === input.baseline_run_id,
        );
        const candidateScores = scores.filter(
          (s) => s.run_id === input.candidate_run_id,
        );

        // Build maps for comparison
        type ScoreKey = string;
        const makeKey = (
          score: RunScoreRecord,
          traceName: string,
        ): ScoreKey => {
          const caseKey = score.case_id || traceName;
          return `${caseKey}::${score.name}`;
        };

        // Create trace_id to trace_name map
        const traceNameMap = new Map<string, string>();
        for (const trace of runTraces) {
          traceNameMap.set(trace.trace_id, trace.name);
        }

        // Map baseline scores
        const baselineMap = new Map<
          ScoreKey,
          { score: number; caseName: string; scorer: string }
        >();
        for (const score of baselineScores) {
          const traceName =
            traceNameMap.get(score.trace_id) || score.trace_id;
          const key = makeKey(score, traceName);
          const caseName = score.case_id || traceName;
          baselineMap.set(key, {
            score: score.value,
            caseName,
            scorer: score.name,
          });
        }

        // Map candidate scores
        const candidateMap = new Map<
          ScoreKey,
          { score: number; caseName: string; scorer: string }
        >();
        for (const score of candidateScores) {
          const traceName =
            traceNameMap.get(score.trace_id) || score.trace_id;
          const key = makeKey(score, traceName);
          const caseName = score.case_id || traceName;
          candidateMap.set(key, {
            score: score.value,
            caseName,
            scorer: score.name,
          });
        }

        // Compare scores
        const regressions: RegressionItem[] = [];
        const improvements: RegressionItem[] = [];
        let unchanged = 0;

        // Calculate overall scores
        let baselineTotal = 0;
        let candidateTotal = 0;
        let baselineCount = 0;
        let candidateCount = 0;

        for (const score of baselineScores) {
          baselineTotal += score.value;
          baselineCount++;
        }
        for (const score of candidateScores) {
          candidateTotal += score.value;
          candidateCount++;
        }

        const baselineAvg =
          baselineCount > 0 ? baselineTotal / baselineCount : 0;
        const candidateAvg =
          candidateCount > 0 ? candidateTotal / candidateCount : 0;

        // Compare each test case/scorer combination
        const allKeys = new Set([
          ...baselineMap.keys(),
          ...candidateMap.keys(),
        ]);

        for (const key of allKeys) {
          const baseline = baselineMap.get(key);
          const candidate = candidateMap.get(key);

          if (!baseline || !candidate) continue;

          const delta = candidate.score - baseline.score;

          if (delta < -input.threshold) {
            regressions.push({
              case_name: baseline.caseName,
              scorer: baseline.scorer,
              baseline_score: baseline.score,
              candidate_score: candidate.score,
              delta,
            });
          } else if (delta > input.threshold) {
            improvements.push({
              case_name: baseline.caseName,
              scorer: baseline.scorer,
              baseline_score: baseline.score,
              candidate_score: candidate.score,
              delta,
            });
          } else {
            unchanged++;
          }
        }

        // Sort by absolute delta
        regressions.sort((a, b) => a.delta - b.delta);
        improvements.sort((a, b) => b.delta - a.delta);

        return {
          baseline: {
            id: input.baseline_run_id,
            agent_version: baselineVersion,
          },
          candidate: {
            id: input.candidate_run_id,
            agent_version: candidateVersion,
          },
          passed: regressions.length === 0,
          overall_delta: candidateAvg - baselineAvg,
          regressions,
          improvements,
          unchanged,
          threshold: input.threshold,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error({ err: error }, "Error comparing runs");

        if (
          error instanceof Error &&
          error.message.includes("ECONNREFUSED")
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "ClickHouse service unavailable",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to compare runs",
          cause: error,
        });
      }
    }),
});
