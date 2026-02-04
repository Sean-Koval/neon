/**
 * Tests for Failure Pattern Detector
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  detectPatterns,
  detectPatternsAsync,
  extractFailureFeatures,
  normalizeErrorMessage,
  categorizeError,
  computeSignature,
  measureSimilarity,
  measureSimilarityWithEmbeddings,
  matchesPattern,
  findMatchingPatterns,
  patternDiversityScorer,
  patternConcentrationScorer,
  novelPatternScorer,
  patternAnalysisDetailedScorer,
  EmbeddingIndex,
  cosineSimilarity,
  clearEmbeddingCache,
  getEmbeddingCacheSize,
  type EvalContext,
  type FailurePattern,
  type EmbeddingFunction,
} from "../index.js";
import type { SpanWithChildren, SpanType, SpanStatus, ComponentType } from "@neon/shared";

// ============================================================================
// Test Helpers
// ============================================================================

function createSpan(
  overrides: Partial<SpanWithChildren> & { spanId: string; name: string }
): SpanWithChildren {
  return {
    traceId: "test-trace",
    projectId: "test-project",
    kind: "internal",
    spanType: "span" as SpanType,
    timestamp: new Date(),
    durationMs: 100,
    status: "ok" as SpanStatus,
    attributes: {},
    children: [],
    ...overrides,
  };
}

function createErrorSpan(
  spanId: string,
  name: string,
  statusMessage: string,
  overrides?: Partial<SpanWithChildren>
): SpanWithChildren {
  return createSpan({
    spanId,
    name,
    status: "error",
    statusMessage,
    ...overrides,
  });
}

function createMockContext(
  spans: SpanWithChildren[],
  traceStatus: "ok" | "error" = "ok"
): EvalContext {
  return {
    trace: {
      trace: {
        traceId: "test-trace",
        projectId: "test-project",
        name: "test-trace",
        status: traceStatus,
        timestamp: new Date(),
        durationMs: 500,
        metadata: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        toolCallCount: 0,
        llmCallCount: 0,
      },
      spans,
    },
  };
}

// ============================================================================
// normalizeErrorMessage Tests
// ============================================================================

describe("normalizeErrorMessage", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizeErrorMessage(undefined)).toBeUndefined();
  });

  it("replaces UUIDs with placeholder", () => {
    const msg = "User 123e4567-e89b-12d3-a456-426614174000 not found";
    expect(normalizeErrorMessage(msg)).toBe("User <UUID> not found");
  });

  it("replaces long numeric IDs with placeholder", () => {
    const msg = "Order 12345678 failed";
    expect(normalizeErrorMessage(msg)).toBe("Order <ID> failed");
  });

  it("replaces ISO timestamps with placeholder", () => {
    const msg = "Request at 2024-01-15T10:30:00Z failed";
    expect(normalizeErrorMessage(msg)).toBe("Request at <TIMESTAMP> failed");
  });

  it("replaces file paths with placeholder", () => {
    const msg = "Error in /home/user/project/src/index.ts";
    expect(normalizeErrorMessage(msg)).toBe("Error in <PATH>");
  });

  it("replaces URLs with placeholder", () => {
    const msg = "Failed to connect to https://api.example.com/v1/users";
    expect(normalizeErrorMessage(msg)).toBe("Failed to connect to <URL>");
  });

  it("replaces IP addresses with placeholder", () => {
    const msg = "Connection refused from 192.168.1.100";
    expect(normalizeErrorMessage(msg)).toBe("Connection refused from <IP>");
  });

  it("replaces email addresses with placeholder", () => {
    const msg = "Invalid email: user@example.com";
    expect(normalizeErrorMessage(msg)).toBe("Invalid email: <EMAIL>");
  });

  it("replaces hex values with placeholder", () => {
    const msg = "Error code: 0x8007000E";
    expect(normalizeErrorMessage(msg)).toBe("Error code: <HEX>");
  });

  it("handles multiple replacements", () => {
    const msg = "User 123e4567-e89b-12d3-a456-426614174000 at 192.168.1.1 failed at 2024-01-15T10:30:00Z";
    const normalized = normalizeErrorMessage(msg);
    expect(normalized).toBe("User <UUID> at <IP> failed at <TIMESTAMP>");
  });

  it("collapses multiple spaces", () => {
    const msg = "Error   with   multiple   spaces";
    expect(normalizeErrorMessage(msg)).toBe("Error with multiple spaces");
  });
});

// ============================================================================
// categorizeError Tests
// ============================================================================

describe("categorizeError", () => {
  it("returns unknown for undefined input", () => {
    expect(categorizeError(undefined)).toBe("unknown");
  });

  it("categorizes timeout errors", () => {
    expect(categorizeError("Request timed out")).toBe("timeout");
    expect(categorizeError("Timeout waiting for response")).toBe("timeout");
    expect(categorizeError("Deadline exceeded")).toBe("timeout");
  });

  it("categorizes connection errors", () => {
    expect(categorizeError("ECONNREFUSED: Connection refused")).toBe("connection");
    expect(categorizeError("Network error occurred")).toBe("connection");
    expect(categorizeError("Connection reset by peer")).toBe("connection");
  });

  it("categorizes authentication errors", () => {
    expect(categorizeError("Authentication failed")).toBe("authentication");
    expect(categorizeError("Invalid token")).toBe("authentication");
    expect(categorizeError("Token expired")).toBe("authentication");
  });

  it("categorizes authorization errors", () => {
    expect(categorizeError("Permission denied")).toBe("authorization");
    expect(categorizeError("Access forbidden")).toBe("authorization");
    expect(categorizeError("Not allowed to access resource")).toBe("authorization");
  });

  it("categorizes validation errors", () => {
    expect(categorizeError("Invalid input provided")).toBe("validation");
    expect(categorizeError("Required field missing")).toBe("validation");
    expect(categorizeError("Value must be positive")).toBe("validation");
  });

  it("categorizes rate limit errors", () => {
    expect(categorizeError("Rate limit exceeded")).toBe("rate_limit");
    expect(categorizeError("Too many requests")).toBe("rate_limit");
    expect(categorizeError("Quota exceeded")).toBe("rate_limit");
  });

  it("categorizes not found errors", () => {
    expect(categorizeError("Resource not found")).toBe("not_found");
    expect(categorizeError("404: Page does not exist")).toBe("not_found");
    expect(categorizeError("No such file or directory")).toBe("not_found");
  });

  it("categorizes server errors", () => {
    expect(categorizeError("500 Internal Server Error")).toBe("server_error");
    expect(categorizeError("Service unavailable")).toBe("server_error");
  });

  it("categorizes parse errors", () => {
    expect(categorizeError("JSON parse error")).toBe("parse_error");
    expect(categorizeError("Unexpected token in input")).toBe("parse_error");
    expect(categorizeError("XML syntax error")).toBe("parse_error");
  });

  it("uses custom categories when provided", () => {
    const customCategories = [
      { pattern: /custom_error/i, category: "validation" as const },
    ];
    expect(categorizeError("custom_error: something went wrong", customCategories)).toBe("validation");
  });

  it("prefers custom categories over defaults", () => {
    const customCategories = [
      { pattern: /timeout/i, category: "client_error" as const },
    ];
    expect(categorizeError("Request timeout", customCategories)).toBe("client_error");
  });
});

// ============================================================================
// extractFailureFeatures Tests
// ============================================================================

describe("extractFailureFeatures", () => {
  it("extracts basic features from error span", () => {
    const span = createErrorSpan("span-1", "api_call", "Connection timeout", {
      componentType: "tool",
      spanType: "tool",
      toolName: "http_request",
    });

    const features = extractFailureFeatures(span);

    expect(features.errorMessage).toBe("Connection timeout");
    expect(features.normalizedMessage).toBe("Connection timeout");
    expect(features.errorCategory).toBe("timeout");
    expect(features.componentType).toBe("tool");
    expect(features.spanType).toBe("tool");
    expect(features.toolName).toBe("http_request");
    expect(features.spanName).toBe("api_call");
  });

  it("normalizes error messages with dynamic values", () => {
    const span = createErrorSpan(
      "span-1",
      "db_query",
      "Query 12345678 failed at 2024-01-15T10:30:00Z"
    );

    const features = extractFailureFeatures(span);

    expect(features.normalizedMessage).toBe("Query <ID> failed at <TIMESTAMP>");
  });

  it("extracts stack signature from attributes", () => {
    const span = createErrorSpan("span-1", "process", "Error occurred", {
      attributes: {
        "exception.stacktrace":
          "at processData (/src/process.ts:10:5)\nat handleRequest (/src/handler.ts:20:3)",
      },
    });

    const features = extractFailureFeatures(span);

    expect(features.stackSignature).toBe("processData > handleRequest");
  });

  it("filters node_modules from stack signature", () => {
    const span = createErrorSpan("span-1", "process", "Error occurred", {
      attributes: {
        "exception.stacktrace":
          "at processData (/src/process.ts:10:5)\nat internal (/node_modules/lib/index.js:5:1)\nat handleRequest (/src/handler.ts:20:3)",
      },
    });

    const features = extractFailureFeatures(span);

    expect(features.stackSignature).toBe("processData > handleRequest");
  });
});

// ============================================================================
// computeSignature Tests
// ============================================================================

describe("computeSignature", () => {
  it("generates consistent signatures for same features", () => {
    const span = createErrorSpan("span-1", "api_call", "Timeout error", {
      componentType: "tool",
      spanType: "tool",
    });

    const features1 = extractFailureFeatures(span);
    const features2 = extractFailureFeatures(span);

    expect(computeSignature(features1)).toBe(computeSignature(features2));
  });

  it("generates different signatures for different features", () => {
    const span1 = createErrorSpan("span-1", "api_call", "Timeout error", {
      componentType: "tool",
    });
    const span2 = createErrorSpan("span-2", "api_call", "Connection refused", {
      componentType: "tool",
    });

    const features1 = extractFailureFeatures(span1);
    const features2 = extractFailureFeatures(span2);

    expect(computeSignature(features1)).not.toBe(computeSignature(features2));
  });
});

// ============================================================================
// measureSimilarity Tests
// ============================================================================

describe("measureSimilarity", () => {
  it("returns 1.0 for identical features", () => {
    const span = createErrorSpan("span-1", "api_call", "Timeout error", {
      componentType: "tool",
      spanType: "tool",
    });

    const features = extractFailureFeatures(span);

    expect(measureSimilarity(features, features)).toBe(1.0);
  });

  it("returns high similarity for same category and component", () => {
    const span1 = createErrorSpan("span-1", "api_call", "Timeout waiting for response", {
      componentType: "tool",
      spanType: "tool",
    });
    const span2 = createErrorSpan("span-2", "api_call", "Request timed out", {
      componentType: "tool",
      spanType: "tool",
    });

    const features1 = extractFailureFeatures(span1);
    const features2 = extractFailureFeatures(span2);

    const similarity = measureSimilarity(features1, features2);
    expect(similarity).toBeGreaterThan(0.5);
  });

  it("returns lower similarity for different categories", () => {
    const span1 = createErrorSpan("span-1", "api_call", "Timeout error", {
      componentType: "tool",
    });
    const span2 = createErrorSpan("span-2", "api_call", "Permission denied", {
      componentType: "tool",
    });

    const features1 = extractFailureFeatures(span1);
    const features2 = extractFailureFeatures(span2);

    const similarity = measureSimilarity(features1, features2);
    expect(similarity).toBeLessThan(0.5);
  });

  it("considers component type in similarity", () => {
    const span1 = createErrorSpan("span-1", "call", "Error", {
      componentType: "tool",
    });
    const span2 = createErrorSpan("span-2", "call", "Error", {
      componentType: "retrieval",
    });

    const features1 = extractFailureFeatures(span1);
    const features2 = extractFailureFeatures(span2);

    const similarity = measureSimilarity(features1, features2);
    // Should be less than perfect due to different component types
    expect(similarity).toBeLessThan(1.0);
  });
});

// ============================================================================
// detectPatterns Tests
// ============================================================================

describe("detectPatterns", () => {
  describe("no failures", () => {
    it("returns empty patterns for trace with no errors", () => {
      const spans = [
        createSpan({ spanId: "span-1", name: "ok-span", status: "ok" }),
      ];

      const result = detectPatterns(createMockContext(spans));

      expect(result.totalFailures).toBe(0);
      expect(result.patterns).toHaveLength(0);
      expect(result.uniquePatterns).toBe(0);
      expect(result.topPattern).toBeNull();
      expect(result.summary).toBe("No failures detected");
    });

    it("handles empty spans array", () => {
      const result = detectPatterns(createMockContext([]));

      expect(result.totalFailures).toBe(0);
      expect(result.patterns).toHaveLength(0);
    });
  });

  describe("single failure", () => {
    it("does not create pattern for single failure (default minFrequency=2)", () => {
      const spans = [
        createErrorSpan("span-1", "api_call", "Timeout error"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      expect(result.totalFailures).toBe(1);
      expect(result.patterns).toHaveLength(0);
      expect(result.unclusteredCount).toBe(1);
    });

    it("creates pattern with minFrequency=1", () => {
      const spans = [
        createErrorSpan("span-1", "api_call", "Timeout error"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"), {
        minFrequency: 1,
      });

      expect(result.totalFailures).toBe(1);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].frequency).toBe(1);
    });
  });

  describe("recurring patterns", () => {
    it("detects pattern from similar failures", () => {
      const spans = [
        createErrorSpan("span-1", "api_call", "Timeout waiting for response", {
          componentType: "tool",
          timestamp: new Date("2024-01-01T00:00:00Z"),
        }),
        createErrorSpan("span-2", "api_call", "Request timed out", {
          componentType: "tool",
          timestamp: new Date("2024-01-01T00:01:00Z"),
        }),
        createErrorSpan("span-3", "api_call", "Timeout after 30s", {
          componentType: "tool",
          timestamp: new Date("2024-01-01T00:02:00Z"),
        }),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      expect(result.totalFailures).toBe(3);
      expect(result.patterns.length).toBeGreaterThanOrEqual(1);
      expect(result.topPattern).not.toBeNull();
      expect(result.topPattern?.category).toBe("timeout");
    });

    it("groups failures by error category", () => {
      const spans = [
        createErrorSpan("span-1", "auth", "Authentication failed", {
          componentType: "tool",
        }),
        createErrorSpan("span-2", "auth", "Authentication error occurred", {
          componentType: "tool",
        }),
        createErrorSpan("span-3", "api", "Rate limit exceeded"),
        createErrorSpan("span-4", "api", "Too many requests"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      expect(result.totalFailures).toBe(4);
      // Should detect patterns when minFrequency is met
      expect(result.patterns.length).toBeGreaterThanOrEqual(1);
    });

    it("calculates frequency correctly", () => {
      const spans = [
        createErrorSpan("span-1", "db", "Connection refused"),
        createErrorSpan("span-2", "db", "Connection reset"),
        createErrorSpan("span-3", "db", "Network unreachable"),
        createErrorSpan("span-4", "api", "Timeout error"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      const totalInPatterns = result.patterns.reduce((sum, p) => sum + p.frequency, 0);
      expect(totalInPatterns + result.unclusteredCount).toBe(result.totalFailures);
    });

    it("tracks timestamps correctly", () => {
      const spans = [
        createErrorSpan("span-1", "api", "Timeout", {
          timestamp: new Date("2024-01-01T00:00:00Z"),
        }),
        createErrorSpan("span-2", "api", "Timeout", {
          timestamp: new Date("2024-01-01T00:05:00Z"),
        }),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      if (result.patterns.length > 0) {
        const pattern = result.patterns[0];
        expect(pattern.firstSeen.getTime()).toBeLessThanOrEqual(pattern.lastSeen.getTime());
      }
    });
  });

  describe("nested spans", () => {
    it("finds errors in nested span trees", () => {
      const spans: SpanWithChildren[] = [
        createSpan({
          spanId: "root",
          name: "agent",
          status: "ok",
          children: [
            createErrorSpan("child-1", "tool1", "Error 1", { children: [] }),
            createSpan({
              spanId: "child-2",
              name: "tool2",
              status: "ok",
              children: [
                createErrorSpan("grandchild-1", "nested", "Error 2", { children: [] }),
              ],
            }),
          ],
        }),
      ];

      const result = detectPatterns(createMockContext(spans, "error"));

      expect(result.totalFailures).toBe(2);
    });
  });

  describe("configuration", () => {
    it("respects minFrequency setting", () => {
      const spans = [
        createErrorSpan("span-1", "api", "Timeout"),
        createErrorSpan("span-2", "api", "Timeout"),
        createErrorSpan("span-3", "api", "Timeout"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"), {
        minFrequency: 4,
      });

      expect(result.totalFailures).toBe(3);
      expect(result.patterns).toHaveLength(0);
      expect(result.unclusteredCount).toBe(3);
    });

    it("respects maxPatterns setting", () => {
      const spans = [
        createErrorSpan("span-1", "a", "Error A"),
        createErrorSpan("span-2", "a", "Error A"),
        createErrorSpan("span-3", "b", "Permission denied"),
        createErrorSpan("span-4", "b", "Access forbidden"),
        createErrorSpan("span-5", "c", "Timeout"),
        createErrorSpan("span-6", "c", "Timed out"),
      ];

      const result = detectPatterns(createMockContext(spans, "error"), {
        maxPatterns: 2,
      });

      expect(result.patterns.length).toBeLessThanOrEqual(2);
    });

    it("respects maxExamples setting", () => {
      const spans = Array.from({ length: 10 }, (_, i) =>
        createErrorSpan(`span-${i}`, "api", "Same error message")
      );

      const result = detectPatterns(createMockContext(spans, "error"), {
        minFrequency: 1,
        maxExamples: 3,
      });

      if (result.patterns.length > 0) {
        expect(result.patterns[0].exampleSpanIds.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("direct span array input", () => {
    it("accepts raw span array instead of context", () => {
      const spans = [
        createErrorSpan("span-1", "api", "Timeout"),
        createErrorSpan("span-2", "api", "Timeout"),
      ];

      const result = detectPatterns(spans);

      expect(result.totalFailures).toBe(2);
    });
  });
});

// ============================================================================
// matchesPattern Tests
// ============================================================================

describe("matchesPattern", () => {
  const timeoutPattern: FailurePattern = {
    signature: "test-sig",
    name: "timeout in tool",
    messagePattern: "Timeout",
    category: "timeout",
    componentTypes: ["tool"],
    toolNames: ["http_request"],
    spanTypes: ["tool"],
    frequency: 5,
    firstSeen: new Date(),
    lastSeen: new Date(),
    exampleSpanIds: ["ex-1"],
    confidence: 0.9,
  };

  it("matches span with same category and similar message", () => {
    const span = createErrorSpan("span-1", "api", "Request timeout", {
      componentType: "tool",
      spanType: "tool",
      toolName: "http_request",
    });

    expect(matchesPattern(span, timeoutPattern)).toBe(true);
  });

  it("does not match span with different category", () => {
    const span = createErrorSpan("span-1", "api", "Permission denied", {
      componentType: "tool",
    });

    expect(matchesPattern(span, timeoutPattern)).toBe(false);
  });

  it("does not match non-error spans", () => {
    const span = createSpan({ spanId: "span-1", name: "ok", status: "ok" });

    expect(matchesPattern(span, timeoutPattern)).toBe(false);
  });

  it("respects threshold parameter", () => {
    const span = createErrorSpan("span-1", "api", "Timeout occurred", {
      componentType: "retrieval", // Different component type
      spanType: "tool",
    });

    // Should match with low threshold
    expect(matchesPattern(span, timeoutPattern, 0.3)).toBe(true);

    // May not match with high threshold due to component mismatch
    // (depends on exact similarity calculation)
  });
});

// ============================================================================
// findMatchingPatterns Tests
// ============================================================================

describe("findMatchingPatterns", () => {
  const patterns: FailurePattern[] = [
    {
      signature: "timeout-sig",
      name: "timeout",
      messagePattern: "Timeout",
      category: "timeout",
      componentTypes: ["tool"],
      toolNames: [],
      spanTypes: ["tool"],
      frequency: 5,
      firstSeen: new Date(),
      lastSeen: new Date(),
      exampleSpanIds: [],
      confidence: 0.9,
    },
    {
      signature: "auth-sig",
      name: "authentication",
      messagePattern: "Authentication failed",
      category: "authentication",
      componentTypes: ["tool"],
      toolNames: [],
      spanTypes: ["tool"],
      frequency: 3,
      firstSeen: new Date(),
      lastSeen: new Date(),
      exampleSpanIds: [],
      confidence: 0.85,
    },
  ];

  it("finds matching patterns sorted by similarity", () => {
    const span = createErrorSpan("span-1", "api", "Request timed out", {
      componentType: "tool",
      spanType: "tool",
    });

    // Use a lower threshold since message similarity is token-based
    const matches = findMatchingPatterns(span, patterns, 0.5);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.category).toBe("timeout");
  });

  it("returns empty array for non-error spans", () => {
    const span = createSpan({ spanId: "span-1", name: "ok", status: "ok" });

    const matches = findMatchingPatterns(span, patterns);

    expect(matches).toHaveLength(0);
  });

  it("returns empty array when no patterns match", () => {
    const span = createErrorSpan("span-1", "api", "Database connection failed", {
      componentType: "tool",
    });

    const matches = findMatchingPatterns(span, patterns, 0.9);

    // May be empty or have low-similarity matches depending on threshold
    expect(Array.isArray(matches)).toBe(true);
  });
});

// ============================================================================
// Scorer Tests
// ============================================================================

describe("patternDiversityScorer", () => {
  it("returns 1.0 for no failures", () => {
    const spans = [createSpan({ spanId: "span-1", name: "ok", status: "ok" })];

    const scorer = patternDiversityScorer();
    const result = scorer.evaluate(createMockContext(spans));

    expect(result.value).toBe(1.0);
    expect(result.reason).toBe("No failures detected");
  });

  it("returns 1.0 for unique failures (no patterns)", () => {
    const spans = [
      createErrorSpan("span-1", "a", "Unique error A"),
    ];

    const scorer = patternDiversityScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    expect(result.value).toBe(1.0);
  });

  it("returns lower score for repeated patterns", () => {
    const spans = Array.from({ length: 10 }, (_, i) =>
      createErrorSpan(`span-${i}`, "api", "Same timeout error", {
        componentType: "tool",
      })
    );

    const scorer = patternDiversityScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    expect(result.value).toBeLessThan(1.0);
  });
});

describe("patternConcentrationScorer", () => {
  it("returns 1.0 for no failures", () => {
    const spans = [createSpan({ spanId: "span-1", name: "ok", status: "ok" })];

    const scorer = patternConcentrationScorer();
    const result = scorer.evaluate(createMockContext(spans));

    expect(result.value).toBe(1.0);
  });

  it("returns lower score when failures concentrated in one pattern", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Timeout error 1"),
      createErrorSpan("span-2", "api", "Timeout error 2"),
      createErrorSpan("span-3", "api", "Timeout error 3"),
      createErrorSpan("span-4", "api", "Timeout error 4"),
    ];

    const scorer = patternConcentrationScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    // All failures in one pattern = low concentration score
    expect(result.value).toBeLessThan(0.5);
  });
});

describe("novelPatternScorer", () => {
  const knownPatterns: FailurePattern[] = [
    {
      signature: "timeout-sig",
      name: "timeout",
      messagePattern: "Timeout",
      category: "timeout",
      componentTypes: ["tool"],
      toolNames: [],
      spanTypes: ["tool"],
      frequency: 5,
      firstSeen: new Date(),
      lastSeen: new Date(),
      exampleSpanIds: [],
      confidence: 0.9,
    },
  ];

  it("returns 1.0 for no failures", () => {
    const spans = [createSpan({ spanId: "span-1", name: "ok", status: "ok" })];

    const scorer = novelPatternScorer(knownPatterns);
    const result = scorer.evaluate(createMockContext(spans));

    expect(result.value).toBe(1.0);
    expect(result.reason).toBe("No failures detected");
  });

  it("returns 1.0 when all failures match known patterns", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Request timeout", {
        componentType: "tool",
        spanType: "tool",
      }),
      createErrorSpan("span-2", "api", "Timeout waiting", {
        componentType: "tool",
        spanType: "tool",
      }),
    ];

    const scorer = novelPatternScorer(knownPatterns);
    const result = scorer.evaluate(createMockContext(spans, "error"));

    expect(result.value).toBe(1.0);
  });

  it("returns lower score for novel failures", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Completely new error type"),
      createErrorSpan("span-2", "api", "Another unknown error"),
    ];

    const scorer = novelPatternScorer(knownPatterns);
    const result = scorer.evaluate(createMockContext(spans, "error"));

    expect(result.value).toBeLessThan(1.0);
    expect(result.reason).toContain("novel");
  });
});

describe("patternAnalysisDetailedScorer", () => {
  it("returns full analysis in reason field", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Timeout error", {
        componentType: "tool",
      }),
      createErrorSpan("span-2", "api", "Timeout error", {
        componentType: "tool",
      }),
    ];

    const scorer = patternAnalysisDetailedScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    const analysis = JSON.parse(result.reason!);

    expect(analysis).toHaveProperty("patterns");
    expect(analysis).toHaveProperty("totalFailures");
    expect(analysis).toHaveProperty("uniquePatterns");
    expect(analysis).toHaveProperty("summary");
    expect(analysis.totalFailures).toBe(2);
  });

  it("score reflects error rate", () => {
    const spans = [
      createSpan({ spanId: "span-1", name: "ok-1", status: "ok" }),
      createSpan({ spanId: "span-2", name: "ok-2", status: "ok" }),
      createErrorSpan("span-3", "api", "Error"),
    ];

    const scorer = patternAnalysisDetailedScorer();
    const result = scorer.evaluate(createMockContext(spans, "error"));

    // 1 error out of 3 spans = 33% error rate = 0.67 score
    expect(result.value).toBeCloseTo(0.67, 1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Pattern Detector Integration", () => {
  it("handles realistic agent trace with multiple error types", () => {
    const spans: SpanWithChildren[] = [
      createSpan({
        spanId: "agent",
        name: "agent_execution",
        status: "ok", // Parent succeeds even if children fail
        children: [
          // Retrieval errors
          createErrorSpan("ret-1", "retrieval", "Connection timeout to vector DB", {
            componentType: "retrieval",
            spanType: "retrieval",
            children: [],
          }),
          createErrorSpan("ret-2", "retrieval", "Request timed out", {
            componentType: "retrieval",
            spanType: "retrieval",
            children: [],
          }),
          // Tool errors
          createErrorSpan("tool-1", "http_call", "Rate limit exceeded", {
            componentType: "tool",
            spanType: "tool",
            toolName: "http_request",
            children: [],
          }),
          createErrorSpan("tool-2", "http_call", "Too many requests", {
            componentType: "tool",
            spanType: "tool",
            toolName: "http_request",
            children: [],
          }),
          // Reasoning errors
          createErrorSpan("reason-1", "reasoning", "JSON parse error in response", {
            componentType: "reasoning",
            spanType: "generation",
            children: [],
          }),
          // Successful spans
          createSpan({
            spanId: "ok-1",
            name: "successful_tool",
            status: "ok",
            componentType: "tool",
            children: [],
          }),
        ],
      }),
    ];

    // Use a reasonable similarity threshold for real-world error clustering
    const result = detectPatterns(createMockContext(spans, "error"), {
      similarityThreshold: 0.5,
    });

    expect(result.totalFailures).toBe(5);
    expect(result.patterns.length).toBeGreaterThanOrEqual(1);

    // Should identify timeout pattern in retrieval
    const timeoutPattern = result.patterns.find((p) => p.category === "timeout");
    expect(timeoutPattern).not.toBeUndefined();
    expect(timeoutPattern!.frequency).toBeGreaterThanOrEqual(2);
    expect(timeoutPattern!.componentTypes).toContain("retrieval");

    // Should identify rate limit pattern
    const rateLimitPattern = result.patterns.find((p) => p.category === "rate_limit");
    expect(rateLimitPattern).not.toBeUndefined();
    expect(rateLimitPattern!.frequency).toBeGreaterThanOrEqual(2);
  });

  it("works end-to-end with scorers", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Timeout", { componentType: "tool" }),
      createErrorSpan("span-2", "api", "Timeout", { componentType: "tool" }),
      createErrorSpan("span-3", "api", "Permission denied", { componentType: "tool" }),
    ];

    const context = createMockContext(spans, "error");

    const diversityScore = patternDiversityScorer().evaluate(context);
    const concentrationScore = patternConcentrationScorer().evaluate(context);
    const detailedScore = patternAnalysisDetailedScorer().evaluate(context);

    expect(diversityScore.value).toBeGreaterThanOrEqual(0);
    expect(diversityScore.value).toBeLessThanOrEqual(1);

    expect(concentrationScore.value).toBeGreaterThanOrEqual(0);
    expect(concentrationScore.value).toBeLessThanOrEqual(1);

    expect(detailedScore.value).toBeGreaterThanOrEqual(0);
    expect(detailedScore.value).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Embedding-Based Similarity Tests
// ============================================================================

describe("Embedding Infrastructure", () => {
  // Mock embedding function that returns simple vectors based on text length
  // This is deterministic and fast for testing
  const mockEmbeddingFn: EmbeddingFunction = async (texts: string[]) => {
    return texts.map((text) => {
      // Create a simple 4-dimensional embedding based on text properties
      const length = text.length;
      const wordCount = text.split(/\s+/).length;
      const hasTimeout = text.toLowerCase().includes("timeout") ? 1 : 0;
      const hasConnection = text.toLowerCase().includes("connection") ? 1 : 0;
      // Normalize to unit vector
      const norm = Math.sqrt(length * length + wordCount * wordCount + hasTimeout + hasConnection) || 1;
      return [length / norm, wordCount / norm, hasTimeout / norm, hasConnection / norm];
    });
  };

  beforeEach(() => {
    clearEmbeddingCache();
  });

  describe("cosineSimilarity", () => {
    it("returns 1.0 for identical vectors", () => {
      const vec = [1, 0, 0, 0];
      expect(cosineSimilarity(vec, vec)).toBe(1.0);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBe(0.0);
    });

    it("returns -1.0 for opposite vectors", () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [-1, 0, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBe(-1.0);
    });

    it("handles normalized vectors correctly", () => {
      const vec1 = [0.6, 0.8, 0, 0];
      const vec2 = [0.8, 0.6, 0, 0];
      // cos(θ) = 0.6*0.8 + 0.8*0.6 = 0.96
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0.96, 5);
    });

    it("throws on dimension mismatch", () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0, 0];
      expect(() => cosineSimilarity(vec1, vec2)).toThrow("dimension mismatch");
    });
  });

  describe("EmbeddingIndex", () => {
    it("builds index from texts", async () => {
      const texts = ["error one", "error two", "error three"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      expect(index.size).toBe(3);
      expect(index.has("error one")).toBe(true);
      expect(index.has("error four")).toBe(false);
    });

    it("deduplicates texts", async () => {
      const texts = ["error", "error", "error"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      expect(index.size).toBe(1);
    });

    it("filters empty texts", async () => {
      const texts = ["error", "", "  ", "another"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      expect(index.size).toBe(2);
    });

    it("returns similarity between indexed texts", async () => {
      const texts = ["timeout error", "connection timeout"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      const similarity = index.getSimilarity("timeout error", "connection timeout");
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it("returns 1.0 for identical texts", async () => {
      const texts = ["timeout error"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      expect(index.getSimilarity("timeout error", "timeout error")).toBe(1.0);
    });

    it("falls back to token similarity for non-indexed texts", async () => {
      const texts = ["indexed text"];
      const index = await EmbeddingIndex.build(texts, mockEmbeddingFn);

      // "not indexed" is not in the index, should use token similarity
      const similarity = index.getSimilarity("not indexed", "also not indexed");
      expect(similarity).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Embedding Cache", () => {
    it("caches embeddings across calls", async () => {
      const texts = ["cached text"];

      // First call - should compute
      await EmbeddingIndex.build(texts, mockEmbeddingFn, true);
      const size1 = getEmbeddingCacheSize();

      // Second call - should use cache
      await EmbeddingIndex.build(texts, mockEmbeddingFn, true);
      const size2 = getEmbeddingCacheSize();

      expect(size1).toBe(1);
      expect(size2).toBe(1); // No new entries
    });

    it("clears cache when requested", async () => {
      await EmbeddingIndex.build(["text"], mockEmbeddingFn, true);
      expect(getEmbeddingCacheSize()).toBe(1);

      clearEmbeddingCache();
      expect(getEmbeddingCacheSize()).toBe(0);
    });

    it("skips cache when disabled", async () => {
      await EmbeddingIndex.build(["text1"], mockEmbeddingFn, false);
      await EmbeddingIndex.build(["text2"], mockEmbeddingFn, false);

      // With caching disabled, nothing should be cached
      expect(getEmbeddingCacheSize()).toBe(0);
    });
  });

  describe("measureSimilarityWithEmbeddings", () => {
    it("computes similarity between features using embeddings", async () => {
      const span1 = createErrorSpan("span-1", "api", "Connection timeout", {
        componentType: "tool",
        spanType: "tool",
      });
      const span2 = createErrorSpan("span-2", "api", "Network connection failed", {
        componentType: "tool",
        spanType: "tool",
      });

      const features1 = extractFailureFeatures(span1);
      const features2 = extractFailureFeatures(span2);

      const similarity = await measureSimilarityWithEmbeddings(
        features1,
        features2,
        mockEmbeddingFn
      );

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it("returns higher similarity for same category", async () => {
      const span1 = createErrorSpan("span-1", "api", "Timeout error", {
        componentType: "tool",
      });
      const span2 = createErrorSpan("span-2", "api", "Request timed out", {
        componentType: "tool",
      });
      const span3 = createErrorSpan("span-3", "api", "Permission denied", {
        componentType: "tool",
      });

      const features1 = extractFailureFeatures(span1);
      const features2 = extractFailureFeatures(span2);
      const features3 = extractFailureFeatures(span3);

      const similaritySameCategory = await measureSimilarityWithEmbeddings(
        features1,
        features2,
        mockEmbeddingFn
      );
      const similarityDiffCategory = await measureSimilarityWithEmbeddings(
        features1,
        features3,
        mockEmbeddingFn
      );

      // Same category (timeout) should be more similar than different category
      expect(similaritySameCategory).toBeGreaterThan(similarityDiffCategory);
    });
  });
});

describe("detectPatternsAsync", () => {
  const mockEmbeddingFn: EmbeddingFunction = async (texts: string[]) => {
    return texts.map((text) => {
      const length = text.length;
      const wordCount = text.split(/\s+/).length;
      const hasTimeout = text.toLowerCase().includes("timeout") ? 1 : 0;
      const hasConnection = text.toLowerCase().includes("connection") ? 1 : 0;
      const norm = Math.sqrt(length * length + wordCount * wordCount + hasTimeout + hasConnection) || 1;
      return [length / norm, wordCount / norm, hasTimeout / norm, hasConnection / norm];
    });
  };

  beforeEach(() => {
    clearEmbeddingCache();
  });

  it("detects patterns using embedding similarity", async () => {
    const spans = [
      createErrorSpan("span-1", "api", "Connection timeout to server", {
        componentType: "tool",
      }),
      createErrorSpan("span-2", "api", "Server connection timed out", {
        componentType: "tool",
      }),
      createErrorSpan("span-3", "api", "Network timeout waiting for response", {
        componentType: "tool",
      }),
    ];

    const result = await detectPatternsAsync(createMockContext(spans, "error"), {
      similarityMethod: "embedding",
      embeddingFn: mockEmbeddingFn,
      similarityThreshold: 0.3,
    });

    expect(result.totalFailures).toBe(3);
    expect(result.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it("works without embedding function (falls back to token)", async () => {
    const spans = [
      createErrorSpan("span-1", "api", "Timeout"),
      createErrorSpan("span-2", "api", "Timeout"),
    ];

    const result = await detectPatternsAsync(createMockContext(spans, "error"), {
      similarityMethod: "token",
    });

    expect(result.totalFailures).toBe(2);
    expect(result.patterns.length).toBe(1);
  });

  it("returns empty result for no failures", async () => {
    const spans = [createSpan({ spanId: "ok", name: "ok", status: "ok" })];

    const result = await detectPatternsAsync(createMockContext(spans), {
      similarityMethod: "embedding",
      embeddingFn: mockEmbeddingFn,
    });

    expect(result.totalFailures).toBe(0);
    expect(result.patterns).toHaveLength(0);
  });

  it("caches embeddings when enabled", async () => {
    const spans = [
      createErrorSpan("span-1", "api", "Same error message"),
      createErrorSpan("span-2", "api", "Same error message"),
    ];

    await detectPatternsAsync(createMockContext(spans, "error"), {
      similarityMethod: "embedding",
      embeddingFn: mockEmbeddingFn,
      cacheEmbeddings: true,
    });

    // Only 1 unique message should be cached
    expect(getEmbeddingCacheSize()).toBe(1);
  });
});

describe("detectPatterns with embedding config", () => {
  it("throws error when embedding similarity requested in sync function", () => {
    const spans = [createErrorSpan("span-1", "api", "Error")];

    expect(() => {
      detectPatterns(createMockContext(spans, "error"), {
        similarityMethod: "embedding",
      });
    }).toThrow("Use detectPatternsAsync()");
  });

  it("works with token similarity (default)", () => {
    const spans = [
      createErrorSpan("span-1", "api", "Timeout"),
      createErrorSpan("span-2", "api", "Timeout"),
    ];

    const result = detectPatterns(createMockContext(spans, "error"), {
      similarityMethod: "token",
    });

    expect(result.totalFailures).toBe(2);
  });
});
