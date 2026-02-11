/**
 * Feedback Router
 *
 * tRPC procedures for human feedback/RLHF operations.
 * Stores data in ClickHouse with graceful in-memory fallback.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { router, publicProcedure } from "../trpc";
import {
  insertFeedback,
  insertComparison,
  queryFeedback,
  queryComparisons,
  getFeedbackStats,
  healthCheck,
  type FeedbackRecord,
  type ComparisonRecord,
} from "@/lib/clickhouse";
import type { FeedbackItem, PreferenceFeedback, CorrectionFeedback, ComparisonPair } from "@/lib/types";
import { logger } from "@/lib/logger";

// =============================================================================
// ClickHouse record → domain type transforms
// =============================================================================

function feedbackRecordToItem(r: FeedbackRecord): FeedbackItem {
  return {
    id: r.id,
    type: r.type,
    user_id: r.user_id || undefined,
    session_id: r.session_id || undefined,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    created_at: r.created_at,
    preference: r.type === 'preference' ? {
      comparison_id: r.comparison_id,
      choice: r.choice as 'A' | 'B' | 'tie' | 'both_bad',
      reason: r.reason || undefined,
      confidence: r.confidence || undefined,
      decision_time_ms: r.decision_time_ms || undefined,
    } : undefined,
    correction: r.type === 'correction' ? {
      response_id: r.response_id,
      original_content: r.original_content,
      corrected_content: r.corrected_content,
      change_summary: r.change_summary || undefined,
      correction_types: r.correction_types?.length ? r.correction_types : undefined,
    } : undefined,
  };
}

function comparisonRecordToPair(r: ComparisonRecord): ComparisonPair {
  return {
    id: r.id,
    prompt: r.prompt,
    responseA: {
      id: r.response_a_id,
      content: r.response_a_content,
      source: r.response_a_source || undefined,
    },
    responseB: {
      id: r.response_b_id,
      content: r.response_b_content,
      source: r.response_b_source || undefined,
    },
    context: r.context || undefined,
    tags: r.tags || [],
    created_at: r.created_at,
  };
}

// =============================================================================
// In-memory fallback stores (used when ClickHouse is unavailable)
// =============================================================================

const feedbackStore = new Map<string, FeedbackItem>();
const comparisonStore = new Map<string, ComparisonRecord>();

/**
 * Check if ClickHouse is available, with a cached result to avoid
 * hammering the server on every request.
 */
let chAvailable: boolean | null = null;
let chCheckedAt = 0;
const CH_CHECK_INTERVAL_MS = 30_000;

async function isClickHouseAvailable(): Promise<boolean> {
  const now = Date.now();
  if (chAvailable !== null && now - chCheckedAt < CH_CHECK_INTERVAL_MS) {
    return chAvailable;
  }
  try {
    chAvailable = await healthCheck();
  } catch {
    chAvailable = false;
  }
  chCheckedAt = now;
  return chAvailable;
}

// =============================================================================
// Zod schemas
// =============================================================================

const preferenceSchema = z.object({
  comparison_id: z.string(),
  choice: z.enum(["A", "B", "tie", "both_bad"]),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  decision_time_ms: z.number().optional(),
});

const correctionSchema = z.object({
  response_id: z.string(),
  original_content: z.string(),
  corrected_content: z.string(),
  change_summary: z.string().optional(),
  correction_types: z.array(z.string()).optional(),
});

const createFeedbackInput = z.object({
  type: z.enum(["preference", "correction"]),
  preference: preferenceSchema.optional(),
  correction: correctionSchema.optional(),
  user_id: z.string().optional(),
  session_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const responseItemSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const createComparisonInput = z.object({
  prompt: z.string(),
  responseA: responseItemSchema,
  responseB: responseItemSchema,
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// Router
// =============================================================================

export const feedbackRouter = router({
  /**
   * Submit human feedback (preference or correction).
   */
  create: publicProcedure
    .input(createFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const feedbackId = uuidv4();
        const timestamp = new Date().toISOString();
        const projectId = ctx.projectId;

        const useCH = await isClickHouseAvailable();

        if (useCH) {
          const record: FeedbackRecord = {
            id: feedbackId,
            project_id: projectId,
            type: input.type,
            user_id: input.user_id || '',
            session_id: input.session_id || uuidv4(),
            comparison_id: input.preference?.comparison_id || '',
            choice: input.preference?.choice || '',
            reason: input.preference?.reason || '',
            confidence: input.preference?.confidence || 0,
            decision_time_ms: input.preference?.decision_time_ms || 0,
            response_id: input.correction?.response_id || '',
            original_content: input.correction?.original_content || '',
            corrected_content: input.correction?.corrected_content || '',
            change_summary: input.correction?.change_summary || '',
            correction_types: input.correction?.correction_types || [],
            metadata: JSON.stringify(input.metadata || {}),
            created_at: timestamp,
          };

          await insertFeedback([record]);
          logger.info({ feedbackId, type: input.type, storage: 'clickhouse' }, 'Feedback submitted');

          return {
            id: feedbackId,
            item: feedbackRecordToItem(record),
          };
        }

        // In-memory fallback
        const feedbackItem: FeedbackItem = {
          id: feedbackId,
          type: input.type,
          preference: input.preference as PreferenceFeedback | undefined,
          correction: input.correction as CorrectionFeedback | undefined,
          user_id: input.user_id,
          session_id: input.session_id || uuidv4(),
          metadata: input.metadata,
          created_at: timestamp,
        };
        feedbackStore.set(feedbackId, feedbackItem);
        logger.info({ feedbackId, type: input.type, storage: 'in-memory' }, 'Feedback submitted');

        return {
          id: feedbackId,
          item: feedbackItem,
        };
      } catch (error) {
        logger.error({ err: error }, "Error submitting feedback");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit feedback",
          cause: error,
        });
      }
    }),

  /**
   * List feedback items with optional filters.
   */
  list: publicProcedure
    .input(
      z.object({
        type: z.enum(["preference", "correction"]).optional(),
        user_id: z.string().optional(),
        session_id: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const useCH = await isClickHouseAvailable();

        if (useCH) {
          const records = await queryFeedback({
            projectId: ctx.projectId,
            type: input.type,
            userId: input.user_id,
            sessionId: input.session_id,
            limit: input.limit,
            offset: input.offset,
          });

          return { items: records.map(feedbackRecordToItem), total: records.length };
        }

        // In-memory fallback
        let items = Array.from(feedbackStore.values());
        if (input.type) {
          items = items.filter((item) => item.type === input.type);
        }
        if (input.user_id) {
          items = items.filter((item) => item.user_id === input.user_id);
        }
        if (input.session_id) {
          items = items.filter((item) => item.session_id === input.session_id);
        }

        items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        const total = items.length;
        items = items.slice(input.offset, input.offset + input.limit);

        return { items, total };
      } catch (error) {
        logger.error({ err: error }, "Error fetching feedback");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch feedback",
          cause: error,
        });
      }
    }),

  /**
   * List comparison pairs for A/B feedback collection.
   */
  comparisons: publicProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const useCH = await isClickHouseAvailable();

        if (useCH) {
          const records = await queryComparisons({
            projectId: ctx.projectId,
            tag: input.tag,
            limit: input.limit,
            offset: input.offset,
          });

          return { items: records.map(comparisonRecordToPair), total: records.length };
        }

        // In-memory fallback
        let pairs = Array.from(comparisonStore.values());
        if (input.tag) {
          pairs = pairs.filter((item) => item.tags?.includes(input.tag!));
        }

        pairs.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        const total = pairs.length;
        pairs = pairs.slice(input.offset, input.offset + input.limit);

        return { items: pairs.map(comparisonRecordToPair), total };
      } catch (error) {
        logger.error({ err: error }, "Error fetching comparisons");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch comparisons",
          cause: error,
        });
      }
    }),

  /**
   * Create a new comparison pair.
   */
  createComparison: publicProcedure
    .input(createComparisonInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const id = uuidv4();
        const timestamp = new Date().toISOString();
        const projectId = ctx.projectId;

        const useCH = await isClickHouseAvailable();

        if (useCH) {
          const record: ComparisonRecord = {
            id,
            project_id: projectId,
            prompt: input.prompt,
            response_a_id: input.responseA.id || uuidv4(),
            response_a_content: input.responseA.content,
            response_a_source: input.responseA.source || '',
            response_b_id: input.responseB.id || uuidv4(),
            response_b_content: input.responseB.content,
            response_b_source: input.responseB.source || '',
            context: input.context || '',
            tags: input.tags || [],
            created_at: timestamp,
          };

          await insertComparison([record]);

          return { message: "Comparison created successfully", id, item: comparisonRecordToPair(record) };
        }

        // In-memory fallback
        const record: ComparisonRecord = {
          id,
          project_id: projectId,
          prompt: input.prompt,
          response_a_id: input.responseA.id || uuidv4(),
          response_a_content: input.responseA.content,
          response_a_source: input.responseA.source || '',
          response_b_id: input.responseB.id || uuidv4(),
          response_b_content: input.responseB.content,
          response_b_source: input.responseB.source || '',
          context: input.context || '',
          tags: input.tags || [],
          created_at: timestamp,
        };
        comparisonStore.set(id, record);

        return { message: "Comparison created successfully", id, item: comparisonRecordToPair(record) };
      } catch (error) {
        logger.error({ err: error }, "Error creating comparison");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create comparison",
          cause: error,
        });
      }
    }),

  /**
   * Get feedback statistics.
   */
  stats: publicProcedure.query(async ({ ctx }) => {
    try {
      const useCH = await isClickHouseAvailable();

      if (useCH) {
        const stats = await getFeedbackStats(ctx.projectId);
        return {
          totalFeedback: Number(stats.total),
          preferenceCount: Number(stats.preferences),
          correctionCount: Number(stats.corrections),
          totalComparisons: Number(stats.sessions),
        };
      }

      // In-memory fallback
      const items = Array.from(feedbackStore.values());
      return {
        totalFeedback: items.length,
        preferenceCount: items.filter((i) => i.type === 'preference').length,
        correctionCount: items.filter((i) => i.type === 'correction').length,
        totalComparisons: comparisonStore.size,
      };
    } catch (error) {
      logger.error({ err: error }, "Error fetching feedback stats");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch feedback stats",
        cause: error,
      });
    }
  }),
});
