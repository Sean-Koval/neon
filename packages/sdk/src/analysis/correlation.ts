/**
 * Failure Correlation Analyzer
 *
 * Analyzes traces stored in ClickHouse to identify correlated failure patterns,
 * systemic issues, and component-level failure trends across time windows.
 *
 * This module provides:
 * - Cross-trace pattern correlation for detecting systemic issues
 * - Component-level failure analysis to identify problematic components
 * - Time-windowed correlation analysis for trend detection
 * - Correlation strength scoring using statistical measures
 *
 * @example
 * ```typescript
 * import { createCorrelationAnalyzer } from "@neon/sdk/analysis";
 *
 * const analyzer = createCorrelationAnalyzer({
 *   clickhouseUrl: "http://localhost:8123",
 *   database: "neon",
 * });
 *
 * // Find correlated failures in the last 24 hours
 * const correlations = await analyzer.findCorrelatedFailures({
 *   projectId: "my-project",
 *   timeWindow: { hours: 24 },
 *   minCorrelationStrength: 0.5,
 * });
 *
 * // Identify systemic issues
 * const issues = await analyzer.identifySystemicIssues({
 *   projectId: "my-project",
 *   timeWindow: { days: 7 },
 *   minOccurrences: 3,
 * });
 * ```
 */

import type { ComponentType, SpanType } from "@neon/shared";
import {
  type ErrorCategory,
  type FailurePattern,
  normalizeErrorMessage,
  categorizeError,
  computeSignature,
} from "./pattern-detector.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Error thrown when ClickHouse operations fail
 */
export class CorrelationAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: CorrelationErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CorrelationAnalysisError";
  }
}

/**
 * Error codes for correlation analysis failures
 */
export type CorrelationErrorCode =
  | "QUERY_FAILED"      // ClickHouse query execution failed
  | "QUERY_TIMEOUT"     // Query exceeded timeout
  | "PARSE_ERROR"       // Failed to parse query results
  | "CONNECTION_ERROR"  // Failed to connect to ClickHouse
  | "INVALID_INPUT";    // Invalid input parameters

/**
 * Configuration for the ClickHouse connection
 */
export interface ClickHouseConfig {
  /** ClickHouse URL (e.g., http://localhost:8123) */
  url?: string;
  /** ClickHouse username */
  username?: string;
  /** ClickHouse password */
  password?: string;
  /** Database name */
  database?: string;
  /** Query timeout in milliseconds. Default: 30000 (30s) */
  queryTimeoutMs?: number;
  /** Enable query result caching. Default: false */
  enableCache?: boolean;
  /** Cache TTL in milliseconds. Default: 60000 (1 minute) */
  cacheTtlMs?: number;
}

/**
 * Time window specification for analysis
 */
export interface TimeWindow {
  /** Number of minutes in the window */
  minutes?: number;
  /** Number of hours in the window */
  hours?: number;
  /** Number of days in the window */
  days?: number;
  /** Explicit start date */
  startDate?: Date;
  /** Explicit end date (defaults to now) */
  endDate?: Date;
}

/**
 * Raw failure record from ClickHouse query
 */
export interface FailureRecord {
  traceId: string;
  spanId: string;
  spanName: string;
  spanType: SpanType;
  componentType: ComponentType | null;
  toolName: string | null;
  statusMessage: string;
  timestamp: Date;
  durationMs: number;
  model: string | null;
  attributes: Record<string, string>;
}

/**
 * Aggregated failure pattern with occurrence data
 */
export interface CorrelatedPattern extends FailurePattern {
  /** Trace IDs where this pattern occurred */
  traceIds: string[];
  /** Distribution of occurrences by hour */
  hourlyDistribution: Map<string, number>;
  /** Components where this pattern appears */
  affectedComponents: ComponentType[];
  /** Models where this pattern appears (if relevant) */
  affectedModels: string[];
  /** Correlation score with other patterns (pattern signature -> correlation) */
  correlations: Map<string, number>;
}

/**
 * Systemic issue identified across multiple traces
 */
export interface SystemicIssue {
  /** Unique ID for the issue */
  issueId: string;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Severity level (critical/high/medium/low) */
  severity: "critical" | "high" | "medium" | "low";
  /** Type of systemic issue */
  issueType:
    | "component_failure"   // Same component failing repeatedly
    | "cascading_failure"   // Failures propagating through system
    | "temporal_cluster"    // Failures clustered in time
    | "model_degradation"   // Specific model performing poorly
    | "tool_instability";   // Specific tool failing frequently
  /** Primary component or entity affected */
  primaryTarget: string;
  /** Error category */
  errorCategory: ErrorCategory;
  /** Representative error message */
  errorPattern: string;
  /** Number of affected traces */
  affectedTraceCount: number;
  /** Affected trace IDs */
  affectedTraceIds: string[];
  /** Total failure count */
  totalFailures: number;
  /** First occurrence */
  firstSeen: Date;
  /** Most recent occurrence */
  lastSeen: Date;
  /** Confidence score (0-1) */
  confidence: number;
  /** Impact score based on frequency and recency */
  impactScore: number;
  /** Related patterns that co-occur with this issue */
  relatedPatterns: string[];
}

/**
 * Correlation between two failure patterns
 */
export interface PatternCorrelation {
  /** First pattern signature */
  patternA: string;
  /** Second pattern signature */
  patternB: string;
  /** Correlation strength (0-1) */
  strength: number;
  /** Number of traces where both patterns occur */
  coOccurrenceCount: number;
  /** Total traces with pattern A */
  patternACount: number;
  /** Total traces with pattern B */
  patternBCount: number;
  /** Type of correlation */
  correlationType: "temporal" | "causal" | "coincidental";
  /** Average time delta between patterns (ms) if temporal */
  avgTimeDeltaMs?: number;
}

/**
 * Component health metrics
 */
export interface ComponentHealth {
  /** Component type */
  component: ComponentType;
  /** Total span count */
  totalSpans: number;
  /** Error count */
  errorCount: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Average duration when successful (ms) */
  avgSuccessDurationMs: number;
  /** Average duration when failed (ms) */
  avgFailureDurationMs: number;
  /** Most common error categories */
  topErrorCategories: Array<{ category: ErrorCategory; count: number }>;
  /** Trend direction (improving/stable/degrading) */
  trend: "improving" | "stable" | "degrading";
  /** Health score (0-100) */
  healthScore: number;
}

/**
 * Time-windowed analysis result
 */
export interface TimeWindowAnalysis {
  /** Start of the window */
  windowStart: Date;
  /** End of the window */
  windowEnd: Date;
  /** Total traces analyzed */
  totalTraces: number;
  /** Total failures */
  totalFailures: number;
  /** Error rate for the window */
  errorRate: number;
  /** Patterns detected in this window */
  patterns: CorrelatedPattern[];
  /** Systemic issues identified */
  systemicIssues: SystemicIssue[];
  /** Component health metrics */
  componentHealth: ComponentHealth[];
  /** Pattern correlations */
  correlations: PatternCorrelation[];
}

/**
 * Options for finding correlated failures
 */
export interface FindCorrelatedFailuresOptions {
  /** Project ID to analyze */
  projectId: string;
  /** Time window for analysis */
  timeWindow: TimeWindow;
  /** Minimum correlation strength (0-1). Default: 0.3 */
  minCorrelationStrength?: number;
  /** Minimum pattern frequency. Default: 2 */
  minFrequency?: number;
  /** Maximum patterns to return. Default: 50 */
  maxPatterns?: number;
  /** Filter to specific components */
  components?: ComponentType[];
  /** Filter to specific error categories */
  errorCategories?: ErrorCategory[];
}

/**
 * Options for identifying systemic issues
 */
export interface IdentifySystemicIssuesOptions {
  /** Project ID to analyze */
  projectId: string;
  /** Time window for analysis */
  timeWindow: TimeWindow;
  /** Minimum occurrences to be considered systemic. Default: 3 */
  minOccurrences?: number;
  /** Minimum affected traces. Default: 2 */
  minAffectedTraces?: number;
  /** Include only certain severities */
  severityFilter?: Array<"critical" | "high" | "medium" | "low">;
}

/**
 * Options for component health analysis
 */
export interface ComponentHealthOptions {
  /** Project ID to analyze */
  projectId: string;
  /** Time window for analysis */
  timeWindow: TimeWindow;
  /** Components to analyze (all if not specified) */
  components?: ComponentType[];
  /** Include trend analysis. Default: true */
  includeTrend?: boolean;
}

// ============================================================================
// ClickHouse Client Interface
// ============================================================================

/**
 * Minimal ClickHouse client interface for dependency injection
 * This allows the SDK to work with or without ClickHouse installed
 */
export interface ClickHouseClientInterface {
  query<T>(params: {
    query: string;
    query_params?: Record<string, unknown>;
    format?: string;
    /** Query timeout in milliseconds */
    clickhouse_settings?: {
      max_execution_time?: number;
    };
  }): Promise<{ json: () => Promise<T[]> }>;
}

/**
 * Factory function type for creating ClickHouse clients
 */
export type ClickHouseClientFactory = (config: ClickHouseConfig) => ClickHouseClientInterface;

/**
 * Simple LRU cache for query results
 */
class QueryCache {
  private cache = new Map<string, { data: unknown; expiry: number }>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Resolve time window to start and end dates
 */
function resolveTimeWindow(window: TimeWindow): { startDate: Date; endDate: Date } {
  const endDate = window.endDate || new Date();
  let startDate: Date;

  if (window.startDate) {
    startDate = window.startDate;
  } else {
    const totalMinutes =
      (window.minutes || 0) +
      (window.hours || 0) * 60 +
      (window.days || 0) * 24 * 60;

    if (totalMinutes === 0) {
      // Default to 24 hours
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(endDate.getTime() - totalMinutes * 60 * 1000);
    }
  }

  return { startDate, endDate };
}

/**
 * Format date for ClickHouse query
 */
function formatDateForCH(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Calculate Jaccard index between two sets
 */
function jaccardIndex<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 1.0;
  }
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Calculate Phi coefficient (correlation for binary variables)
 * Used for measuring correlation between pattern occurrences
 */
function phiCoefficient(
  n11: number, // Both patterns present
  n10: number, // Pattern A only
  n01: number, // Pattern B only
  n00: number  // Neither pattern
): number {
  const n1_ = n11 + n10;
  const n0_ = n01 + n00;
  const n_1 = n11 + n01;
  const n_0 = n10 + n00;

  const denominator = Math.sqrt(n1_ * n0_ * n_1 * n_0);
  if (denominator === 0) {
    return 0;
  }

  return (n11 * n00 - n10 * n01) / denominator;
}

/**
 * Calculate severity based on frequency and impact
 */
function calculateSeverity(
  failureCount: number,
  affectedTraceCount: number,
  errorCategory: ErrorCategory
): "critical" | "high" | "medium" | "low" {
  // Critical categories get elevated
  const criticalCategories: ErrorCategory[] = [
    "authentication",
    "authorization",
    "server_error",
    "resource_exhausted",
  ];

  const baseScore =
    Math.min(failureCount, 20) / 20 * 0.5 +
    Math.min(affectedTraceCount, 10) / 10 * 0.5;

  const categoryMultiplier = criticalCategories.includes(errorCategory) ? 1.5 : 1.0;
  const adjustedScore = Math.min(1.0, baseScore * categoryMultiplier);

  if (adjustedScore >= 0.75) return "critical";
  if (adjustedScore >= 0.5) return "high";
  if (adjustedScore >= 0.25) return "medium";
  return "low";
}

/**
 * Calculate impact score based on recency and frequency
 */
function calculateImpactScore(
  failureCount: number,
  firstSeen: Date,
  lastSeen: Date,
  windowEnd: Date
): number {
  const windowMs = windowEnd.getTime() - firstSeen.getTime();
  const recencyMs = windowEnd.getTime() - lastSeen.getTime();

  // Frequency component (log scale, capped)
  const frequencyScore = Math.min(1.0, Math.log10(failureCount + 1) / 2);

  // Recency component (exponential decay)
  const recencyHours = Math.max(0, recencyMs) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-recencyHours / 24); // 24-hour half-life

  // Persistence component (how long has this been happening)
  // Guard against division by zero when windowMs is 0 or negative
  const persistenceMs = lastSeen.getTime() - firstSeen.getTime();
  const persistenceScore = windowMs > 0
    ? Math.min(1.0, Math.max(0, persistenceMs) / windowMs)
    : (persistenceMs > 0 ? 1.0 : 0.0);

  return (
    frequencyScore * 0.4 +
    recencyScore * 0.4 +
    persistenceScore * 0.2
  );
}

/**
 * Generate a unique issue ID
 */
function generateIssueId(
  issueType: SystemicIssue["issueType"],
  target: string,
  category: ErrorCategory
): string {
  const parts = [issueType, target, category];
  const hash = parts.join("|").split("").reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  return `issue-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// ============================================================================
// Correlation Analyzer Class
// ============================================================================

/**
 * Correlation Analyzer for identifying systemic failure patterns
 *
 * The analyzer queries ClickHouse to find patterns across traces and
 * identifies correlations that indicate systemic issues.
 */
export class CorrelationAnalyzer {
  private client: ClickHouseClientInterface;
  private config: Required<ClickHouseConfig>;
  private cache: QueryCache | null;

  constructor(
    client: ClickHouseClientInterface,
    config?: ClickHouseConfig
  ) {
    this.client = client;
    this.config = {
      url: config?.url || process.env.CLICKHOUSE_URL || "http://localhost:8123",
      username: config?.username || process.env.CLICKHOUSE_USER || "default",
      password: config?.password || process.env.CLICKHOUSE_PASSWORD || "",
      database: config?.database || process.env.CLICKHOUSE_DATABASE || "neon",
      queryTimeoutMs: config?.queryTimeoutMs ?? 30000,
      enableCache: config?.enableCache ?? false,
      cacheTtlMs: config?.cacheTtlMs ?? 60000,
    };
    this.cache = this.config.enableCache ? new QueryCache() : null;
  }

  /**
   * Clear the query cache
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { enabled: boolean; size: number } {
    return {
      enabled: this.config.enableCache,
      size: this.cache?.size ?? 0,
    };
  }

  /**
   * Execute a query with error handling, timeout, and optional caching
   */
  private async executeQuery<T>(
    queryKey: string,
    query: string,
    params: Record<string, unknown>
  ): Promise<T[]> {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get<T[]>(queryKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      const timeoutSeconds = Math.ceil(this.config.queryTimeoutMs / 1000);

      const result = await this.client.query<T>({
        query,
        query_params: params,
        format: "JSONEachRow",
        clickhouse_settings: {
          max_execution_time: timeoutSeconds,
        },
      });

      const rows = await result.json();

      // Cache the result
      if (this.cache) {
        this.cache.set(queryKey, rows, this.config.cacheTtlMs);
      }

      return rows;
    } catch (error) {
      // Categorize the error
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
        throw new CorrelationAnalysisError(
          `Query timed out after ${this.config.queryTimeoutMs}ms`,
          "QUERY_TIMEOUT",
          error
        );
      }

      if (errorMessage.includes("connect") || errorMessage.includes("ECONNREFUSED")) {
        throw new CorrelationAnalysisError(
          `Failed to connect to ClickHouse: ${errorMessage}`,
          "CONNECTION_ERROR",
          error
        );
      }

      throw new CorrelationAnalysisError(
        `ClickHouse query failed: ${errorMessage}`,
        "QUERY_FAILED",
        error
      );
    }
  }

  /**
   * Safely parse JSON attributes from ClickHouse
   */
  private parseAttributes(attributes: string | Record<string, string>): Record<string, string> {
    if (typeof attributes === "object" && attributes !== null) {
      return attributes;
    }
    if (typeof attributes === "string") {
      try {
        return JSON.parse(attributes);
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Query failed spans from ClickHouse
   */
  private async queryFailedSpans(
    projectId: string,
    startDate: Date,
    endDate: Date,
    components?: ComponentType[]
  ): Promise<FailureRecord[]> {
    const conditions = [
      "project_id = {projectId:String}",
      "status = 'error'",
      "timestamp >= {startDate:DateTime64(3)}",
      "timestamp <= {endDate:DateTime64(3)}",
    ];

    if (components && components.length > 0) {
      conditions.push("component_type IN {components:Array(String)}");
    }

    const query = `
      SELECT
        trace_id as traceId,
        span_id as spanId,
        name as spanName,
        span_type as spanType,
        component_type as componentType,
        tool_name as toolName,
        status_message as statusMessage,
        timestamp,
        duration_ms as durationMs,
        model,
        attributes
      FROM spans
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp ASC
    `;

    interface RawRecord {
      traceId: string;
      spanId: string;
      spanName: string;
      spanType: string;
      componentType: string | null;
      toolName: string | null;
      statusMessage: string;
      timestamp: string;
      durationMs: number;
      model: string | null;
      attributes: string | Record<string, string>;
    }

    const cacheKey = `failed_spans:${projectId}:${startDate.getTime()}:${endDate.getTime()}:${components?.join(",") || ""}`;
    const rows = await this.executeQuery<RawRecord>(cacheKey, query, {
      projectId,
      startDate: formatDateForCH(startDate),
      endDate: formatDateForCH(endDate),
      components: components || [],
    });

    return rows.map((row) => ({
      traceId: row.traceId,
      spanId: row.spanId,
      spanName: row.spanName,
      spanType: row.spanType as SpanType,
      componentType: row.componentType as ComponentType | null,
      toolName: row.toolName,
      statusMessage: row.statusMessage || "",
      timestamp: new Date(row.timestamp),
      durationMs: row.durationMs,
      model: row.model,
      attributes: this.parseAttributes(row.attributes),
    }));
  }

  /**
   * Query trace counts for correlation calculation
   */
  private async queryTraceCounts(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ totalTraces: number; errorTraces: number }> {
    const query = `
      SELECT
        count() as totalTraces,
        countIf(status = 'error') as errorTraces
      FROM traces
      WHERE project_id = {projectId:String}
        AND timestamp >= {startDate:DateTime64(3)}
        AND timestamp <= {endDate:DateTime64(3)}
    `;

    interface CountResult {
      totalTraces: number;
      errorTraces: number;
    }

    const cacheKey = `trace_counts:${projectId}:${startDate.getTime()}:${endDate.getTime()}`;
    const rows = await this.executeQuery<CountResult>(cacheKey, query, {
      projectId,
      startDate: formatDateForCH(startDate),
      endDate: formatDateForCH(endDate),
    });

    return rows[0] || { totalTraces: 0, errorTraces: 0 };
  }

  /**
   * Group failures into patterns
   */
  private groupFailuresIntoPatterns(
    failures: FailureRecord[],
    minFrequency: number
  ): Map<string, CorrelatedPattern> {
    const patternMap = new Map<string, {
      records: FailureRecord[];
      traceIds: Set<string>;
      components: Set<ComponentType>;
      models: Set<string>;
      hourlyDist: Map<string, number>;
    }>();

    // Group by normalized message and category
    for (const failure of failures) {
      const normalized = normalizeErrorMessage(failure.statusMessage);
      const category = categorizeError(failure.statusMessage);

      // Create signature for grouping
      const signatureKey = [
        category,
        normalized || "unknown",
        failure.componentType || "any",
        failure.spanType,
      ].join("|");

      if (!patternMap.has(signatureKey)) {
        patternMap.set(signatureKey, {
          records: [],
          traceIds: new Set(),
          components: new Set(),
          models: new Set(),
          hourlyDist: new Map(),
        });
      }

      const group = patternMap.get(signatureKey)!;
      group.records.push(failure);
      group.traceIds.add(failure.traceId);

      if (failure.componentType) {
        group.components.add(failure.componentType);
      }
      if (failure.model) {
        group.models.add(failure.model);
      }

      // Track hourly distribution
      const hourKey = failure.timestamp.toISOString().slice(0, 13);
      group.hourlyDist.set(hourKey, (group.hourlyDist.get(hourKey) || 0) + 1);
    }

    // Convert to CorrelatedPattern objects
    const patterns = new Map<string, CorrelatedPattern>();

    for (const [key, group] of patternMap) {
      if (group.records.length < minFrequency) {
        continue;
      }

      const firstRecord = group.records[0];
      const category = categorizeError(firstRecord.statusMessage);
      const normalized = normalizeErrorMessage(firstRecord.statusMessage);

      const signature = computeSignature({
        errorMessage: firstRecord.statusMessage,
        normalizedMessage: normalized,
        errorCategory: category,
        componentType: firstRecord.componentType || undefined,
        spanType: firstRecord.spanType,
        toolName: firstRecord.toolName || undefined,
        spanName: firstRecord.spanName,
        stackSignature: undefined,
      });

      const timestamps = group.records.map((r) => r.timestamp.getTime());
      const toolNames = [...new Set(group.records.map((r) => r.toolName).filter(Boolean))] as string[];
      const spanTypes = [...new Set(group.records.map((r) => r.spanType))];

      patterns.set(signature, {
        signature,
        name: `${category} in ${firstRecord.componentType || "unknown"}`,
        messagePattern: normalized || firstRecord.statusMessage || "unknown",
        category,
        componentTypes: [...group.components],
        toolNames,
        spanTypes,
        frequency: group.records.length,
        firstSeen: new Date(Math.min(...timestamps)),
        lastSeen: new Date(Math.max(...timestamps)),
        exampleSpanIds: group.records.slice(0, 5).map((r) => r.spanId),
        confidence: Math.min(1.0, group.records.length / 10),
        traceIds: [...group.traceIds],
        hourlyDistribution: group.hourlyDist,
        affectedComponents: [...group.components],
        affectedModels: [...group.models],
        correlations: new Map(),
      });
    }

    return patterns;
  }

  /**
   * Calculate correlations between patterns
   */
  private calculatePatternCorrelations(
    patterns: Map<string, CorrelatedPattern>,
    totalTraces: number,
    minCorrelation: number
  ): PatternCorrelation[] {
    const correlations: PatternCorrelation[] = [];
    const patternList = [...patterns.values()];

    // Build trace-to-patterns index
    const tracePatterns = new Map<string, Set<string>>();
    for (const pattern of patternList) {
      for (const traceId of pattern.traceIds) {
        if (!tracePatterns.has(traceId)) {
          tracePatterns.set(traceId, new Set());
        }
        tracePatterns.get(traceId)!.add(pattern.signature);
      }
    }

    // Calculate pairwise correlations
    for (let i = 0; i < patternList.length; i++) {
      for (let j = i + 1; j < patternList.length; j++) {
        const patternA = patternList[i];
        const patternB = patternList[j];

        const traceSetA = new Set(patternA.traceIds);
        const traceSetB = new Set(patternB.traceIds);

        // Count co-occurrences
        const coOccurrence = [...traceSetA].filter((t) => traceSetB.has(t)).length;

        if (coOccurrence === 0) {
          continue;
        }

        const onlyA = traceSetA.size - coOccurrence;
        const onlyB = traceSetB.size - coOccurrence;
        const neither = totalTraces - traceSetA.size - traceSetB.size + coOccurrence;

        const phi = phiCoefficient(coOccurrence, onlyA, onlyB, neither);
        const strength = Math.abs(phi);

        if (strength < minCorrelation) {
          continue;
        }

        // Determine correlation type by analyzing timestamps
        let correlationType: PatternCorrelation["correlationType"] = "coincidental";
        let avgTimeDeltaMs: number | undefined;

        // Check for temporal ordering
        const coOccurringTraces = [...traceSetA].filter((t) => traceSetB.has(t));
        if (coOccurringTraces.length > 0) {
          // This would require more data to properly analyze temporal relationships
          // For now, mark as coincidental if patterns overlap significantly
          const jaccard = jaccardIndex(traceSetA, traceSetB);
          if (jaccard > 0.5) {
            correlationType = "temporal";
          }
        }

        correlations.push({
          patternA: patternA.signature,
          patternB: patternB.signature,
          strength,
          coOccurrenceCount: coOccurrence,
          patternACount: traceSetA.size,
          patternBCount: traceSetB.size,
          correlationType,
          avgTimeDeltaMs,
        });

        // Update pattern correlation maps
        patternA.correlations.set(patternB.signature, strength);
        patternB.correlations.set(patternA.signature, strength);
      }
    }

    return correlations.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Identify systemic issues from patterns
   */
  private identifyIssuesFromPatterns(
    patterns: Map<string, CorrelatedPattern>,
    correlations: PatternCorrelation[],
    options: {
      minOccurrences: number;
      minAffectedTraces: number;
      windowEnd: Date;
    }
  ): SystemicIssue[] {
    const issues: SystemicIssue[] = [];
    const processedPatterns = new Set<string>();

    // Sort patterns by frequency and impact
    const sortedPatterns = [...patterns.values()].sort(
      (a, b) => b.frequency - a.frequency
    );

    for (const pattern of sortedPatterns) {
      if (processedPatterns.has(pattern.signature)) {
        continue;
      }

      if (
        pattern.frequency < options.minOccurrences ||
        pattern.traceIds.length < options.minAffectedTraces
      ) {
        continue;
      }

      processedPatterns.add(pattern.signature);

      // Determine issue type
      let issueType: SystemicIssue["issueType"];
      let primaryTarget: string;

      if (pattern.toolNames.length > 0) {
        issueType = "tool_instability";
        primaryTarget = pattern.toolNames[0];
      } else if (pattern.affectedModels.length === 1) {
        issueType = "model_degradation";
        primaryTarget = pattern.affectedModels[0];
      } else if (pattern.componentTypes.length === 1) {
        issueType = "component_failure";
        primaryTarget = pattern.componentTypes[0];
      } else {
        // Check for temporal clustering
        const hourCounts = [...pattern.hourlyDistribution.values()];
        const maxHourCount = Math.max(...hourCounts);
        const avgHourCount = hourCounts.reduce((a, b) => a + b, 0) / hourCounts.length;

        if (maxHourCount > avgHourCount * 3) {
          issueType = "temporal_cluster";
          primaryTarget = pattern.componentTypes[0] || "multiple";
        } else {
          issueType = "component_failure";
          primaryTarget = pattern.componentTypes[0] || "unknown";
        }
      }

      // Find related patterns through correlations
      const relatedPatterns: string[] = [];
      for (const corr of correlations) {
        if (corr.patternA === pattern.signature && corr.strength >= 0.3) {
          relatedPatterns.push(corr.patternB);
        } else if (corr.patternB === pattern.signature && corr.strength >= 0.3) {
          relatedPatterns.push(corr.patternA);
        }
      }

      const severity = calculateSeverity(
        pattern.frequency,
        pattern.traceIds.length,
        pattern.category
      );

      const impactScore = calculateImpactScore(
        pattern.frequency,
        pattern.firstSeen,
        pattern.lastSeen,
        options.windowEnd
      );

      issues.push({
        issueId: generateIssueId(issueType, primaryTarget, pattern.category),
        title: `${severity.toUpperCase()}: ${pattern.name}`,
        description: `Detected ${pattern.frequency} occurrences of ${pattern.category} errors ` +
          `affecting ${pattern.traceIds.length} traces. ` +
          `Pattern: "${pattern.messagePattern.slice(0, 100)}${pattern.messagePattern.length > 100 ? "..." : ""}"`,
        severity,
        issueType,
        primaryTarget,
        errorCategory: pattern.category,
        errorPattern: pattern.messagePattern,
        affectedTraceCount: pattern.traceIds.length,
        affectedTraceIds: pattern.traceIds,
        totalFailures: pattern.frequency,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
        confidence: pattern.confidence,
        impactScore,
        relatedPatterns,
      });
    }

    // Check for cascading failures (high correlation between patterns)
    for (const corr of correlations) {
      if (corr.strength >= 0.7 && corr.correlationType === "temporal") {
        const patternA = patterns.get(corr.patternA);
        const patternB = patterns.get(corr.patternB);

        if (!patternA || !patternB) continue;

        const combinedTraces = [...new Set([...patternA.traceIds, ...patternB.traceIds])];

        const issue: SystemicIssue = {
          issueId: generateIssueId("cascading_failure", `${corr.patternA}-${corr.patternB}`, "unknown"),
          title: "Cascading Failure Pattern Detected",
          description: `Two failure patterns show strong correlation (${(corr.strength * 100).toFixed(1)}%). ` +
            `Pattern A: ${patternA.name}, Pattern B: ${patternB.name}. ` +
            `These failures co-occur in ${corr.coOccurrenceCount} traces.`,
          severity: "high",
          issueType: "cascading_failure",
          primaryTarget: patternA.componentTypes[0] || "multiple",
          errorCategory: patternA.category,
          errorPattern: `${patternA.messagePattern} -> ${patternB.messagePattern}`,
          affectedTraceCount: combinedTraces.length,
          affectedTraceIds: combinedTraces,
          totalFailures: patternA.frequency + patternB.frequency,
          firstSeen: new Date(Math.min(patternA.firstSeen.getTime(), patternB.firstSeen.getTime())),
          lastSeen: new Date(Math.max(patternA.lastSeen.getTime(), patternB.lastSeen.getTime())),
          confidence: corr.strength,
          impactScore: (patternA.frequency + patternB.frequency) / 20,
          relatedPatterns: [corr.patternA, corr.patternB],
        };

        issues.push(issue);
      }
    }

    return issues.sort((a, b) => b.impactScore - a.impactScore);
  }

  /**
   * Find correlated failure patterns across traces
   *
   * Queries ClickHouse for failed spans and identifies patterns that
   * co-occur across traces, indicating systemic issues.
   */
  async findCorrelatedFailures(
    options: FindCorrelatedFailuresOptions
  ): Promise<{
    patterns: CorrelatedPattern[];
    correlations: PatternCorrelation[];
    summary: string;
  }> {
    const { startDate, endDate } = resolveTimeWindow(options.timeWindow);
    const minFrequency = options.minFrequency ?? 2;
    const minCorrelation = options.minCorrelationStrength ?? 0.3;
    const maxPatterns = options.maxPatterns ?? 50;

    // Query failed spans
    const failures = await this.queryFailedSpans(
      options.projectId,
      startDate,
      endDate,
      options.components
    );

    if (failures.length === 0) {
      return {
        patterns: [],
        correlations: [],
        summary: "No failures found in the specified time window.",
      };
    }

    // Get trace counts for correlation calculation
    const { totalTraces } = await this.queryTraceCounts(
      options.projectId,
      startDate,
      endDate
    );

    // Group failures into patterns
    const patternMap = this.groupFailuresIntoPatterns(failures, minFrequency);

    // Filter by error categories if specified
    if (options.errorCategories && options.errorCategories.length > 0) {
      const categorySet = new Set(options.errorCategories);
      for (const [signature, pattern] of patternMap) {
        if (!categorySet.has(pattern.category)) {
          patternMap.delete(signature);
        }
      }
    }

    // Calculate correlations
    const correlations = this.calculatePatternCorrelations(
      patternMap,
      totalTraces,
      minCorrelation
    );

    // Convert to array and limit
    const patterns = [...patternMap.values()]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, maxPatterns);

    // Generate summary
    const summary = `Found ${patterns.length} failure patterns across ${failures.length} ` +
      `failed spans in ${totalTraces} traces. ` +
      `Detected ${correlations.length} pattern correlations. ` +
      `Time window: ${startDate.toISOString()} to ${endDate.toISOString()}.`;

    return { patterns, correlations, summary };
  }

  /**
   * Identify systemic issues affecting the system
   *
   * Analyzes failure patterns to identify recurring issues that
   * indicate systemic problems requiring attention.
   */
  async identifySystemicIssues(
    options: IdentifySystemicIssuesOptions
  ): Promise<SystemicIssue[]> {
    const { startDate, endDate } = resolveTimeWindow(options.timeWindow);
    const minOccurrences = options.minOccurrences ?? 3;
    const minAffectedTraces = options.minAffectedTraces ?? 2;

    // Get correlated failures first
    const { patterns, correlations } = await this.findCorrelatedFailures({
      projectId: options.projectId,
      timeWindow: options.timeWindow,
      minFrequency: minOccurrences,
      minCorrelationStrength: 0.2,
    });

    if (patterns.length === 0) {
      return [];
    }

    // Convert patterns array to Map for issue identification
    const patternMap = new Map<string, CorrelatedPattern>();
    for (const pattern of patterns) {
      patternMap.set(pattern.signature, pattern);
    }

    // Identify issues
    const issues = this.identifyIssuesFromPatterns(patternMap, correlations, {
      minOccurrences,
      minAffectedTraces,
      windowEnd: endDate,
    });

    // Filter by severity if specified
    if (options.severityFilter && options.severityFilter.length > 0) {
      const severitySet = new Set(options.severityFilter);
      return issues.filter((issue) => severitySet.has(issue.severity));
    }

    return issues;
  }

  /**
   * Analyze component health across the system
   *
   * Queries span data to calculate health metrics for each component,
   * including error rates, latency, and trend direction.
   */
  async analyzeComponentHealth(
    options: ComponentHealthOptions
  ): Promise<ComponentHealth[]> {
    const { startDate, endDate } = resolveTimeWindow(options.timeWindow);
    const includeTrend = options.includeTrend ?? true;

    // Query component-level aggregations
    const query = `
      SELECT
        component_type as componentType,
        count() as totalSpans,
        countIf(status = 'error') as errorCount,
        avgIf(duration_ms, status != 'error') as avgSuccessDurationMs,
        avgIf(duration_ms, status = 'error') as avgFailureDurationMs
      FROM spans
      WHERE project_id = {projectId:String}
        AND timestamp >= {startDate:DateTime64(3)}
        AND timestamp <= {endDate:DateTime64(3)}
        AND component_type IS NOT NULL
        ${options.components ? "AND component_type IN {components:Array(String)}" : ""}
      GROUP BY component_type
      ORDER BY totalSpans DESC
    `;

    interface ComponentAgg {
      componentType: string;
      totalSpans: number;
      errorCount: number;
      avgSuccessDurationMs: number;
      avgFailureDurationMs: number;
    }

    const cacheKey = `component_health:${options.projectId}:${startDate.getTime()}:${endDate.getTime()}:${options.components?.join(",") || ""}`;
    const rows = await this.executeQuery<ComponentAgg>(cacheKey, query, {
      projectId: options.projectId,
      startDate: formatDateForCH(startDate),
      endDate: formatDateForCH(endDate),
      components: options.components || [],
    });

    // Query error categories per component
    const errorQuery = `
      SELECT
        component_type as componentType,
        status_message as statusMessage,
        count() as count
      FROM spans
      WHERE project_id = {projectId:String}
        AND timestamp >= {startDate:DateTime64(3)}
        AND timestamp <= {endDate:DateTime64(3)}
        AND status = 'error'
        AND component_type IS NOT NULL
      GROUP BY component_type, status_message
      ORDER BY count DESC
    `;

    interface ErrorAgg {
      componentType: string;
      statusMessage: string;
      count: number;
    }

    const errorCacheKey = `component_errors:${options.projectId}:${startDate.getTime()}:${endDate.getTime()}`;
    const errorRows = await this.executeQuery<ErrorAgg>(errorCacheKey, errorQuery, {
      projectId: options.projectId,
      startDate: formatDateForCH(startDate),
      endDate: formatDateForCH(endDate),
    });

    // Group errors by component
    const componentErrors = new Map<string, Map<ErrorCategory, number>>();
    for (const row of errorRows) {
      if (!componentErrors.has(row.componentType)) {
        componentErrors.set(row.componentType, new Map());
      }
      const category = categorizeError(row.statusMessage);
      const categoryMap = componentErrors.get(row.componentType)!;
      categoryMap.set(category, (categoryMap.get(category) || 0) + row.count);
    }

    // Calculate trend if requested
    let trends = new Map<string, "improving" | "stable" | "degrading">();
    if (includeTrend) {
      trends = await this.calculateComponentTrends(
        options.projectId,
        startDate,
        endDate,
        options.components
      );
    }

    // Build health metrics
    return rows.map((row) => {
      const errorRate = row.totalSpans > 0 ? row.errorCount / row.totalSpans : 0;
      const categoryMap = componentErrors.get(row.componentType) || new Map();

      const topCategories = [...categoryMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));

      // Calculate health score (0-100)
      // Based on error rate and latency
      const errorPenalty = errorRate * 50;
      const baseScore = 100 - errorPenalty;
      const healthScore = Math.max(0, Math.min(100, baseScore));

      return {
        component: row.componentType as ComponentType,
        totalSpans: row.totalSpans,
        errorCount: row.errorCount,
        errorRate,
        avgSuccessDurationMs: row.avgSuccessDurationMs || 0,
        avgFailureDurationMs: row.avgFailureDurationMs || 0,
        topErrorCategories: topCategories,
        trend: trends.get(row.componentType) || "stable",
        healthScore,
      };
    });
  }

  /**
   * Calculate trend direction for components
   */
  private async calculateComponentTrends(
    projectId: string,
    startDate: Date,
    endDate: Date,
    components?: ComponentType[]
  ): Promise<Map<string, "improving" | "stable" | "degrading">> {
    // Split window into halves for trend comparison
    const midpoint = new Date((startDate.getTime() + endDate.getTime()) / 2);

    const query = `
      SELECT
        component_type as componentType,
        if(timestamp < {midpoint:DateTime64(3)}, 'first', 'second') as half,
        count() as totalSpans,
        countIf(status = 'error') as errorCount
      FROM spans
      WHERE project_id = {projectId:String}
        AND timestamp >= {startDate:DateTime64(3)}
        AND timestamp <= {endDate:DateTime64(3)}
        AND component_type IS NOT NULL
        ${components ? "AND component_type IN {components:Array(String)}" : ""}
      GROUP BY component_type, half
    `;

    interface TrendAgg {
      componentType: string;
      half: "first" | "second";
      totalSpans: number;
      errorCount: number;
    }

    const cacheKey = `component_trends:${projectId}:${startDate.getTime()}:${endDate.getTime()}:${components?.join(",") || ""}`;
    const rows = await this.executeQuery<TrendAgg>(cacheKey, query, {
      projectId,
      startDate: formatDateForCH(startDate),
      endDate: formatDateForCH(endDate),
      midpoint: formatDateForCH(midpoint),
      components: components || [],
    });

    // Group by component
    const componentData = new Map<string, { first?: TrendAgg; second?: TrendAgg }>();
    for (const row of rows) {
      if (!componentData.has(row.componentType)) {
        componentData.set(row.componentType, {});
      }
      componentData.get(row.componentType)![row.half] = row;
    }

    // Calculate trends
    const trends = new Map<string, "improving" | "stable" | "degrading">();
    for (const [component, data] of componentData) {
      const firstRate = data.first
        ? data.first.errorCount / Math.max(1, data.first.totalSpans)
        : 0;
      const secondRate = data.second
        ? data.second.errorCount / Math.max(1, data.second.totalSpans)
        : 0;

      const rateDiff = secondRate - firstRate;

      if (rateDiff < -0.05) {
        trends.set(component, "improving");
      } else if (rateDiff > 0.05) {
        trends.set(component, "degrading");
      } else {
        trends.set(component, "stable");
      }
    }

    return trends;
  }

  /**
   * Perform comprehensive time-windowed analysis
   *
   * Combines pattern detection, correlation analysis, systemic issue
   * identification, and component health into a single result.
   */
  async analyzeTimeWindow(
    projectId: string,
    timeWindow: TimeWindow
  ): Promise<TimeWindowAnalysis> {
    const { startDate, endDate } = resolveTimeWindow(timeWindow);

    // Run analyses in parallel
    const [
      { patterns, correlations },
      systemicIssues,
      componentHealth,
      traceCounts,
    ] = await Promise.all([
      this.findCorrelatedFailures({ projectId, timeWindow }),
      this.identifySystemicIssues({ projectId, timeWindow }),
      this.analyzeComponentHealth({ projectId, timeWindow }),
      this.queryTraceCounts(projectId, startDate, endDate),
    ]);

    // Count total failures
    const totalFailures = patterns.reduce((sum, p) => sum + p.frequency, 0);
    const errorRate = traceCounts.totalTraces > 0
      ? traceCounts.errorTraces / traceCounts.totalTraces
      : 0;

    return {
      windowStart: startDate,
      windowEnd: endDate,
      totalTraces: traceCounts.totalTraces,
      totalFailures,
      errorRate,
      patterns,
      systemicIssues,
      componentHealth,
      correlations,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a correlation analyzer with the given ClickHouse client
 *
 * @param client - ClickHouse client instance or factory
 * @param config - Optional ClickHouse configuration
 * @returns CorrelationAnalyzer instance
 *
 * @example
 * ```typescript
 * // Using with @clickhouse/client
 * import { createClient } from "@clickhouse/client";
 *
 * const chClient = createClient({ url: "http://localhost:8123" });
 * const analyzer = createCorrelationAnalyzer(chClient);
 *
 * // Or provide config and let the analyzer create the client
 * const analyzer = createCorrelationAnalyzer(myClient, {
 *   url: "http://localhost:8123",
 *   database: "neon",
 * });
 * ```
 */
export function createCorrelationAnalyzer(
  client: ClickHouseClientInterface,
  config?: ClickHouseConfig
): CorrelationAnalyzer {
  return new CorrelationAnalyzer(client, config);
}

// ============================================================================
// Standalone Query Functions
// ============================================================================

/**
 * Query similar failures across traces using a ClickHouse client
 *
 * This is a convenience function for one-off queries without
 * instantiating the full analyzer.
 *
 * @param client - ClickHouse client
 * @param options - Query options
 * @returns Array of failure records grouped by pattern
 * @throws {CorrelationAnalysisError} When query fails
 */
export async function querySimilarFailures(
  client: ClickHouseClientInterface,
  options: {
    projectId: string;
    errorPattern: string;
    timeWindow: TimeWindow;
    limit?: number;
    /** Query timeout in milliseconds. Default: 30000 */
    timeoutMs?: number;
  }
): Promise<FailureRecord[]> {
  const { startDate, endDate } = resolveTimeWindow(options.timeWindow);
  const normalized = normalizeErrorMessage(options.errorPattern);
  const searchPattern = normalized || options.errorPattern;

  const query = `
    SELECT
      trace_id as traceId,
      span_id as spanId,
      name as spanName,
      span_type as spanType,
      component_type as componentType,
      tool_name as toolName,
      status_message as statusMessage,
      timestamp,
      duration_ms as durationMs,
      model,
      attributes
    FROM spans
    WHERE project_id = {projectId:String}
      AND status = 'error'
      AND timestamp >= {startDate:DateTime64(3)}
      AND timestamp <= {endDate:DateTime64(3)}
      AND status_message ILIKE {pattern:String}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
  `;

  interface RawRecord {
    traceId: string;
    spanId: string;
    spanName: string;
    spanType: string;
    componentType: string | null;
    toolName: string | null;
    statusMessage: string;
    timestamp: string;
    durationMs: number;
    model: string | null;
    attributes: string | Record<string, string>;
  }

  try {
    const timeoutSeconds = Math.ceil((options.timeoutMs ?? 30000) / 1000);

    const result = await client.query<RawRecord>({
      query,
      query_params: {
        projectId: options.projectId,
        startDate: formatDateForCH(startDate),
        endDate: formatDateForCH(endDate),
        pattern: `%${searchPattern}%`,
        limit: options.limit || 100,
      },
      format: "JSONEachRow",
      clickhouse_settings: {
        max_execution_time: timeoutSeconds,
      },
    });

    const rows = await result.json();

    return rows.map((row) => {
      // Safely parse attributes
      let attributes: Record<string, string> = {};
      if (typeof row.attributes === "object" && row.attributes !== null) {
        attributes = row.attributes;
      } else if (typeof row.attributes === "string") {
        try {
          attributes = JSON.parse(row.attributes);
        } catch {
          // Ignore parse errors
        }
      }

      return {
        traceId: row.traceId,
        spanId: row.spanId,
        spanName: row.spanName,
        spanType: row.spanType as SpanType,
        componentType: row.componentType as ComponentType | null,
        toolName: row.toolName,
        statusMessage: row.statusMessage || "",
        timestamp: new Date(row.timestamp),
        durationMs: row.durationMs,
        model: row.model,
        attributes,
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
      throw new CorrelationAnalysisError(
        `Query timed out after ${options.timeoutMs ?? 30000}ms`,
        "QUERY_TIMEOUT",
        error
      );
    }

    if (errorMessage.includes("connect") || errorMessage.includes("ECONNREFUSED")) {
      throw new CorrelationAnalysisError(
        `Failed to connect to ClickHouse: ${errorMessage}`,
        "CONNECTION_ERROR",
        error
      );
    }

    throw new CorrelationAnalysisError(
      `ClickHouse query failed: ${errorMessage}`,
      "QUERY_FAILED",
      error
    );
  }
}
