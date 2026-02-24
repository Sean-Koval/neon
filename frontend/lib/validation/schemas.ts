/**
 * Zod Validation Schemas for API Endpoints
 *
 * Defines request body schemas for all API routes that accept input.
 * Used with validateBody() middleware to reject malformed requests.
 *
 * @module lib/validation/schemas
 */

import { z } from 'zod'

// =============================================================================
// Shared / Reusable Schemas
// =============================================================================

/** UUID v4 format */
const uuid = z.string().uuid()

/** Non-empty trimmed string */
const nonEmpty = z.string().min(1)

// =============================================================================
// Runs API - POST /api/runs
// =============================================================================

const datasetItemSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  expected: z.record(z.string(), z.unknown()).optional(),
})

const toolDefinitionSchema = z.object({
  name: nonEmpty,
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
})

export const createRunSchema = z.object({
  projectId: z.string().optional(),
  agentId: nonEmpty,
  agentVersion: z.string().optional(),
  suiteId: z.string().optional(),
  dataset: z.object({
    items: z.array(datasetItemSchema).min(1),
  }),
  tools: z.array(toolDefinitionSchema).optional(),
  scorers: z.array(nonEmpty).min(1),
  parallel: z.boolean().optional(),
  parallelism: z.number().int().min(1).max(100).optional(),
  runId: z.string().optional(),
})

// =============================================================================
// Runs Control API - POST /api/runs/:id/control
// =============================================================================

export const runControlSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
})

// =============================================================================
// Scores API - POST /api/scores
// =============================================================================

export const createScoreSchema = z.object({
  project_id: z.string().optional(),
  score_id: z.string().optional(),
  trace_id: nonEmpty,
  span_id: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
  case_id: z.string().nullable().optional(),
  name: nonEmpty,
  value: z.number(),
  score_type: z.enum(['numeric', 'boolean', 'categorical']).optional(),
  string_value: z.string().nullable().optional(),
  comment: z.string().optional(),
  source: z.enum(['api', 'sdk', 'annotation', 'eval', 'temporal']).optional(),
  config_id: z.string().nullable().optional(),
  author_id: z.string().nullable().optional(),
})

// =============================================================================
// Suites API - POST /api/suites
// =============================================================================

export const createSuiteSchema = z.object({
  project_id: z.string().optional(),
  name: nonEmpty,
  description: z.string().nullable().optional(),
  agent_id: z.string().optional(),
  default_scorers: z.array(z.string()).optional(),
  default_min_score: z.number().min(0).max(1).optional(),
  default_timeout_seconds: z.number().int().min(1).max(3600).optional(),
  default_config: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// Suites API - PATCH /api/suites/:id
// =============================================================================

export const updateSuiteSchema = z.object({
  name: nonEmpty.optional(),
  description: z.string().nullable().optional(),
  agent_id: z.string().optional(),
  default_scorers: z.array(z.string()).optional(),
  default_min_score: z.number().min(0).max(1).optional(),
  default_timeout_seconds: z.number().int().min(1).max(3600).optional(),
  default_config: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// Traces API - POST /api/v1/traces (OTLP Ingestion)
// =============================================================================

const otlpAttributeValueSchema = z.object({
  stringValue: z.string().optional(),
  intValue: z.string().optional(),
  doubleValue: z.number().optional(),
  boolValue: z.boolean().optional(),
})

const otlpAttributeSchema = z.object({
  key: z.string(),
  value: otlpAttributeValueSchema,
})

const otlpSpanStatusSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
})

const otlpSpanSchema = z.object({
  traceId: nonEmpty,
  spanId: nonEmpty,
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.number().optional(),
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string().optional(),
  attributes: z.array(otlpAttributeSchema).optional(),
  status: otlpSpanStatusSchema.optional(),
})

const otlpScopeSpanSchema = z.object({
  scope: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  spans: z.array(otlpSpanSchema),
})

const otlpResourceSpanSchema = z.object({
  resource: z
    .object({
      attributes: z.array(otlpAttributeSchema).optional(),
    })
    .optional(),
  scopeSpans: z.array(otlpScopeSpanSchema),
})

export const createTracesSchema = z.object({
  resourceSpans: z.array(otlpResourceSpanSchema).min(1),
})

// =============================================================================
// Compare API - POST /api/compare
// =============================================================================

export const compareRunsSchema = z.object({
  baseline_run_id: nonEmpty,
  candidate_run_id: nonEmpty,
  threshold: z.number().min(0).max(1).optional(),
})

// =============================================================================
// Feedback API - POST /api/feedback
// =============================================================================

const preferenceFeedbackSchema = z.object({
  comparison_id: nonEmpty,
  choice: z.enum(['A', 'B', 'tie', 'both_bad']),
  reason: z.string().optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  decision_time_ms: z.number().optional(),
})

const correctionFeedbackSchema = z.object({
  response_id: nonEmpty,
  original_content: nonEmpty,
  corrected_content: nonEmpty,
  change_summary: z.string().optional(),
  correction_types: z.array(z.string()).optional(),
})

export const createFeedbackSchema = z.object({
  type: z.enum(['preference', 'correction', 'rating']),
  preference: preferenceFeedbackSchema.optional(),
  correction: correctionFeedbackSchema.optional(),
  user_id: z.string().optional(),
  session_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// Comparisons API - POST /api/feedback/comparisons
// =============================================================================

const responseOptionSchema = z.object({
  id: z.string().optional(),
  content: nonEmpty,
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: z.string().optional(),
})

export const createComparisonSchema = z.object({
  prompt: nonEmpty,
  responseA: responseOptionSchema,
  responseB: responseOptionSchema,
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// =============================================================================
// Prompts API - POST /api/prompts
// =============================================================================

const promptMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

const promptVariableSchema = z.object({
  name: nonEmpty,
  description: z.string().optional(),
  type: z
    .enum([
      'string',
      'number',
      'boolean',
      'object',
      'array',
      'string_array',
      'enum',
      'messages',
      'tool_result',
      'agent_output',
      'context',
    ])
    .optional(),
  source: z
    .enum(['input', 'system', 'memory', 'tool', 'agent', 'runtime', 'unknown'])
    .optional(),
  rendering: z.enum(['text', 'json', 'join_lines', 'messages']).optional(),
  enum_values: z.array(z.string()).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
})

const promptConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  stopSequences: z.array(z.string()).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
})

export const createPromptSchema = z.object({
  projectId: z.string().optional(),
  name: nonEmpty,
  description: z.string().optional(),
  type: z.enum(['text', 'chat']),
  template: z.string().optional(),
  messages: z.array(promptMessageSchema).optional(),
  variables: z.array(promptVariableSchema).optional(),
  config: promptConfigSchema.optional(),
  tags: z.array(z.string()).optional(),
  is_production: z.boolean().optional(),
  commit_message: z.string().optional(),
})

// =============================================================================
// Prompts API - PATCH /api/prompts/:id
// =============================================================================

export const updatePromptSchema = z.object({
  projectId: z.string().optional(),
  description: z.string().optional(),
  template: z.string().optional(),
  messages: z.array(promptMessageSchema).optional(),
  variables: z.array(promptVariableSchema).optional(),
  config: promptConfigSchema.optional(),
  tags: z.array(z.string()).optional(),
  is_production: z.boolean().optional(),
  commit_message: z.string().optional(),
})

// =============================================================================
// Spans API - POST /api/spans
// =============================================================================

const spanRecordSchema = z.object({
  project_id: z.string().optional(),
  trace_id: nonEmpty,
  span_id: nonEmpty,
  parent_span_id: z.string().nullable().optional(),
  name: z.string(),
  kind: z
    .enum(['internal', 'server', 'client', 'producer', 'consumer'])
    .optional(),
  span_type: z
    .enum(['span', 'generation', 'tool', 'retrieval', 'event'])
    .optional(),
  timestamp: z.string(),
  end_time: z.string().nullable().optional(),
  duration_ms: z.number().optional(),
  status: z.enum(['unset', 'ok', 'error']).optional(),
  status_message: z.string().optional(),
  model: z.string().nullable().optional(),
  model_parameters: z.record(z.string(), z.unknown()).optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  input_tokens: z.number().nullable().optional(),
  output_tokens: z.number().nullable().optional(),
  total_tokens: z.number().nullable().optional(),
  cost_usd: z.number().nullable().optional(),
  tool_name: z.string().nullable().optional(),
  tool_input: z.string().optional(),
  tool_output: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
})

export const createSpanSchema = z.union([
  spanRecordSchema,
  z.array(spanRecordSchema).min(1),
])

// =============================================================================
// Type Exports
// =============================================================================

export type CreateRunInput = z.infer<typeof createRunSchema>
export type RunControlInput = z.infer<typeof runControlSchema>
export type CreateScoreInput = z.infer<typeof createScoreSchema>
export type CreateSuiteInput = z.infer<typeof createSuiteSchema>
export type UpdateSuiteInput = z.infer<typeof updateSuiteSchema>
export type CreateTracesInput = z.infer<typeof createTracesSchema>
export type CompareRunsInput = z.infer<typeof compareRunsSchema>
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type CreateComparisonInput = z.infer<typeof createComparisonSchema>
export type CreatePromptInput = z.infer<typeof createPromptSchema>
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>
export type CreateSpanInput = z.infer<typeof createSpanSchema>
