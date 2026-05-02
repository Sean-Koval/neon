/**
 * NeonExporter - OTLP-compatible span exporter for Neon platform
 *
 * Exports spans to the Neon API or OTel Collector using the OTLP HTTP
 * protocol. Integrates with the existing OfflineBuffer for resilient
 * delivery in unreliable network conditions.
 *
 * @example
 * ```typescript
 * import { NeonExporter } from '@neon/sdk/tracing';
 *
 * const exporter = new NeonExporter({
 *   apiUrl: 'http://localhost:4318',
 *   apiKey: 'my-api-key',
 *   batchSize: 100,
 *   flushInterval: 10000,
 * });
 *
 * exporter.addSpan(span);
 * await exporter.shutdown();
 * ```
 */

import {
  OfflineBuffer,
  type BufferedArtifactReference,
  type BufferedEvalAnnotation,
  type BufferedHandoffMetadata,
  type BufferedSessionContext,
  type BufferedStateSnapshotReference,
  type BufferedTraceMessage,
  type BufferedSpan,
  type FlushResult,
} from "./offline-buffer.js";

/**
 * Configuration for the NeonExporter
 */
export interface NeonExporterConfig {
  /** Neon API or OTel Collector endpoint URL */
  apiUrl: string;
  /** API key for authentication (optional for local collector) */
  apiKey?: string;
  /** Project/workspace ID for multi-tenant routing */
  projectId?: string;
  /** Maximum spans per export batch (default: 100) */
  batchSize?: number;
  /** Auto-flush interval in milliseconds (default: 10000) */
  flushInterval?: number;
  /** Enable offline buffering for resilient delivery (default: true) */
  offline?: boolean;
  /** Path for offline buffer persistence (default: null = memory only) */
  offlinePersistPath?: string;
  /** Maximum retry attempts per span (default: 3) */
  maxRetries?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Optional client-side masking for high-risk text payloads before export */
  masking?: {
    /** Enable masking before spans leave the process (default: false) */
    enabled?: boolean;
    /** Replacement text to use when no rule-specific replacement is provided */
    replacement?: string;
    /** High-risk span fields to redact */
    fields?: Array<
      | "input"
      | "output"
      | "toolInput"
      | "toolOutput"
      | "inputMessages"
      | "outputMessages"
      | "stateSnapshots"
      | "artifacts"
    >;
    /** Custom regex rules layered on top of Neon defaults */
    rules?: Array<{
      pattern: RegExp | string;
      replacement?: string;
    }>;
  };
  /** Optional head-based sampling config applied before buffering/export */
  sampling?: {
    /** Enable deterministic trace-level sampling (default: false) */
    enabled?: boolean;
    /** Default sample rate from 0.0 to 1.0 (default: 1.0) */
    rate?: number;
    /** Per-project sample rate overrides */
    projectRates?: Record<string, number>;
  };
  /** Optional SDK-side noisy span filtering applied before buffering/export */
  filtering?: {
    /** Enable pre-export span filtering (default: false) */
    enabled?: boolean;
    /** Drop spans matching these span types */
    excludeSpanTypes?: BufferedSpan["type"][];
    /** Drop spans matching these component types */
    excludeComponentTypes?: string[];
    /** Drop spans with names matching these exact strings or regexes */
    excludeNames?: Array<string | RegExp>;
    /** Drop spans whose attributes match any of these predicates */
    excludeAttributes?: Array<{
      key: string;
      value?: string | RegExp;
    }>;
    /** Keep error spans even when a filter matches (default: true) */
    preserveErrorSpans?: boolean;
    /** Keep root spans even when a filter matches (default: true) */
    preserveRootSpans?: boolean;
  };
}

type MaskableField =
  | "input"
  | "output"
  | "toolInput"
  | "toolOutput"
  | "inputMessages"
  | "outputMessages"
  | "stateSnapshots"
  | "artifacts";

type RedactionRule = {
  pattern: RegExp;
  replacement: string;
};

type MaskingConfig = {
  enabled: boolean;
  fields: Set<MaskableField>;
  rules: RedactionRule[];
};

type AttributeMatcher = {
  key: string;
  value?: string | RegExp;
};

type SamplingConfig = {
  enabled: boolean;
  rate: number;
  projectRates: Record<string, number>;
};

type FilteringConfig = {
  enabled: boolean;
  excludeSpanTypes: Set<BufferedSpan["type"]>;
  excludeComponentTypes: Set<string>;
  excludeNames: Array<string | RegExp>;
  excludeAttributes: AttributeMatcher[];
  preserveErrorSpans: boolean;
  preserveRootSpans: boolean;
};

const DEFAULT_MASKING_FIELDS: MaskableField[] = [
  "input",
  "output",
  "toolInput",
  "toolOutput",
  "inputMessages",
  "outputMessages",
  "stateSnapshots",
  "artifacts",
];

const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED:email]",
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED:ssn]",
  },
  {
    pattern: /\b(?:sk|pk)_(?:live|test|proj)?[_-]?[A-Za-z0-9_-]{16,}\b/g,
    replacement: "[REDACTED:api_key]",
  },
];

const DEFAULT_FILTERING_CONFIG: FilteringConfig = {
  enabled: false,
  excludeSpanTypes: new Set(),
  excludeComponentTypes: new Set(),
  excludeNames: [],
  excludeAttributes: [],
  preserveErrorSpans: true,
  preserveRootSpans: true,
};

/**
 * OTLP JSON span format for export
 */
interface OTLPExportSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Array<{
    key: string;
    value: { stringValue?: string; intValue?: string; boolValue?: boolean };
  }>;
  status: {
    code: number;
    message?: string;
  };
}

/**
 * Map status string to OTLP status code
 */
function mapStatusCode(status: string): number {
  switch (status) {
    case "ok":
      return 1;
    case "error":
      return 2;
    default:
      return 0; // unset
  }
}

/**
 * Convert BufferedSpan attributes to OTLP attribute format
 */
function toOTLPAttributes(
  attrs: Record<string, string | number | boolean>
): OTLPExportSpan["attributes"] {
  return Object.entries(attrs).map(([key, value]) => {
    if (typeof value === "boolean") {
      return { key, value: { boolValue: value } };
    }
    if (typeof value === "number") {
      return { key, value: { intValue: String(value) } };
    }
    return { key, value: { stringValue: String(value) } };
  });
}

function addJSONAttribute(
  attrs: Record<string, string | number | boolean>,
  key: string,
  value: unknown
): void {
  try {
    attrs[key] = JSON.stringify(value);
  } catch {
    // Ignore serialization failures to preserve exporter resilience.
  }
}

function addSessionAttributes(
  attrs: Record<string, string | number | boolean>,
  session?: BufferedSessionContext
): void {
  if (!session) return;
  attrs["session.id"] = session.sessionId;
  if (session.conversationId) attrs["gen_ai.conversation.id"] = session.conversationId;
  if (session.userId) attrs["enduser.id"] = session.userId;
  if (session.threadId) attrs["neon.thread.id"] = session.threadId;
  addJSONAttribute(attrs, "neon.session", session);
}

function addMessageAttributes(
  attrs: Record<string, string | number | boolean>,
  inputMessages?: BufferedTraceMessage[],
  outputMessages?: BufferedTraceMessage[]
): void {
  if (inputMessages?.length) addJSONAttribute(attrs, "gen_ai.input.messages", inputMessages);
  if (outputMessages?.length) addJSONAttribute(attrs, "gen_ai.output.messages", outputMessages);
}

function addHandoffAttributes(
  attrs: Record<string, string | number | boolean>,
  handoff?: BufferedHandoffMetadata
): void {
  if (!handoff) return;
  attrs["neon.handoff.type"] = handoff.handoffType;
  attrs["neon.handoff.to_agent"] = handoff.toAgentId;
  if (handoff.fromAgentId) attrs["neon.handoff.from_agent"] = handoff.fromAgentId;
  if (handoff.reason) attrs["neon.handoff.reason"] = handoff.reason;
  if (handoff.taskDescription) {
    attrs["neon.handoff.task_description"] = handoff.taskDescription;
  }
  addJSONAttribute(attrs, "neon.handoff", handoff);
}

function addReferenceAttributes(
  attrs: Record<string, string | number | boolean>,
  stateSnapshots?: BufferedStateSnapshotReference[],
  artifacts?: BufferedArtifactReference[],
  evalAnnotations?: BufferedEvalAnnotation[]
): void {
  if (stateSnapshots?.length) addJSONAttribute(attrs, "neon.state_snapshots", stateSnapshots);
  if (artifacts?.length) addJSONAttribute(attrs, "neon.artifacts", artifacts);
  if (evalAnnotations?.length) addJSONAttribute(attrs, "neon.eval.annotations", evalAnnotations);
}

function compileRule(
  rule: { pattern: RegExp | string; replacement?: string },
  fallbackReplacement: string
): RedactionRule {
  const source =
    typeof rule.pattern === "string" ? new RegExp(rule.pattern, "g") : rule.pattern;
  const flags = source.flags.includes("g") ? source.flags : `${source.flags}g`;
  return {
    pattern: new RegExp(source.source, flags),
    replacement: rule.replacement ?? fallbackReplacement,
  };
}

function createMaskingConfig(config?: NeonExporterConfig["masking"]): MaskingConfig {
  const replacement = config?.replacement ?? "[REDACTED]";
  return {
    enabled: config?.enabled ?? false,
    fields: new Set(config?.fields ?? DEFAULT_MASKING_FIELDS),
    rules: [
      ...DEFAULT_REDACTION_RULES,
      ...(config?.rules ?? []).map((rule) => compileRule(rule, replacement)),
    ],
  };
}

function clampRate(rate: number | undefined): number {
  if (rate == null || Number.isNaN(rate)) return 1;
  return Math.max(0, Math.min(1, rate));
}

function createSamplingConfig(config?: NeonExporterConfig["sampling"]): SamplingConfig {
  return {
    enabled: config?.enabled ?? false,
    rate: clampRate(config?.rate),
    projectRates: Object.fromEntries(
      Object.entries(config?.projectRates ?? {}).map(([projectId, rate]) => [
        projectId,
        clampRate(rate),
      ])
    ),
  };
}

function createFilteringConfig(
  config?: NeonExporterConfig["filtering"]
): FilteringConfig {
  if (!config) return DEFAULT_FILTERING_CONFIG;
  return {
    enabled: config.enabled ?? false,
    excludeSpanTypes: new Set(config.excludeSpanTypes ?? []),
    excludeComponentTypes: new Set(config.excludeComponentTypes ?? []),
    excludeNames: config.excludeNames ?? [],
    excludeAttributes: config.excludeAttributes ?? [],
    preserveErrorSpans: config.preserveErrorSpans ?? true,
    preserveRootSpans: config.preserveRootSpans ?? true,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedHash(value: string): number {
  return hashString(value) / 0xffffffff;
}

function matchesPattern(value: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string" ? value === pattern : pattern.test(value);
}

function maskString(value: string, config: MaskingConfig): string {
  return config.rules.reduce(
    (maskedValue, rule) => maskedValue.replace(rule.pattern, rule.replacement),
    value
  );
}

function maskTextField(
  value: string | undefined,
  field: "input" | "output" | "toolInput" | "toolOutput",
  config: MaskingConfig
): string | undefined {
  if (!value || !config.enabled || !config.fields.has(field)) return value;
  return maskString(value, config);
}

function maskMetadata(
  metadata: Record<string, string> | undefined,
  config: MaskingConfig
): Record<string, string> | undefined {
  if (!metadata) return metadata;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, maskString(value, config)])
  );
}

function maskMessages(
  messages: BufferedTraceMessage[] | undefined,
  field: "inputMessages" | "outputMessages",
  config: MaskingConfig
): BufferedTraceMessage[] | undefined {
  if (!messages || !config.enabled || !config.fields.has(field)) return messages;
  return messages.map((message) => ({
    ...message,
    content: maskString(message.content, config),
    metadata: maskMetadata(message.metadata, config),
    parts: message.parts?.map((part) => ({
      ...part,
      text: part.text ? maskString(part.text, config) : part.text,
      data: part.data ? maskString(part.data, config) : part.data,
      metadata: maskMetadata(part.metadata, config),
    })),
    toolCalls: message.toolCalls?.map((toolCall) => ({
      ...toolCall,
      arguments: toolCall.arguments
        ? maskString(toolCall.arguments, config)
        : toolCall.arguments,
    })),
  }));
}

function maskSnapshots(
  snapshots: BufferedStateSnapshotReference[] | undefined,
  config: MaskingConfig
): BufferedStateSnapshotReference[] | undefined {
  if (!snapshots || !config.enabled || !config.fields.has("stateSnapshots")) {
    return snapshots;
  }
  return snapshots.map((snapshot) => ({
    ...snapshot,
    name: snapshot.name ? maskString(snapshot.name, config) : snapshot.name,
    uri: snapshot.uri ? maskString(snapshot.uri, config) : snapshot.uri,
    metadata: maskMetadata(snapshot.metadata, config),
  }));
}

function maskArtifacts(
  artifacts: BufferedArtifactReference[] | undefined,
  config: MaskingConfig
): BufferedArtifactReference[] | undefined {
  if (!artifacts || !config.enabled || !config.fields.has("artifacts")) {
    return artifacts;
  }
  return artifacts.map((artifact) => ({
    ...artifact,
    name: maskString(artifact.name, config),
    uri: artifact.uri ? maskString(artifact.uri, config) : artifact.uri,
    metadata: maskMetadata(artifact.metadata, config),
  }));
}

/**
 * Convert a BufferedSpan to OTLP JSON format
 */
function toOTLPSpan(span: BufferedSpan, masking: MaskingConfig): OTLPExportSpan {
  const attrs: Record<string, string | number | boolean> = {
    ...span.attributes,
  };

  // Add type-specific attributes
  if (span.model) attrs["gen_ai.request.model"] = span.model;
  if (span.input) {
    attrs["gen_ai.prompt"] = maskTextField(span.input, "input", masking) ?? span.input;
  }
  if (span.output) {
    attrs["gen_ai.completion"] =
      maskTextField(span.output, "output", masking) ?? span.output;
  }
  if (span.inputTokens)
    attrs["gen_ai.usage.input_tokens"] = span.inputTokens;
  if (span.outputTokens)
    attrs["gen_ai.usage.output_tokens"] = span.outputTokens;
  if (span.toolName) attrs["tool.name"] = span.toolName;
  if (span.toolInput) {
    attrs["tool.input"] =
      maskTextField(span.toolInput, "toolInput", masking) ?? span.toolInput;
  }
  if (span.toolOutput) {
    attrs["tool.output"] =
      maskTextField(span.toolOutput, "toolOutput", masking) ?? span.toolOutput;
  }
  if (span.type) attrs["neon.span_type"] = span.type;
  if (span.componentType) attrs["neon.component_type"] = span.componentType;
  addSessionAttributes(attrs, span.session);
  addMessageAttributes(
    attrs,
    maskMessages(span.inputMessages, "inputMessages", masking),
    maskMessages(span.outputMessages, "outputMessages", masking)
  );
  addHandoffAttributes(attrs, span.handoff);
  addReferenceAttributes(
    attrs,
    maskSnapshots(span.stateSnapshots, masking),
    maskArtifacts(span.artifacts, masking),
    span.evalAnnotations
  );

  const startNano = BigInt(new Date(span.startTime).getTime()) * 1_000_000n;
  const endNano = span.endTime
    ? BigInt(new Date(span.endTime).getTime()) * 1_000_000n
    : undefined;

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: 0, // INTERNAL
    startTimeUnixNano: startNano.toString(),
    endTimeUnixNano: endNano?.toString(),
    attributes: toOTLPAttributes(attrs),
    status: {
      code: mapStatusCode(span.status),
      message: span.statusMessage,
    },
  };
}

/**
 * NeonExporter - exports spans to Neon platform via OTLP HTTP
 */
export class NeonExporter {
  private config: Required<
    Omit<
      NeonExporterConfig,
      "apiKey" | "projectId" | "offlinePersistPath" | "masking" | "sampling" | "filtering"
    >
  > & {
    apiKey?: string;
    projectId?: string;
    offlinePersistPath?: string;
  };
  private buffer: OfflineBuffer;
  private isShutdown = false;
  private masking: MaskingConfig;
  private sampling: SamplingConfig;
  private filtering: FilteringConfig;

  constructor(config: NeonExporterConfig) {
    this.config = {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      projectId: config.projectId,
      batchSize: config.batchSize ?? 100,
      flushInterval: config.flushInterval ?? 10000,
      offline: config.offline ?? true,
      offlinePersistPath: config.offlinePersistPath,
      maxRetries: config.maxRetries ?? 3,
      debug: config.debug ?? false,
    };
    this.masking = createMaskingConfig(config.masking);
    this.sampling = createSamplingConfig(config.sampling);
    this.filtering = createFilteringConfig(config.filtering);

    this.buffer = new OfflineBuffer({
      maxSize: this.config.batchSize,
      flushInterval: this.config.flushInterval,
      flushStrategy: "hybrid",
      maxRetries: this.config.maxRetries,
      persistPath: this.config.offline
        ? this.config.offlinePersistPath
        : undefined,
      debug: this.config.debug,
      onFlush: (spans) => this.exportSpans(spans),
    });
  }

  /**
   * Initialize the exporter (loads persisted offline buffer)
   */
  async initialize(): Promise<void> {
    await this.buffer.initialize();
  }

  /**
   * Add a span for export
   */
  addSpan(span: Omit<BufferedSpan, "bufferedAt" | "flushAttempts">): void {
    if (this.isShutdown) return;
    if (this.shouldDropSpan(span)) return;
    this.buffer.add(span);
  }

  /**
   * Add multiple spans for export
   */
  addSpans(
    spans: Array<Omit<BufferedSpan, "bufferedAt" | "flushAttempts">>
  ): void {
    if (this.isShutdown) return;
    const filteredSpans = spans.filter((span) => !this.shouldDropSpan(span));
    if (filteredSpans.length === 0) return;
    this.buffer.addBatch(filteredSpans);
  }

  /**
   * Force an immediate flush of all buffered spans
   */
  async flush(): Promise<FlushResult> {
    return this.buffer.flush();
  }

  /**
   * Gracefully shutdown the exporter
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    await this.buffer.shutdown();
  }

  /**
   * Export spans to the OTLP endpoint
   */
  private async exportSpans(spans: BufferedSpan[]): Promise<FlushResult> {
    if (spans.length === 0) {
      return { success: 0, failed: 0 };
    }

    const otlpSpans = spans.map((span) => toOTLPSpan(span, this.masking));
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "neon-sdk" },
              },
              ...(this.config.projectId
                ? [
                    {
                      key: "neon.project_id",
                      value: { stringValue: this.config.projectId },
                    },
                  ]
                : []),
            ],
          },
          scopeSpans: [
            {
              scope: { name: "@neon/sdk", version: "0.1.0" },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.config.apiKey) {
        headers["x-api-key"] = this.config.apiKey;
      }
      if (this.config.projectId) {
        headers["x-workspace-id"] = this.config.projectId;
      }

      // Send to OTLP endpoint
      const url = this.config.apiUrl.endsWith("/v1/traces")
        ? this.config.apiUrl
        : `${this.config.apiUrl}/v1/traces`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed (${response.status}): ${errorText}`);
      }

      this.log(`Exported ${spans.length} spans successfully`);
      return { success: spans.length, failed: 0 };
    } catch (error) {
      this.log(
        `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      return {
        success: 0,
        failed: spans.length,
        failedSpans: spans,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private shouldDropSpan(
    span: Omit<BufferedSpan, "bufferedAt" | "flushAttempts">
  ): boolean {
    if (this.shouldFilterSpan(span)) {
      this.log(`Filtered span ${span.traceId}/${span.spanId} (${span.name})`);
      return true;
    }

    if (this.shouldSampleOut(span)) {
      this.log(`Sampled out span ${span.traceId}/${span.spanId} (${span.name})`);
      return true;
    }

    return false;
  }

  private shouldFilterSpan(
    span: Omit<BufferedSpan, "bufferedAt" | "flushAttempts">
  ): boolean {
    if (!this.filtering.enabled) return false;
    if (this.filtering.preserveErrorSpans && span.status === "error") return false;
    if (this.filtering.preserveRootSpans && !span.parentSpanId) return false;

    if (this.filtering.excludeSpanTypes.has(span.type)) return true;

    if (
      span.componentType &&
      this.filtering.excludeComponentTypes.has(span.componentType)
    ) {
      return true;
    }

    if (
      this.filtering.excludeNames.some((pattern) =>
        matchesPattern(span.name, pattern)
      )
    ) {
      return true;
    }

    return this.filtering.excludeAttributes.some(({ key, value }) => {
      const attributeValue = span.attributes[key];
      if (attributeValue == null) return false;
      const stringValue = String(attributeValue);
      return value == null ? true : matchesPattern(stringValue, value);
    });
  }

  private shouldSampleOut(
    span: Omit<BufferedSpan, "bufferedAt" | "flushAttempts">
  ): boolean {
    if (!this.sampling.enabled) return false;

    const projectId =
      this.config.projectId ??
      (typeof span.attributes["neon.project_id"] === "string"
        ? span.attributes["neon.project_id"]
        : undefined);

    const rate = clampRate(
      projectId && this.sampling.projectRates[projectId] != null
        ? this.sampling.projectRates[projectId]
        : this.sampling.rate
    );

    if (rate >= 1) return false;
    if (rate <= 0) return true;

    return normalizedHash(`${projectId ?? "default"}:${span.traceId}`) >= rate;
  }

  private log(message: string, level: "info" | "error" = "info"): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      const prefix = `[NeonExporter ${timestamp}]`;
      if (level === "error") {
        console.error(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }
}

/**
 * Create a NeonExporter with common defaults
 */
export function createNeonExporter(
  config: NeonExporterConfig
): NeonExporter {
  return new NeonExporter(config);
}
