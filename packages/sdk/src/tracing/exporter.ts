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
}

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

/**
 * Convert a BufferedSpan to OTLP JSON format
 */
function toOTLPSpan(span: BufferedSpan): OTLPExportSpan {
  const attrs: Record<string, string | number | boolean> = {
    ...span.attributes,
  };

  // Add type-specific attributes
  if (span.model) attrs["gen_ai.request.model"] = span.model;
  if (span.input) attrs["gen_ai.prompt"] = span.input;
  if (span.output) attrs["gen_ai.completion"] = span.output;
  if (span.inputTokens)
    attrs["gen_ai.usage.input_tokens"] = span.inputTokens;
  if (span.outputTokens)
    attrs["gen_ai.usage.output_tokens"] = span.outputTokens;
  if (span.toolName) attrs["tool.name"] = span.toolName;
  if (span.toolInput) attrs["tool.input"] = span.toolInput;
  if (span.toolOutput) attrs["tool.output"] = span.toolOutput;
  if (span.type) attrs["neon.span_type"] = span.type;
  if (span.componentType) attrs["neon.component_type"] = span.componentType;

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
    Omit<NeonExporterConfig, "apiKey" | "projectId" | "offlinePersistPath">
  > & {
    apiKey?: string;
    projectId?: string;
    offlinePersistPath?: string;
  };
  private buffer: OfflineBuffer;
  private isShutdown = false;

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
    this.buffer.add(span);
  }

  /**
   * Add multiple spans for export
   */
  addSpans(
    spans: Array<Omit<BufferedSpan, "bufferedAt" | "flushAttempts">>
  ): void {
    if (this.isShutdown) return;
    this.buffer.addBatch(spans);
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

    const otlpSpans = spans.map(toOTLPSpan);
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
