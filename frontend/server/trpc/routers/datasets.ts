/**
 * Datasets Router
 *
 * tRPC procedures for training dataset CRUD operations.
 * Handles dataset creation from feedback/trace sources, format transformation,
 * train/test splitting, and example management.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { router, publicProcedure } from "../trpc";
import { logger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export type DatasetFormat = "sft" | "dpo" | "kto" | "dspy";
export type DatasetStatus = "ready" | "building" | "failed";
export type ExampleSource = "corrections" | "preferences" | "traces";

export interface DatasetExample {
  id: string;
  datasetId: string;
  split: "train" | "test";
  source: ExampleSource;
  input: string;
  output: string;
  chosen?: string;
  rejected?: string;
  score?: number;
  metadata: Record<string, unknown>;
}

export interface Dataset {
  id: string;
  name: string;
  agentId: string;
  format: DatasetFormat;
  status: DatasetStatus;
  trainCount: number;
  testCount: number;
  sourceBreakdown: {
    corrections: number;
    preferences: number;
    traces: number;
  };
  scoreThreshold: number;
  trainTestRatio: number;
  stratified: boolean;
  createdAt: string;
  lastRebuiltAt?: string;
}

// =============================================================================
// In-memory stores (will be replaced with ClickHouse + Postgres)
// =============================================================================

const datasetStore = new Map<string, Dataset>();
const exampleStore = new Map<string, DatasetExample[]>();

// Seed demo datasets
function seedDatasets() {
  if (datasetStore.size > 0) return;

  const datasets: Dataset[] = [
    {
      id: "ds-booking-sft-v3",
      name: "booking-agent-sft-v3",
      agentId: "booking-agent",
      format: "sft",
      status: "ready",
      trainCount: 992,
      testCount: 248,
      sourceBreakdown: { corrections: 769, preferences: 347, traces: 124 },
      scoreThreshold: 0.85,
      trainTestRatio: 80,
      stratified: true,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      lastRebuiltAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "ds-search-dpo-v1",
      name: "search-agent-dpo-v1",
      agentId: "search-agent",
      format: "dpo",
      status: "ready",
      trainCount: 272,
      testCount: 68,
      sourceBreakdown: { corrections: 0, preferences: 289, traces: 51 },
      scoreThreshold: 0.8,
      trainTestRatio: 80,
      stratified: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "ds-support-kto-v1",
      name: "support-agent-kto-v1",
      agentId: "support-agent",
      format: "kto",
      status: "ready",
      trainCount: 450,
      testCount: 50,
      sourceBreakdown: { corrections: 120, preferences: 280, traces: 100 },
      scoreThreshold: 0.7,
      trainTestRatio: 90,
      stratified: false,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "ds-research-dspy-v2",
      name: "research-agent-dspy-v2",
      agentId: "research-agent",
      format: "dspy",
      status: "building",
      trainCount: 0,
      testCount: 0,
      sourceBreakdown: { corrections: 45, preferences: 0, traces: 312 },
      scoreThreshold: 0.9,
      trainTestRatio: 80,
      stratified: true,
      createdAt: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  for (const ds of datasets) {
    datasetStore.set(ds.id, ds);
    // Seed examples for ready datasets
    if (ds.status === "ready") {
      const examples: DatasetExample[] = [];
      const total = ds.trainCount + ds.testCount;
      for (let i = 0; i < Math.min(total, 20); i++) {
        const isTrain = i < Math.floor(20 * (ds.trainTestRatio / 100));
        const sources: ExampleSource[] = ["corrections", "preferences", "traces"];
        const source = sources[i % 3];
        examples.push({
          id: `ex-${ds.id}-${i}`,
          datasetId: ds.id,
          split: isTrain ? "train" : "test",
          source,
          input: `What is the ${["refund policy", "checkout flow", "cancellation process", "billing cycle", "upgrade path"][i % 5]} for ${ds.agentId.replace("-agent", "")} users?`,
          output: `Here's the information about the ${["refund policy", "checkout flow", "cancellation process", "billing cycle", "upgrade path"][i % 5]}: This is a sample response demonstrating the ${ds.format.toUpperCase()} format output.`,
          score: 0.85 + Math.random() * 0.15,
          metadata: { agentId: ds.agentId, format: ds.format },
        });
      }
      exampleStore.set(ds.id, examples);
    }
  }
}

seedDatasets();

// =============================================================================
// Router
// =============================================================================

export const datasetsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        format: z.enum(["sft", "dpo", "kto", "dspy"]).optional(),
        agentId: z.string().optional(),
        status: z.enum(["ready", "building", "failed"]).optional(),
        search: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      try {
        let items = Array.from(datasetStore.values());

        if (input?.format) {
          items = items.filter((d) => d.format === input.format);
        }
        if (input?.agentId) {
          items = items.filter((d) => d.agentId === input.agentId);
        }
        if (input?.status) {
          items = items.filter((d) => d.status === input.status);
        }
        if (input?.search) {
          const q = input.search.toLowerCase();
          items = items.filter((d) => d.name.toLowerCase().includes(q));
        }

        items.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        return { datasets: items, total: items.length };
      } catch (error) {
        logger.error({ err: error }, "Error fetching datasets");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch datasets",
        });
      }
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const dataset = datasetStore.get(input.id);
      if (!dataset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found" });
      }
      return dataset;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        agentId: z.string(),
        format: z.enum(["sft", "dpo", "kto", "dspy"]),
        sources: z.object({
          corrections: z.boolean().default(true),
          preferences: z.boolean().default(true),
          traces: z.boolean().default(true),
        }),
        scoreThreshold: z.number().min(0).max(1).default(0.85),
        trainTestRatio: z.number().min(50).max(95).default(80),
        stratified: z.boolean().default(true),
        shuffleSeed: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const id = `ds-${uuidv4().slice(0, 8)}`;

        // Simulate async dataset build - set to building initially
        const dataset: Dataset = {
          id,
          name: input.name,
          agentId: input.agentId,
          format: input.format,
          status: "building",
          trainCount: 0,
          testCount: 0,
          sourceBreakdown: {
            corrections: input.sources.corrections ? Math.floor(Math.random() * 500) + 100 : 0,
            preferences: input.sources.preferences ? Math.floor(Math.random() * 300) + 50 : 0,
            traces: input.sources.traces ? Math.floor(Math.random() * 200) + 20 : 0,
          },
          scoreThreshold: input.scoreThreshold,
          trainTestRatio: input.trainTestRatio,
          stratified: input.stratified,
          createdAt: new Date().toISOString(),
        };

        const total = dataset.sourceBreakdown.corrections + dataset.sourceBreakdown.preferences + dataset.sourceBreakdown.traces;
        dataset.trainCount = Math.floor(total * (input.trainTestRatio / 100));
        dataset.testCount = total - dataset.trainCount;

        datasetStore.set(id, dataset);

        // Simulate build completion after 3 seconds
        setTimeout(() => {
          const ds = datasetStore.get(id);
          if (ds) {
            ds.status = "ready";
            datasetStore.set(id, ds);
          }
        }, 3000);

        logger.info({ datasetId: id, name: input.name }, "Dataset creation started");
        return { id, dataset };
      } catch (error) {
        logger.error({ err: error }, "Error creating dataset");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create dataset",
        });
      }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      if (!datasetStore.has(input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found" });
      }
      datasetStore.delete(input.id);
      exampleStore.delete(input.id);
      logger.info({ datasetId: input.id }, "Dataset deleted");
      return { success: true };
    }),

  getExamples: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        offset: z.number().default(0),
        limit: z.number().min(1).max(100).default(3),
      }),
    )
    .query(async ({ input }) => {
      const examples = exampleStore.get(input.datasetId) || [];
      const total = examples.length;
      const sliced = examples.slice(input.offset, input.offset + input.limit);
      return { examples: sliced, total };
    }),

  rebuild: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dataset = datasetStore.get(input.id);
      if (!dataset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found" });
      }
      dataset.status = "building";
      datasetStore.set(input.id, dataset);

      // Simulate rebuild
      setTimeout(() => {
        const ds = datasetStore.get(input.id);
        if (ds) {
          ds.status = "ready";
          ds.lastRebuiltAt = new Date().toISOString();
          datasetStore.set(input.id, ds);
        }
      }, 3000);

      return { success: true };
    }),

  export: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        format: z.enum(["openai", "huggingface", "dspy", "agent-lightning", "custom"]),
        options: z.object({
          includeTestSplit: z.boolean().default(false),
          includeMetadataHeader: z.boolean().default(true),
          shuffleExamples: z.boolean().default(true),
        }),
        customTemplate: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const dataset = datasetStore.get(input.datasetId);
      if (!dataset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Dataset not found" });
      }

      const examples = exampleStore.get(input.datasetId) || [];
      const count = input.options.includeTestSplit ? examples.length : examples.filter((e) => e.split === "train").length;
      const avgSize = 250; // bytes per example estimate
      const fileSize = count * avgSize;

      // Record in export history (in-memory)
      const exportId = `exp-${uuidv4().slice(0, 8)}`;
      const record = {
        id: exportId,
        datasetId: input.datasetId,
        datasetName: dataset.name,
        format: input.format,
        fileSize,
        exampleCount: count,
        createdAt: new Date().toISOString(),
      };

      if (!exportHistoryStore.has(input.datasetId)) {
        exportHistoryStore.set(input.datasetId, []);
      }
      exportHistoryStore.get(input.datasetId)!.push(record);

      return {
        downloadUrl: `/api/exports/${exportId}`,
        fileSize,
        exampleCount: count,
        exportId,
      };
    }),

  exportHistory: publicProcedure
    .input(z.object({ datasetId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const all: ExportRecord[] = [];
      if (input?.datasetId) {
        all.push(...(exportHistoryStore.get(input.datasetId) || []));
      } else {
        for (const records of exportHistoryStore.values()) {
          all.push(...records);
        }
      }
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { exports: all, total: all.length };
    }),

  clearExportHistory: publicProcedure
    .mutation(async () => {
      exportHistoryStore.clear();
      return { success: true };
    }),

  getPreview: publicProcedure
    .input(
      z.object({
        datasetId: z.string(),
        format: z.enum(["openai", "huggingface", "dspy", "agent-lightning", "custom"]),
        customTemplate: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const examples = exampleStore.get(input.datasetId) || [];
      const sampleExamples = examples.slice(0, 3);

      const formatted = sampleExamples.map((ex) => {
        switch (input.format) {
          case "openai":
            return {
              messages: [
                { role: "user", content: ex.input },
                { role: "assistant", content: ex.output },
              ],
            };
          case "huggingface":
            return { prompt: ex.input, completion: ex.output, label: true };
          case "dspy":
            return { input: ex.input, output: ex.output, metadata: { agent: ex.metadata.agentId, score: ex.score } };
          case "agent-lightning":
            return { input: ex.input, output: ex.output, tools: [], trace_id: ex.id };
          case "custom":
            if (input.customTemplate) {
              try {
                let result = input.customTemplate;
                result = result.replace(/\{\{input\}\}/g, ex.input);
                result = result.replace(/\{\{output\}\}/g, ex.output);
                result = result.replace(/\{\{source_type\}\}/g, ex.source);
                result = result.replace(/\{\{agent_name\}\}/g, String(ex.metadata.agentId || ""));
                result = result.replace(/\{\{score\}\}/g, String(ex.score || ""));
                result = result.replace(/\{\{trace_id\}\}/g, ex.id);
                result = result.replace(/\{\{created_at\}\}/g, new Date().toISOString());
                return JSON.parse(result);
              } catch {
                return { error: "Invalid template" };
              }
            }
            return { input: ex.input, output: ex.output };
          default:
            return { input: ex.input, output: ex.output };
        }
      });

      return { preview: formatted };
    }),
});

// Export history store
interface ExportRecord {
  id: string;
  datasetId: string;
  datasetName: string;
  format: string;
  fileSize: number;
  exampleCount: number;
  createdAt: string;
}

const exportHistoryStore = new Map<string, ExportRecord[]>();

// Seed export history
const seedExport: ExportRecord = {
  id: "exp-seed-001",
  datasetId: "ds-booking-sft-v3",
  datasetName: "booking-agent-sft-v3",
  format: "openai",
  fileSize: 2457600,
  exampleCount: 1240,
  createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
};
exportHistoryStore.set("ds-booking-sft-v3", [seedExport]);
