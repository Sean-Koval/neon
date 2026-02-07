/**
 * Prompts Router
 *
 * tRPC procedures for prompt management with versioning.
 * Supports text and chat prompt types with ClickHouse storage.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { router, publicProcedure } from "../trpc";
import {
  getLatestPromptVersion,
  getPromptById,
  getPromptByName,
  getPromptVersionHistory,
  insertPrompt,
  listPrompts,
  type PromptRecord,
} from "@/lib/clickhouse";
import type { Prompt, PromptVersionEntry } from "@/lib/types";
import { logger } from "@/lib/logger";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Transform ClickHouse record to API response format.
 */
function transformPrompt(record: PromptRecord): Prompt {
  return {
    id: record.prompt_id,
    project_id: record.project_id,
    name: record.name,
    description: record.description || undefined,
    type: record.type,
    template: record.template || undefined,
    messages: record.messages ? JSON.parse(record.messages) : undefined,
    variables: record.variables ? JSON.parse(record.variables) : undefined,
    config: record.config ? JSON.parse(record.config) : undefined,
    tags: record.tags || [],
    is_production: record.is_production === 1,
    version: record.version,
    commit_message: record.commit_message || undefined,
    created_by: record.created_by || undefined,
    created_at: record.created_at,
    updated_at: record.updated_at,
    parent_version_id: record.parent_version_id || undefined,
    variant: record.variant || undefined,
  };
}

/**
 * Check if a string is a UUID format.
 */
function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Handle ClickHouse connection errors consistently.
 */
function handleClickHouseError(error: unknown, operation: string): never {
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
    message: `Failed to ${operation}`,
    cause: error,
  });
}

// =============================================================================
// Zod schemas
// =============================================================================

const promptMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const promptVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  default: z.string().optional(),
  required: z.boolean().optional(),
});

const promptConfigSchema = z.record(z.string(), z.unknown());

// =============================================================================
// Router
// =============================================================================

export const promptsRouter = router({
  /**
   * List prompts with optional filters.
   * Maps from: GET /api/prompts
   */
  list: publicProcedure
    .input(
      z.object({
        projectId: z.string().default("default"),
        tags: z.array(z.string()).optional(),
        isProduction: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        const records = await listPrompts({
          projectId: input.projectId,
          tags: input.tags,
          isProduction: input.isProduction,
          limit: input.limit,
          offset: input.offset,
        });

        return {
          items: records.map(transformPrompt),
          total: records.length,
        };
      } catch (error) {
        logger.error({ err: error }, "Error listing prompts");
        handleClickHouseError(error, "list prompts");
      }
    }),

  /**
   * Create a new prompt (version 1 or auto-increment).
   * Maps from: POST /api/prompts
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string().default("default"),
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["text", "chat"]),
        template: z.string().optional(),
        messages: z.array(promptMessageSchema).optional(),
        variables: z.array(promptVariableSchema).optional(),
        config: promptConfigSchema.optional(),
        tags: z.array(z.string()).optional(),
        is_production: z.boolean().optional(),
        commit_message: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const existingVersion = await getLatestPromptVersion(
          input.projectId,
          input.name,
        );
        const version = existingVersion + 1;
        const now = new Date().toISOString();

        const promptId = uuidv4();
        const record: PromptRecord = {
          project_id: input.projectId,
          prompt_id: promptId,
          name: input.name,
          description: input.description || "",
          type: input.type,
          template: input.template || "",
          messages: input.messages ? JSON.stringify(input.messages) : "",
          variables: input.variables ? JSON.stringify(input.variables) : "",
          config: input.config ? JSON.stringify(input.config) : "",
          tags: input.tags || [],
          is_production: input.is_production ? 1 : 0,
          version,
          commit_message: input.commit_message || `Version ${version}`,
          created_by: "",
          created_at: now,
          updated_at: now,
          parent_version_id: "",
          variant: "control",
        };

        await insertPrompt(record);

        return transformPrompt(record);
      } catch (error) {
        logger.error({ err: error }, "Error creating prompt");
        handleClickHouseError(error, "create prompt");
      }
    }),

  /**
   * Get a prompt by ID or name.
   * Maps from: GET /api/prompts/[id]
   */
  getById: publicProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string().default("default"),
        version: z.number().optional(),
        history: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        // If history is requested, return version history
        if (input.history) {
          const records = await getPromptVersionHistory(
            input.projectId,
            input.id,
          );
          if (records.length === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Prompt "${input.id}" not found`,
            });
          }

          const history: PromptVersionEntry[] = records.map((r) => ({
            id: r.prompt_id,
            version: r.version,
            commit_message: r.commit_message || undefined,
            created_by: r.created_by || undefined,
            created_at: r.created_at,
          }));

          return { items: history, name: input.id };
        }

        // Get single prompt
        let record: PromptRecord | null;
        if (isUuid(input.id)) {
          record = await getPromptById(input.projectId, input.id);
        } else {
          record = await getPromptByName(
            input.projectId,
            input.id,
            input.version,
          );
        }

        if (!record) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Prompt "${input.id}" not found`,
          });
        }

        return transformPrompt(record);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error({ err: error }, "Error getting prompt");
        handleClickHouseError(error, "get prompt");
      }
    }),

  /**
   * Update a prompt (creates a new version).
   * Maps from: PATCH /api/prompts/[id]
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string().default("default"),
        description: z.string().optional(),
        template: z.string().optional(),
        messages: z.array(promptMessageSchema).optional(),
        variables: z.array(promptVariableSchema).optional(),
        config: promptConfigSchema.optional(),
        tags: z.array(z.string()).optional(),
        is_production: z.boolean().optional(),
        commit_message: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Get existing prompt
        let existing: PromptRecord | null;
        if (isUuid(input.id)) {
          existing = await getPromptById(input.projectId, input.id);
        } else {
          existing = await getPromptByName(input.projectId, input.id);
        }

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Prompt "${input.id}" not found`,
          });
        }

        // Get next version number
        const newVersion =
          (await getLatestPromptVersion(input.projectId, existing.name)) + 1;
        const now = new Date().toISOString();

        // Create new version with updates
        const newPromptId = uuidv4();
        const record: PromptRecord = {
          project_id: input.projectId,
          prompt_id: newPromptId,
          name: existing.name,
          description: input.description ?? existing.description,
          type: existing.type,
          template:
            input.template !== undefined ? input.template : existing.template,
          messages:
            input.messages !== undefined
              ? JSON.stringify(input.messages)
              : existing.messages,
          variables:
            input.variables !== undefined
              ? JSON.stringify(input.variables)
              : existing.variables,
          config:
            input.config !== undefined
              ? JSON.stringify(input.config)
              : existing.config,
          tags: input.tags ?? existing.tags,
          is_production:
            input.is_production !== undefined
              ? input.is_production
                ? 1
                : 0
              : existing.is_production,
          version: newVersion,
          commit_message: input.commit_message || `Version ${newVersion}`,
          created_by: "",
          created_at: now,
          updated_at: now,
          parent_version_id: existing.prompt_id,
          variant: existing.variant,
        };

        await insertPrompt(record);

        return transformPrompt(record);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error({ err: error }, "Error updating prompt");
        handleClickHouseError(error, "update prompt");
      }
    }),
});
