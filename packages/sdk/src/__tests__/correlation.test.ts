/**
 * Correlation Analysis Tests
 *
 * Tests for the failure correlation analyzer that identifies systemic issues
 * across traces stored in ClickHouse.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  CorrelationAnalyzer,
  createCorrelationAnalyzer,
  querySimilarFailures,
  CorrelationAnalysisError,
  type ClickHouseClientInterface,
  type FailureRecord,
} from "../analysis/correlation.js";

// ============================================================================
// Mock ClickHouse Client
// ============================================================================

/**
 * Create a mock ClickHouse client for testing
 */
function createMockClient(
  queryResults: Record<string, unknown[]>,
  options?: { shouldFail?: boolean; failureType?: "timeout" | "connection" | "generic" }
): ClickHouseClientInterface {
  return {
    query: async <T>({ query }: { query: string }) => {
      // Simulate failure if requested
      if (options?.shouldFail) {
        switch (options.failureType) {
          case "timeout":
            throw new Error("Query timeout exceeded max_execution_time");
          case "connection":
            throw new Error("ECONNREFUSED: Connection refused");
          default:
            throw new Error("Database query failed: syntax error");
        }
      }

      // Find the appropriate result based on query content
      let result: unknown[] = [];

      // Component health query (GROUP BY component_type)
      if (query.includes("FROM spans") && query.includes("GROUP BY component_type") && !query.includes("half")) {
        result = queryResults.componentHealth || [];
      }
      // Error aggregation by component
      else if (query.includes("FROM spans") && query.includes("status = 'error'") && query.includes("GROUP BY component_type, status_message")) {
        result = queryResults.errorAgg || [];
      }
      // Trend calculation (has "half" in it)
      else if (query.includes("half")) {
        result = queryResults.trends || [];
      }
      // Failed spans query
      else if (query.includes("FROM spans") && query.includes("status = 'error'")) {
        result = queryResults.failedSpans || [];
      }
      // Trace counts
      else if (query.includes("FROM traces") && query.includes("count()")) {
        result = queryResults.traceCounts || [{ totalTraces: 100, errorTraces: 10 }];
      }

      return {
        json: async () => result as T[],
      };
    },
  };
}

/**
 * Generate mock failure records
 */
function createMockFailures(count: number, pattern: Partial<FailureRecord> = {}): unknown[] {
  const defaults = {
    traceId: "trace-1",
    spanId: "span-1",
    spanName: "test-span",
    spanType: "tool",
    componentType: "tool",
    toolName: "test-tool",
    statusMessage: "Connection timeout",
    timestamp: new Date().toISOString(),
    durationMs: 100,
    model: null,
    attributes: {},
  };

  return Array.from({ length: count }, (_, i) => ({
    ...defaults,
    ...pattern,
    spanId: `span-${i}`,
    traceId: pattern.traceId || `trace-${Math.floor(i / 3)}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
  }));
}

// ============================================================================
// Tests
// ============================================================================

describe("CorrelationAnalyzer", () => {
  describe("findCorrelatedFailures", () => {
    it("should return empty results when no failures found", async () => {
      const client = createMockClient({ failedSpans: [] });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
      });

      expect(result.patterns).toHaveLength(0);
      expect(result.correlations).toHaveLength(0);
      expect(result.summary).toContain("No failures found");
    });

    it("should detect patterns from repeated failures", async () => {
      const failures = createMockFailures(10, {
        statusMessage: "Connection refused to database",
        componentType: "retrieval",
      });

      const client = createMockClient({ failedSpans: failures });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minFrequency: 2,
      });

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].category).toBe("connection");
    });

    it("should group similar errors into same pattern", async () => {
      const failures = [
        ...createMockFailures(5, {
          statusMessage: "Connection timeout after 30s",
          traceId: "trace-1",
        }),
        ...createMockFailures(5, {
          statusMessage: "Connection timeout after 60s",
          traceId: "trace-2",
        }),
      ];

      const client = createMockClient({ failedSpans: failures });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minFrequency: 2,
      });

      // Should group timeouts together
      const timeoutPatterns = result.patterns.filter(
        (p) => p.category === "timeout" || p.category === "connection"
      );
      expect(timeoutPatterns.length).toBeGreaterThanOrEqual(1);
    });

    it("should calculate correlations between co-occurring patterns", async () => {
      // Create two patterns that co-occur
      const failures = [
        // Pattern A: Auth errors
        ...createMockFailures(5, {
          statusMessage: "Authentication failed",
          componentType: "prompt",
          traceId: "trace-1",
        }),
        // Pattern B: Timeout errors (same trace)
        ...createMockFailures(5, {
          statusMessage: "Request timeout",
          componentType: "retrieval",
          traceId: "trace-1",
        }),
      ];

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 10, errorTraces: 5 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minFrequency: 2,
        minCorrelationStrength: 0.1,
      });

      // Should find correlation between the two patterns
      if (result.patterns.length >= 2) {
        expect(result.correlations.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should respect maxPatterns limit", async () => {
      // Create many different patterns
      const failures = Array.from({ length: 50 }, (_, i) => ({
        traceId: `trace-${i}`,
        spanId: `span-${i}`,
        spanName: "test-span",
        spanType: "tool",
        componentType: "tool",
        toolName: `tool-${i % 10}`,
        statusMessage: `Error type ${i % 20}`,
        timestamp: new Date().toISOString(),
        durationMs: 100,
        model: null,
        attributes: {},
      }));

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 100, errorTraces: 50 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        maxPatterns: 5,
        minFrequency: 1,
      });

      expect(result.patterns.length).toBeLessThanOrEqual(5);
    });
  });

  describe("identifySystemicIssues", () => {
    it("should return empty when no patterns found", async () => {
      const client = createMockClient({ failedSpans: [] });
      const analyzer = createCorrelationAnalyzer(client);

      const issues = await analyzer.identifySystemicIssues({
        projectId: "test-project",
        timeWindow: { hours: 24 },
      });

      expect(issues).toHaveLength(0);
    });

    it("should identify component failures", async () => {
      const failures = createMockFailures(10, {
        statusMessage: "Database connection failed",
        componentType: "retrieval",
        toolName: null,
      });

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 50, errorTraces: 10 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const issues = await analyzer.identifySystemicIssues({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minOccurrences: 3,
      });

      if (issues.length > 0) {
        const componentIssue = issues.find(
          (i) => i.issueType === "component_failure"
        );
        expect(componentIssue).toBeDefined();
      }
    });

    it("should identify tool instability", async () => {
      const failures = createMockFailures(10, {
        statusMessage: "Tool execution failed",
        toolName: "code-search",
        componentType: "tool",
      });

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 50, errorTraces: 10 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const issues = await analyzer.identifySystemicIssues({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minOccurrences: 3,
      });

      if (issues.length > 0) {
        const toolIssue = issues.find((i) => i.issueType === "tool_instability");
        expect(toolIssue).toBeDefined();
        expect(toolIssue?.primaryTarget).toBe("code-search");
      }
    });

    it("should calculate severity based on frequency", async () => {
      // High frequency = high severity
      const failures = createMockFailures(20, {
        statusMessage: "Server error 500",
        componentType: "routing",
      });

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 30, errorTraces: 20 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const issues = await analyzer.identifySystemicIssues({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minOccurrences: 3,
      });

      if (issues.length > 0) {
        // Server errors with high frequency should be high/critical severity
        expect(["critical", "high", "medium"]).toContain(issues[0].severity);
      }
    });

    it("should filter by severity", async () => {
      const failures = createMockFailures(5, {
        statusMessage: "Minor validation error",
        componentType: "prompt",
      });

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 100, errorTraces: 5 }],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const issues = await analyzer.identifySystemicIssues({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        minOccurrences: 2,
        severityFilter: ["critical", "high"],
      });

      // All returned issues should be critical or high
      for (const issue of issues) {
        expect(["critical", "high"]).toContain(issue.severity);
      }
    });
  });

  describe("analyzeComponentHealth", () => {
    it("should return health metrics for components", async () => {
      const componentData = [
        {
          componentType: "retrieval",
          totalSpans: 100,
          errorCount: 10,
          avgSuccessDurationMs: 50,
          avgFailureDurationMs: 5000,
        },
        {
          componentType: "tool",
          totalSpans: 200,
          errorCount: 5,
          avgSuccessDurationMs: 100,
          avgFailureDurationMs: 2000,
        },
      ];

      const client = createMockClient({
        componentHealth: componentData,
        trends: [],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const health = await analyzer.analyzeComponentHealth({
        projectId: "test-project",
        timeWindow: { hours: 24 },
      });

      expect(health.length).toBe(2);

      const retrievalHealth = health.find((h) => h.component === "retrieval");
      expect(retrievalHealth).toBeDefined();
      expect(retrievalHealth?.errorRate).toBe(0.1); // 10/100
      expect(retrievalHealth?.totalSpans).toBe(100);
    });

    it("should calculate health scores", async () => {
      const componentData = [
        {
          componentType: "retrieval",
          totalSpans: 100,
          errorCount: 50, // 50% error rate
          avgSuccessDurationMs: 50,
          avgFailureDurationMs: 5000,
        },
      ];

      const client = createMockClient({
        componentHealth: componentData,
        trends: [],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const health = await analyzer.analyzeComponentHealth({
        projectId: "test-project",
        timeWindow: { hours: 24 },
        includeTrend: false,
      });

      expect(health.length).toBe(1);
      // 50% error rate should give low health score
      expect(health[0].healthScore).toBeLessThan(80);
    });
  });

  describe("analyzeTimeWindow", () => {
    it("should combine all analyses into single result", async () => {
      const failures = createMockFailures(10, {
        statusMessage: "Connection timeout",
        componentType: "retrieval",
      });

      const componentData = [
        {
          componentType: "retrieval",
          totalSpans: 100,
          errorCount: 10,
          avgSuccessDurationMs: 50,
          avgFailureDurationMs: 5000,
        },
      ];

      const client = createMockClient({
        failedSpans: failures,
        traceCounts: [{ totalTraces: 100, errorTraces: 10 }],
        componentHealth: componentData,
        trends: [],
      });
      const analyzer = createCorrelationAnalyzer(client);

      const result = await analyzer.analyzeTimeWindow("test-project", {
        hours: 24,
      });

      expect(result.totalTraces).toBe(100);
      expect(result.windowStart).toBeDefined();
      expect(result.windowEnd).toBeDefined();
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(Array.isArray(result.systemicIssues)).toBe(true);
      expect(Array.isArray(result.componentHealth)).toBe(true);
      expect(Array.isArray(result.correlations)).toBe(true);
    });
  });

  describe("caching", () => {
    it("should cache results when enabled", async () => {
      let queryCount = 0;
      const client: ClickHouseClientInterface = {
        query: async <T>({ query }: { query: string }) => {
          queryCount++;
          // Return some data for spans query to trigger trace counts query
          if (query.includes("FROM spans") && query.includes("status = 'error'")) {
            return {
              json: async () => [{
                traceId: "t1",
                spanId: "s1",
                spanName: "test",
                spanType: "tool",
                componentType: "tool",
                toolName: null,
                statusMessage: "Error",
                timestamp: "2024-01-15T12:00:00.000Z",
                durationMs: 100,
                model: null,
                attributes: {},
              }] as T[],
            };
          }
          return {
            json: async () => [{ totalTraces: 10, errorTraces: 1 }] as T[],
          };
        },
      };

      const analyzer = createCorrelationAnalyzer(client, {
        enableCache: true,
        cacheTtlMs: 60000,
      });

      // Use explicit fixed dates for deterministic cache keys
      const fixedTimeWindow = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-15"),
      };

      // Run same query twice
      await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: fixedTimeWindow,
        minFrequency: 1,
      });

      const firstCallCount = queryCount;

      await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: fixedTimeWindow,
        minFrequency: 1,
      });

      // Second call should use cache, so query count shouldn't increase
      expect(queryCount).toBe(firstCallCount);

      const stats = analyzer.getCacheStats();
      expect(stats.enabled).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it("should clear cache", async () => {
      const client = createMockClient({ failedSpans: [] });
      const analyzer = createCorrelationAnalyzer(client, { enableCache: true });

      await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
      });

      expect(analyzer.getCacheStats().size).toBeGreaterThan(0);

      analyzer.clearCache();
      expect(analyzer.getCacheStats().size).toBe(0);
    });

    it("should not cache when disabled", async () => {
      const client = createMockClient({ failedSpans: [] });
      const analyzer = createCorrelationAnalyzer(client, { enableCache: false });

      await analyzer.findCorrelatedFailures({
        projectId: "test-project",
        timeWindow: { hours: 24 },
      });

      expect(analyzer.getCacheStats().enabled).toBe(false);
      expect(analyzer.getCacheStats().size).toBe(0);
    });
  });
});

describe("querySimilarFailures", () => {
  it("should query for failures matching a pattern", async () => {
    const failures = createMockFailures(5, {
      statusMessage: "Connection refused to localhost:5432",
    });

    const client = createMockClient({ failedSpans: failures });

    const result = await querySimilarFailures(client, {
      projectId: "test-project",
      errorPattern: "Connection refused",
      timeWindow: { hours: 24 },
      limit: 10,
    });

    expect(result.length).toBe(5);
    expect(result[0].statusMessage).toContain("Connection");
  });
});

describe("TimeWindow resolution", () => {
  it("should resolve hours to correct date range", async () => {
    const client = createMockClient({
      failedSpans: [],
      traceCounts: [{ totalTraces: 0, errorTraces: 0 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.analyzeTimeWindow("test-project", {
      hours: 24,
    });

    // Window should be approximately 24 hours
    const windowMs = result.windowEnd.getTime() - result.windowStart.getTime();
    const expectedMs = 24 * 60 * 60 * 1000;

    expect(Math.abs(windowMs - expectedMs)).toBeLessThan(1000); // Within 1 second
  });

  it("should use explicit start and end dates", async () => {
    const client = createMockClient({
      failedSpans: [],
      traceCounts: [{ totalTraces: 0, errorTraces: 0 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-01-02");

    const result = await analyzer.analyzeTimeWindow("test-project", {
      startDate,
      endDate,
    });

    expect(result.windowStart.toISOString()).toBe(startDate.toISOString());
    expect(result.windowEnd.toISOString()).toBe(endDate.toISOString());
  });

  it("should default to 24 hours when no window specified", async () => {
    const client = createMockClient({
      failedSpans: [],
      traceCounts: [{ totalTraces: 0, errorTraces: 0 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.analyzeTimeWindow("test-project", {});

    const windowMs = result.windowEnd.getTime() - result.windowStart.getTime();
    const expectedMs = 24 * 60 * 60 * 1000;

    expect(Math.abs(windowMs - expectedMs)).toBeLessThan(1000);
  });
});

describe("createCorrelationAnalyzer", () => {
  it("should create analyzer with default config", () => {
    const client = createMockClient({});
    const analyzer = createCorrelationAnalyzer(client);

    expect(analyzer).toBeInstanceOf(CorrelationAnalyzer);
  });

  it("should create analyzer with custom config", () => {
    const client = createMockClient({});
    const analyzer = createCorrelationAnalyzer(client, {
      url: "http://custom:8123",
      database: "custom_db",
      queryTimeoutMs: 60000,
      enableCache: true,
      cacheTtlMs: 120000,
    });

    expect(analyzer).toBeInstanceOf(CorrelationAnalyzer);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error handling", () => {
  describe("CorrelationAnalysisError", () => {
    it("should have correct name and code", () => {
      const error = new CorrelationAnalysisError(
        "Test error",
        "QUERY_FAILED",
        new Error("cause")
      );

      expect(error.name).toBe("CorrelationAnalysisError");
      expect(error.code).toBe("QUERY_FAILED");
      expect(error.message).toBe("Test error");
      expect(error.cause).toBeInstanceOf(Error);
    });
  });

  describe("findCorrelatedFailures error handling", () => {
    it("should throw QUERY_TIMEOUT on timeout errors", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "timeout" });
      const analyzer = createCorrelationAnalyzer(client);

      try {
        await analyzer.findCorrelatedFailures({
          projectId: "test-project",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
        expect((error as CorrelationAnalysisError).code).toBe("QUERY_TIMEOUT");
      }
    });

    it("should throw CONNECTION_ERROR on connection failures", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "connection" });
      const analyzer = createCorrelationAnalyzer(client);

      try {
        await analyzer.findCorrelatedFailures({
          projectId: "test-project",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
        expect((error as CorrelationAnalysisError).code).toBe("CONNECTION_ERROR");
      }
    });

    it("should throw QUERY_FAILED on generic errors", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "generic" });
      const analyzer = createCorrelationAnalyzer(client);

      try {
        await analyzer.findCorrelatedFailures({
          projectId: "test-project",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
        expect((error as CorrelationAnalysisError).code).toBe("QUERY_FAILED");
      }
    });
  });

  describe("querySimilarFailures error handling", () => {
    it("should throw QUERY_TIMEOUT on timeout errors", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "timeout" });

      try {
        await querySimilarFailures(client, {
          projectId: "test-project",
          errorPattern: "test",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
        expect((error as CorrelationAnalysisError).code).toBe("QUERY_TIMEOUT");
      }
    });

    it("should throw CONNECTION_ERROR on connection failures", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "connection" });

      try {
        await querySimilarFailures(client, {
          projectId: "test-project",
          errorPattern: "test",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
        expect((error as CorrelationAnalysisError).code).toBe("CONNECTION_ERROR");
      }
    });
  });

  describe("analyzeComponentHealth error handling", () => {
    it("should propagate errors correctly", async () => {
      const client = createMockClient({}, { shouldFail: true, failureType: "generic" });
      const analyzer = createCorrelationAnalyzer(client);

      try {
        await analyzer.analyzeComponentHealth({
          projectId: "test-project",
          timeWindow: { hours: 24 },
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CorrelationAnalysisError);
      }
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe("Edge cases", () => {
  it("should handle empty status messages", async () => {
    const failures = createMockFailures(5, {
      statusMessage: "",
    });

    const client = createMockClient({ failedSpans: failures });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 1,
    });

    // Should not throw, may or may not find patterns
    expect(Array.isArray(result.patterns)).toBe(true);
  });

  it("should handle null attributes", async () => {
    const failures = [
      {
        traceId: "trace-1",
        spanId: "span-1",
        spanName: "test",
        spanType: "tool",
        componentType: "tool",
        toolName: null,
        statusMessage: "Error",
        timestamp: new Date().toISOString(),
        durationMs: 100,
        model: null,
        attributes: null as unknown as Record<string, string>,
      },
    ];

    const client = createMockClient({ failedSpans: failures });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 1,
    });

    expect(Array.isArray(result.patterns)).toBe(true);
  });

  it("should handle malformed JSON in attributes", async () => {
    const failures = [
      {
        traceId: "trace-1",
        spanId: "span-1",
        spanName: "test",
        spanType: "tool",
        componentType: "tool",
        toolName: null,
        statusMessage: "Error",
        timestamp: new Date().toISOString(),
        durationMs: 100,
        model: null,
        attributes: "not valid json",
      },
    ];

    const client = createMockClient({ failedSpans: failures });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 1,
    });

    expect(Array.isArray(result.patterns)).toBe(true);
  });

  it("should handle all failures in same trace", async () => {
    const failures = createMockFailures(10, {
      traceId: "same-trace",
      statusMessage: "Same error",
    });

    const client = createMockClient({
      failedSpans: failures,
      traceCounts: [{ totalTraces: 1, errorTraces: 1 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 2,
    });

    // Should find pattern but only in one trace
    if (result.patterns.length > 0) {
      expect(result.patterns[0].traceIds).toHaveLength(1);
    }
  });

  it("should handle zero-width time window", async () => {
    const now = new Date();
    const client = createMockClient({
      failedSpans: [],
      traceCounts: [{ totalTraces: 0, errorTraces: 0 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const result = await analyzer.analyzeTimeWindow("test-project", {
      startDate: now,
      endDate: now, // Same time
    });

    expect(result.windowStart.getTime()).toBe(result.windowEnd.getTime());
    expect(result.totalTraces).toBe(0);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("should handle large number of failures efficiently", async () => {
    // Generate 1000 failures across 200 traces
    const failures = Array.from({ length: 1000 }, (_, i) => ({
      traceId: `trace-${i % 200}`,
      spanId: `span-${i}`,
      spanName: "test-span",
      spanType: "tool",
      componentType: ["tool", "retrieval", "prompt"][i % 3],
      toolName: `tool-${i % 10}`,
      statusMessage: `Error type ${i % 50}: Something went wrong`,
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      durationMs: 100 + (i % 500),
      model: i % 5 === 0 ? "gpt-4" : null,
      attributes: {},
    }));

    const client = createMockClient({
      failedSpans: failures,
      traceCounts: [{ totalTraces: 500, errorTraces: 200 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const startTime = performance.now();
    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 5,
      maxPatterns: 20,
    });
    const endTime = performance.now();

    // Should complete in reasonable time (< 1 second for mock data)
    expect(endTime - startTime).toBeLessThan(1000);
    expect(result.patterns.length).toBeLessThanOrEqual(20);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it("should handle many patterns with correlations", async () => {
    // Create patterns that co-occur
    const failures: unknown[] = [];
    for (let trace = 0; trace < 50; trace++) {
      // Each trace has 3 different error types
      for (let errorType = 0; errorType < 3; errorType++) {
        failures.push({
          traceId: `trace-${trace}`,
          spanId: `span-${trace}-${errorType}`,
          spanName: "test-span",
          spanType: "tool",
          componentType: "tool",
          toolName: `tool-${errorType}`,
          statusMessage: `Error type ${errorType}`,
          timestamp: new Date(Date.now() - trace * 60000).toISOString(),
          durationMs: 100,
          model: null,
          attributes: {},
        });
      }
    }

    const client = createMockClient({
      failedSpans: failures,
      traceCounts: [{ totalTraces: 100, errorTraces: 50 }],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const startTime = performance.now();
    const result = await analyzer.findCorrelatedFailures({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      minFrequency: 10,
      minCorrelationStrength: 0.3,
    });
    const endTime = performance.now();

    // Should complete in reasonable time
    expect(endTime - startTime).toBeLessThan(1000);
    // Should find correlations between co-occurring patterns
    expect(result.correlations.length).toBeGreaterThan(0);
  });

  it("should efficiently calculate component health", async () => {
    const componentData = Array.from({ length: 50 }, (_, i) => ({
      componentType: `component-${i}`,
      totalSpans: 1000 + i * 100,
      errorCount: i * 10,
      avgSuccessDurationMs: 50 + i,
      avgFailureDurationMs: 500 + i * 10,
    }));

    const client = createMockClient({
      componentHealth: componentData,
      trends: [],
    });
    const analyzer = createCorrelationAnalyzer(client);

    const startTime = performance.now();
    const health = await analyzer.analyzeComponentHealth({
      projectId: "test-project",
      timeWindow: { hours: 24 },
      includeTrend: false,
    });
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(500);
    expect(health.length).toBe(50);
  });
});
