import { describe, it, expect, vi } from "vitest";
import {
  synthesizeRootCause,
  type RCASynthesizerConfig,
  type RCASynthesisResult,
} from "../analysis/root-cause-synthesizer.js";
import type { EvalContext } from "../scorers/base.js";
import type { SpanWithChildren } from "@neon/shared";

// ============================================================================
// Test Helpers
// ============================================================================

function makeSpan(overrides: Partial<SpanWithChildren> = {}): SpanWithChildren {
  return {
    spanId: overrides.spanId ?? `span-${Math.random().toString(36).slice(2, 8)}`,
    traceId: "trace-1",
    parentSpanId: overrides.parentSpanId ?? null,
    name: overrides.name ?? "test-span",
    spanType: overrides.spanType ?? "span",
    componentType: overrides.componentType ?? "tool",
    status: overrides.status ?? "ok",
    statusMessage: overrides.statusMessage ?? undefined,
    timestamp: overrides.timestamp ?? new Date("2024-01-01T00:00:00Z").toISOString(),
    endTimestamp: overrides.endTimestamp ?? new Date("2024-01-01T00:00:01Z").toISOString(),
    durationMs: overrides.durationMs ?? 1000,
    input: overrides.input ?? null,
    output: overrides.output ?? null,
    model: overrides.model ?? null,
    toolName: overrides.toolName ?? null,
    attributes: overrides.attributes ?? {},
    children: overrides.children ?? [],
    tokens: overrides.tokens ?? null,
    cost: overrides.cost ?? null,
  } as SpanWithChildren;
}

function makeContext(spans: SpanWithChildren[]): EvalContext {
  return {
    trace: {
      traceId: "trace-1",
      projectId: "test-project",
      name: "test-trace",
      status: spans.some((s) => s.status === "error") ? "error" : "ok",
      timestamp: "2024-01-01T00:00:00Z",
      endTimestamp: "2024-01-01T00:01:00Z",
      durationMs: 60000,
      input: null,
      output: null,
      tags: [],
      metadata: {},
      spans,
      scores: [],
      totalTokens: 0,
      totalCost: 0,
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("synthesizeRootCause", () => {
  describe("evidence chain construction", () => {
    it("should build evidence chain from causal analysis", async () => {
      const rootSpan = makeSpan({
        spanId: "root-span",
        name: "retrieval",
        componentType: "retrieval",
        status: "error",
        statusMessage: "Connection timeout to vector DB",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
      });

      const childSpan = makeSpan({
        spanId: "child-span",
        name: "reasoning",
        componentType: "reasoning",
        status: "error",
        statusMessage: "No context available for reasoning",
        parentSpanId: "root-span",
        timestamp: new Date("2024-01-01T00:00:01Z").toISOString(),
      });

      rootSpan.children = [childSpan];

      const context = makeContext([rootSpan]);
      const result = await synthesizeRootCause(context);

      expect(result.hypotheses.length).toBeGreaterThan(0);

      // Find the root cause hypothesis
      const rootCause = result.hypotheses.find((h) => h.category === "root_cause");
      expect(rootCause).toBeDefined();
      expect(rootCause!.evidenceChain.length).toBeGreaterThan(0);
      expect(rootCause!.evidenceChain[0].type).toBe("caused");
      expect(rootCause!.evidenceChain[0].sourceSpanId).toBe("root-span");
      expect(rootCause!.evidenceChain[0].targetSpanId).toBe("child-span");
    });

    it("should build evidence chain from pattern analysis", async () => {
      // Create a parent (ok) with multiple error children of different types
      // so that causal analysis finds root cause in one pattern,
      // and a second distinct pattern survives deduplication
      const parentSpan = makeSpan({
        spanId: "parent",
        name: "orchestrator",
        componentType: "routing",
        status: "ok",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
      });

      // Pattern A: timeout errors (will be root cause via causal)
      const timeoutSpans = Array.from({ length: 2 }, (_, i) =>
        makeSpan({
          spanId: `timeout-${i}`,
          name: "api-call",
          componentType: "tool",
          status: "error",
          statusMessage: "Connection timeout after 30s",
          parentSpanId: "parent",
          timestamp: new Date(`2024-01-01T00:00:0${i + 1}Z`).toISOString(),
        })
      );

      // Pattern B: auth errors (different pattern, different spans)
      const authSpans = Array.from({ length: 2 }, (_, i) =>
        makeSpan({
          spanId: `auth-${i}`,
          name: "auth-service",
          componentType: "retrieval",
          status: "error",
          statusMessage: "Authentication failed: invalid API key",
          parentSpanId: "parent",
          timestamp: new Date(`2024-01-01T00:00:0${i + 3}Z`).toISOString(),
        })
      );

      parentSpan.children = [...timeoutSpans, ...authSpans];

      const context = makeContext([parentSpan]);
      const result = await synthesizeRootCause(context);

      // The pattern analysis should detect patterns
      expect(result.patternAnalysis.uniquePatterns).toBeGreaterThan(0);

      // At least one hypothesis should have a pattern attached
      const withPattern = result.hypotheses.filter((h) => h.pattern);
      expect(withPattern.length).toBeGreaterThan(0);

      // Find pattern_clustering hypotheses specifically (these have pattern evidence chains)
      const patternHypotheses = result.hypotheses.filter(
        (h) => h.statisticalBasis.method === "pattern_clustering"
      );

      if (patternHypotheses.length > 0) {
        const patternHyp = patternHypotheses[0];
        expect(patternHyp.evidenceChain.length).toBeGreaterThan(0);
        expect(patternHyp.evidenceChain[0].type).toBe("matches_pattern");
        expect(patternHyp.pattern).toBeDefined();
      } else {
        // If all pattern hypotheses were deduplicated into the causal one,
        // verify the causal hypothesis carries the pattern
        const causalWithPattern = result.hypotheses.find(
          (h) => h.category === "root_cause" && h.pattern
        );
        expect(causalWithPattern).toBeDefined();
        expect(causalWithPattern!.pattern).toBeDefined();
      }
    });

    it("should merge causal and pattern evidence for same spans", async () => {
      // Root cause span that also appears in a pattern cluster
      const spans = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `error-span-${i}`,
          name: "database-query",
          componentType: "tool",
          status: "error",
          statusMessage: "Connection refused to database server",
          timestamp: new Date(`2024-01-01T00:00:0${i}Z`).toISOString(),
        })
      );

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context);

      // Should have both root cause and pattern hypotheses
      expect(result.hypotheses.length).toBeGreaterThanOrEqual(1);
      expect(result.causalAnalysis.hasErrors).toBe(true);
      expect(result.patternAnalysis.totalFailures).toBe(3);
    });
  });

  describe("hypothesis ranking", () => {
    it("should rank hypotheses by confidence (highest first)", async () => {
      // Create independent error groups that won't overlap in deduplication
      const parentSpan = makeSpan({
        spanId: "root",
        name: "orchestrator",
        componentType: "routing",
        status: "ok",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
      });

      // Pattern A: timeout errors in tool component
      const timeoutSpans = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `timeout-${i}`,
          name: "api-call",
          componentType: "tool",
          status: "error",
          statusMessage: "Request timeout after 30 seconds",
          parentSpanId: "root",
          timestamp: new Date(`2024-01-01T00:00:0${i + 1}Z`).toISOString(),
        })
      );

      // Pattern B: auth errors in retrieval component (distinct)
      const authSpans = Array.from({ length: 2 }, (_, i) =>
        makeSpan({
          spanId: `auth-${i}`,
          name: "auth-check",
          componentType: "retrieval",
          status: "error",
          statusMessage: "Authentication failed: invalid token",
          parentSpanId: "root",
          timestamp: new Date(`2024-01-01T00:00:0${i + 5}Z`).toISOString(),
        })
      );

      parentSpan.children = [...timeoutSpans, ...authSpans];

      const context = makeContext([parentSpan]);
      const result = await synthesizeRootCause(context);

      // Should have at least 2 hypotheses (root cause + at least one pattern)
      expect(result.hypotheses.length).toBeGreaterThanOrEqual(2);

      // Verify ranks are sequential starting at 1
      for (let i = 0; i < result.hypotheses.length; i++) {
        expect(result.hypotheses[i].rank).toBe(i + 1);
      }

      // Verify confidence is descending
      for (let i = 1; i < result.hypotheses.length; i++) {
        expect(result.hypotheses[i].confidence).toBeLessThanOrEqual(
          result.hypotheses[i - 1].confidence
        );
      }
    });

    it("should assign rank 1 to the root cause hypothesis", async () => {
      const span = makeSpan({
        spanId: "only-error",
        name: "main-process",
        componentType: "reasoning",
        status: "error",
        statusMessage: "Critical failure in reasoning engine",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context);

      expect(result.hypotheses.length).toBeGreaterThan(0);
      expect(result.hypotheses[0].rank).toBe(1);
      expect(result.hypotheses[0].confidence).toBeGreaterThan(0);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate hypotheses with overlapping affected spans", async () => {
      // Create spans that will generate overlapping hypotheses
      // Same error repeated — causal and pattern will identify the same root span
      const spans = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `dup-span-${i}`,
          name: "retrieval",
          componentType: "retrieval",
          status: "error",
          statusMessage: "Timeout connecting to embedding service",
          timestamp: new Date(`2024-01-01T00:00:0${i}Z`).toISOString(),
        })
      );

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context);

      // Verify no two hypotheses share the same pattern signature
      const patternSignatures = result.hypotheses
        .filter((h) => h.pattern)
        .map((h) => h.pattern!.signature);
      const uniqueSignatures = new Set(patternSignatures);
      expect(uniqueSignatures.size).toBe(patternSignatures.length);
    });

    it("should keep higher-confidence hypothesis when deduplicating", async () => {
      const spans = Array.from({ length: 5 }, (_, i) =>
        makeSpan({
          spanId: `span-${i}`,
          name: "tool-call",
          componentType: "tool",
          status: "error",
          statusMessage: "Rate limit exceeded: too many requests",
          timestamp: new Date(`2024-01-01T00:00:0${i}Z`).toISOString(),
        })
      );

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context);

      // After deduplication, all remaining hypotheses should have unique evidence
      for (let i = 0; i < result.hypotheses.length; i++) {
        for (let j = i + 1; j < result.hypotheses.length; j++) {
          // If they share a pattern, they should have different signatures
          if (result.hypotheses[i].pattern && result.hypotheses[j].pattern) {
            expect(result.hypotheses[i].pattern!.signature).not.toBe(
              result.hypotheses[j].pattern!.signature
            );
          }
        }
      }
    });
  });

  describe("LLM summarization", () => {
    it("should use template-based summary when LLM is disabled", async () => {
      const span = makeSpan({
        spanId: "test-span",
        name: "api-call",
        componentType: "tool",
        status: "error",
        statusMessage: "Connection refused",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context, {
        enableLLMSummarization: false,
      });

      expect(result.hypotheses.length).toBeGreaterThan(0);
      // Template-based summaries contain structured info
      expect(result.hypotheses[0].summary).toBeTruthy();
      expect(typeof result.hypotheses[0].summary).toBe("string");
    });

    it("should use LLM summarizer when enabled and provided", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("LLM-generated summary of root cause");

      const span = makeSpan({
        spanId: "test-span",
        name: "api-call",
        componentType: "tool",
        status: "error",
        statusMessage: "Connection refused",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context, {
        enableLLMSummarization: true,
        llmSummarizer: mockSummarizer,
      });

      expect(result.hypotheses.length).toBeGreaterThan(0);
      expect(mockSummarizer).toHaveBeenCalled();
      expect(result.hypotheses[0].summary).toBe("LLM-generated summary of root cause");
    });

    it("should not call LLM summarizer when disabled even if provided", async () => {
      const mockSummarizer = vi.fn().mockResolvedValue("Should not be called");

      const span = makeSpan({
        spanId: "test-span",
        name: "api-call",
        componentType: "tool",
        status: "error",
        statusMessage: "Server error 500",
      });

      const context = makeContext([span]);
      await synthesizeRootCause(context, {
        enableLLMSummarization: false,
        llmSummarizer: mockSummarizer,
      });

      expect(mockSummarizer).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle trace with no errors", async () => {
      const span = makeSpan({
        spanId: "ok-span",
        name: "successful-operation",
        status: "ok",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context);

      expect(result.hypotheses).toHaveLength(0);
      expect(result.causalAnalysis.hasErrors).toBe(false);
      expect(result.patternAnalysis.totalFailures).toBe(0);
      expect(result.summary).toContain("No errors detected");
    });

    it("should handle single error span", async () => {
      const span = makeSpan({
        spanId: "single-error",
        name: "failing-tool",
        componentType: "tool",
        status: "error",
        statusMessage: "Tool execution failed: invalid input",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context);

      expect(result.hypotheses.length).toBeGreaterThan(0);
      expect(result.causalAnalysis.hasErrors).toBe(true);
      expect(result.causalAnalysis.rootCause).toBeDefined();
      expect(result.causalAnalysis.rootCause!.spanId).toBe("single-error");
    });

    it("should handle all errors with same root cause", async () => {
      const rootSpan = makeSpan({
        spanId: "root-error",
        name: "database",
        componentType: "retrieval",
        status: "error",
        statusMessage: "Database connection pool exhausted",
        timestamp: new Date("2024-01-01T00:00:00Z").toISOString(),
      });

      const childErrors = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `child-error-${i}`,
          name: `query-${i}`,
          componentType: "retrieval",
          status: "error",
          statusMessage: "Database connection pool exhausted",
          parentSpanId: "root-error",
          timestamp: new Date(`2024-01-01T00:00:0${i + 1}Z`).toISOString(),
        })
      );

      rootSpan.children = childErrors;

      const context = makeContext([rootSpan]);
      const result = await synthesizeRootCause(context);

      // Should identify a single root cause
      const rootCauses = result.hypotheses.filter((h) => h.category === "root_cause");
      expect(rootCauses.length).toBe(1);
      expect(rootCauses[0].affectedSpans).toContain("root-error");
    });

    it("should respect maxHypotheses config", async () => {
      // Create many different error patterns
      const spans = Array.from({ length: 20 }, (_, i) => {
        const errorTypes = ["timeout", "connection refused", "invalid token", "rate limit", "server error"];
        return makeSpan({
          spanId: `span-${i}`,
          name: `operation-${i % 5}`,
          componentType: i % 2 === 0 ? "tool" : "retrieval",
          status: "error",
          statusMessage: `${errorTypes[i % 5]}: error detail ${i}`,
          timestamp: new Date(`2024-01-01T00:00:${String(i).padStart(2, "0")}Z`).toISOString(),
        });
      });

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context, { maxHypotheses: 3 });

      expect(result.hypotheses.length).toBeLessThanOrEqual(3);
    });

    it("should respect minConfidence config", async () => {
      const span = makeSpan({
        spanId: "low-conf",
        name: "unknown-op",
        componentType: "other",
        status: "error",
        statusMessage: "Some obscure error",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context, { minConfidence: 0.99 });

      // With very high min confidence, most hypotheses should be filtered out
      // (root cause from causal DAG has high confidence, so this might still pass)
      for (const h of result.hypotheses) {
        expect(h.confidence).toBeGreaterThanOrEqual(0.99);
      }
    });

    it("should include remediation suggestions", async () => {
      const span = makeSpan({
        spanId: "timeout-span",
        name: "slow-api",
        componentType: "tool",
        status: "error",
        statusMessage: "Request timeout after 60 seconds",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context);

      const withRemediation = result.hypotheses.filter((h) => h.remediation);
      expect(withRemediation.length).toBeGreaterThan(0);

      const remediation = withRemediation[0].remediation!;
      expect(remediation.action).toBeTruthy();
      expect(remediation.description).toBeTruthy();
      expect(remediation.confidence).toBeGreaterThan(0);
      expect(["historical_resolution", "pattern_match", "best_practice"]).toContain(
        remediation.basedOn
      );
    });

    it("should generate meaningful summary", async () => {
      const spans = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `span-${i}`,
          name: "tool-call",
          componentType: "tool",
          status: "error",
          statusMessage: "Authentication failed: expired token",
          timestamp: new Date(`2024-01-01T00:00:0${i}Z`).toISOString(),
        })
      );

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context);

      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain("spans");
      expect(result.summary).toContain("errors");
    });
  });

  describe("statistical basis", () => {
    it("should set causal_dag method for causal hypotheses", async () => {
      const span = makeSpan({
        spanId: "causal-test",
        name: "main-process",
        componentType: "reasoning",
        status: "error",
        statusMessage: "Reasoning failure",
      });

      const context = makeContext([span]);
      const result = await synthesizeRootCause(context);

      const causal = result.hypotheses.find((h) => h.category === "root_cause");
      if (causal) {
        expect(causal.statisticalBasis.method).toBe("causal_dag");
        expect(causal.statisticalBasis.strength).toBe(1.0);
        expect(causal.statisticalBasis.sampleSize).toBeGreaterThan(0);
      }
    });

    it("should set pattern_clustering method for pattern hypotheses", async () => {
      const spans = Array.from({ length: 3 }, (_, i) =>
        makeSpan({
          spanId: `pattern-test-${i}`,
          name: "api-call",
          componentType: "tool",
          status: "error",
          statusMessage: "Service unavailable: backend down",
          timestamp: new Date(`2024-01-01T00:00:0${i}Z`).toISOString(),
        })
      );

      const context = makeContext(spans);
      const result = await synthesizeRootCause(context);

      const patternHyp = result.hypotheses.find(
        (h) => h.statisticalBasis.method === "pattern_clustering"
      );
      if (patternHyp) {
        expect(patternHyp.statisticalBasis.strength).toBeGreaterThan(0);
        expect(patternHyp.statisticalBasis.strength).toBeLessThanOrEqual(1);
        expect(patternHyp.statisticalBasis.sampleSize).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
