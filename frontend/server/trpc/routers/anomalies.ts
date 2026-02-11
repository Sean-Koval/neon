/**
 * Anomalies Router
 *
 * tRPC procedures for anomaly detection and auto-test-case generation.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import {
  detectScoreAnomalies,
  getAnomalousTraces,
  getScoreDistribution,
  getTraceWithSpans,
} from "@/lib/clickhouse";

/**
 * Default anomaly detection configuration
 */
const DEFAULT_CONFIG = {
  stddevThreshold: 2.0,
  minSamples: 10,
  lookbackDays: 30,
};

/**
 * Anomalies router
 */
export const anomaliesRouter = router({
  /**
   * Detect score anomalies across traces
   */
  detect: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        stddevThreshold: z.number().min(0.5).max(5).optional(),
      })
    )
    .query(async ({ input }) => {
      const anomalies = await detectScoreAnomalies(input.projectId, {
        startDate: input.startDate,
        endDate: input.endDate,
        stddevThreshold: input.stddevThreshold ?? DEFAULT_CONFIG.stddevThreshold,
        minSamples: DEFAULT_CONFIG.minSamples,
      });

      return anomalies;
    }),

  /**
   * Auto-create test cases from anomalous traces
   */
  autoCreateTestCases: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        suiteId: z.string(),
        traceIds: z.array(z.string()).min(1).max(50),
      })
    )
    .mutation(async ({ input }) => {
      const testCases: Array<{
        name: string;
        input: string;
        expectedOutput: string;
        tools: string[];
        sourceTraceId: string;
      }> = [];

      for (const traceId of input.traceIds) {
        const traceData = await getTraceWithSpans(input.projectId, traceId);
        if (!traceData) continue;

        const { trace, spans } = traceData;
        const rootSpan = spans[0];

        // Extract tool names
        const toolNames = new Set<string>();
        for (const span of spans) {
          if (span.span_type === "tool" && span.tool_name) {
            toolNames.add(span.tool_name);
          }
        }

        // Extract last generation span output
        const generationSpans = spans.filter(
          (s) => s.span_type === "generation"
        );
        const lastGenSpan = generationSpans[generationSpans.length - 1];

        testCases.push({
          name: `${trace.name} - ${traceId.slice(0, 8)}`,
          input: rootSpan?.input || rootSpan?.tool_input || "{}",
          expectedOutput:
            lastGenSpan?.output ||
            rootSpan?.output ||
            rootSpan?.tool_output ||
            "{}",
          tools: [...toolNames],
          sourceTraceId: traceId,
        });
      }

      return { created: testCases.length, testCases };
    }),

  /**
   * Get anomaly detection configuration defaults
   */
  getConfig: publicProcedure.query(() => {
    return DEFAULT_CONFIG;
  }),

  /**
   * Get score distribution histogram for a scorer
   */
  distribution: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        scorerName: z.string(),
      })
    )
    .query(async ({ input }) => {
      return getScoreDistribution(input.projectId, input.scorerName);
    }),

  /**
   * Get full trace records for anomalous traces
   */
  anomalousTraces: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        stddevThreshold: z.number().min(0.5).max(5).optional(),
      })
    )
    .query(async ({ input }) => {
      return getAnomalousTraces(input.projectId, {
        startDate: input.startDate,
        endDate: input.endDate,
        stddevThreshold: input.stddevThreshold ?? DEFAULT_CONFIG.stddevThreshold,
        minSamples: DEFAULT_CONFIG.minSamples,
      });
    }),
});
