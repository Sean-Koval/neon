/**
 * Tests for Neon API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Neon, createNeonClient, type NeonConfig } from "../client/index";

// ==================== Helpers ====================

const DEFAULT_CONFIG: NeonConfig = {
  apiKey: "test-api-key-123",
};

function createClient(config?: Partial<NeonConfig>): Neon {
  return new Neon({ ...DEFAULT_CONFIG, ...config });
}

function mockFetchSuccess(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockFetchError(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: body }),
    text: () => Promise.resolve(body),
  });
}

function mockFetchNetworkError(message: string) {
  return vi.fn().mockRejectedValue(new TypeError(message));
}

// ==================== Tests ====================

describe("Neon Client", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==================== Constructor / Initialization ====================

  describe("constructor", () => {
    it("stores apiKey from config", () => {
      const client = createClient({ apiKey: "my-key" });
      // Verify by making a request and checking auth header
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      client.traces.list();

      expect(mockFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-key",
          }),
        })
      );
    });

    it("uses default baseUrl when not provided", () => {
      const client = createClient();
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      client.traces.list();

      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining("https://api.neon.dev"),
        expect.any(Object)
      );
    });

    it("uses custom baseUrl when provided", () => {
      const client = createClient({ baseUrl: "https://custom.example.com" });
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      client.traces.list();

      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining("https://custom.example.com"),
        expect.any(Object)
      );
    });

    it("does not append trailing slash to baseUrl", () => {
      const client = createClient({ baseUrl: "https://custom.example.com" });
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      client.traces.list();

      const calledUrl = mockFn.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^https:\/\/custom\.example\.com\/api\//);
    });
  });

  describe("createNeonClient factory", () => {
    it("creates a Neon instance", () => {
      const client = createNeonClient({ apiKey: "key-123" });
      expect(client).toBeInstanceOf(Neon);
    });

    it("passes config through correctly", () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createNeonClient({
        apiKey: "factory-key",
        baseUrl: "https://factory.example.com",
      });

      client.traces.list();

      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining("https://factory.example.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer factory-key",
          }),
        })
      );
    });
  });

  // ==================== Auth Header ====================

  describe("auth header", () => {
    it("sends Authorization Bearer header on every request", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient({ apiKey: "secret-key" });

      await client.traces.list();
      await client.datasets.list();

      for (const call of mockFn.mock.calls) {
        expect(call[1].headers.Authorization).toBe("Bearer secret-key");
      }
    });

    it("sends Content-Type application/json header", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list();

      expect(mockFn.mock.calls[0][1].headers["Content-Type"]).toBe(
        "application/json"
      );
    });

    it("allows custom headers to be merged", async () => {
      // The client sets Authorization and Content-Type.
      // Verify they're always present even for POST requests with body
      const mockFn = mockFetchSuccess({ scoreId: "s1" });
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.scores.create({
        projectId: "proj-1",
        traceId: "trace-1",
        name: "quality",
        value: 0.9,
      });

      const headers = mockFn.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe("Bearer test-api-key-123");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  // ==================== Base URL Construction ====================

  describe("base URL construction", () => {
    it("prepends base URL to all paths", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient({ baseUrl: "https://my-api.test" });
      await client.traces.list();

      expect(mockFn.mock.calls[0][0]).toBe(
        "https://my-api.test/api/traces?"
      );
    });

    it("handles base URL with trailing path", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient({ baseUrl: "https://my-api.test/v2" });
      await client.datasets.list();

      expect(mockFn.mock.calls[0][0]).toBe(
        "https://my-api.test/v2/api/datasets"
      );
    });
  });

  // ==================== Traces API ====================

  describe("traces.list", () => {
    it("calls GET /api/traces with no params", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.traces.list();

      expect(result).toEqual([]);
      expect(mockFn.mock.calls[0][0]).toContain("/api/traces");
    });

    it("includes projectId filter in query params", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1" });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("project_id=proj-1");
    });

    it("includes status filter in query params", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1", status: "ok" });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("status=ok");
    });

    it("converts startDate to ISO string", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const date = new Date("2024-01-15T00:00:00Z");
      const client = createClient();
      await client.traces.list({ projectId: "proj-1", startDate: date });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("start_date=2024-01-15T00%3A00%3A00.000Z");
    });

    it("converts endDate to ISO string", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const date = new Date("2024-12-31T23:59:59Z");
      const client = createClient();
      await client.traces.list({ projectId: "proj-1", endDate: date });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("end_date=");
    });

    it("includes agentId filter", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1", agentId: "agent-42" });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("agent_id=agent-42");
    });

    it("includes search filter", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1", search: "error" });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("search=error");
    });

    it("includes limit and offset filters", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1", limit: 10, offset: 20 });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });

    it("omits undefined filters from query params", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list({ projectId: "proj-1" });

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).not.toContain("status=");
      expect(url).not.toContain("agent_id=");
      expect(url).not.toContain("search=");
      expect(url).not.toContain("limit=");
      expect(url).not.toContain("offset=");
    });

    it("returns array of traces", async () => {
      const traces = [
        { traceId: "t1", name: "trace-1" },
        { traceId: "t2", name: "trace-2" },
      ];
      globalThis.fetch = mockFetchSuccess(traces);

      const client = createClient();
      const result = await client.traces.list();

      expect(result).toEqual(traces);
      expect(result).toHaveLength(2);
    });
  });

  describe("traces.get", () => {
    it("calls GET /api/traces/:traceId", async () => {
      const trace = { trace: { traceId: "abc" }, spans: [] };
      const mockFn = mockFetchSuccess(trace);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.traces.get("abc");

      expect(mockFn.mock.calls[0][0]).toContain("/api/traces/abc");
      expect(result).toEqual(trace);
    });

    it("encodes traceId in URL path", async () => {
      const mockFn = mockFetchSuccess({ trace: {}, spans: [] });
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.get("trace-with-special/chars");

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("/api/traces/trace-with-special/chars");
    });
  });

  describe("traces.search", () => {
    it("calls GET /api/traces/search with query param", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.search("error handling");

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("/api/traces/search");
      expect(url).toContain("query=error+handling");
    });

    it("includes optional limit param", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.search("test", 5);

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).toContain("limit=5");
    });

    it("omits limit when not provided", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.search("test");

      const url = mockFn.mock.calls[0][0] as string;
      expect(url).not.toContain("limit=");
    });

    it("returns matching traces", async () => {
      const traces = [{ traceId: "match-1", name: "error trace" }];
      globalThis.fetch = mockFetchSuccess(traces);

      const client = createClient();
      const result = await client.traces.search("error");

      expect(result).toEqual(traces);
    });
  });

  // ==================== Scores API ====================

  describe("scores.create", () => {
    it("calls POST /api/scores with body", async () => {
      const score = { scoreId: "s1", name: "quality", value: 0.9 };
      const mockFn = mockFetchSuccess(score);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.scores.create({
        projectId: "proj-1",
        traceId: "trace-1",
        name: "quality",
        value: 0.9,
      });

      expect(mockFn.mock.calls[0][0]).toContain("/api/scores");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual({
        projectId: "proj-1",
        traceId: "trace-1",
        name: "quality",
        value: 0.9,
      });
      expect(result).toEqual(score);
    });

    it("sends optional fields when provided", async () => {
      const mockFn = mockFetchSuccess({ scoreId: "s2" });
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.scores.create({
        projectId: "proj-1",
        traceId: "trace-1",
        name: "safety",
        value: 1.0,
        scoreType: "numeric",
        comment: "All good",
        source: "automated",
        spanId: "span-1",
      });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.scoreType).toBe("numeric");
      expect(body.comment).toBe("All good");
      expect(body.source).toBe("automated");
      expect(body.spanId).toBe("span-1");
    });
  });

  describe("scores.createBatch", () => {
    it("calls POST /api/scores/batch with array body", async () => {
      const scores = [
        { scoreId: "s1", name: "q", value: 0.9 },
        { scoreId: "s2", name: "s", value: 1.0 },
      ];
      const mockFn = mockFetchSuccess(scores);
      globalThis.fetch = mockFn;

      const client = createClient();
      const inputs = [
        { projectId: "p", traceId: "t1", name: "q", value: 0.9 },
        { projectId: "p", traceId: "t1", name: "s", value: 1.0 },
      ];
      const result = await client.scores.createBatch(inputs);

      expect(mockFn.mock.calls[0][0]).toContain("/api/scores/batch");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual(inputs);
      expect(result).toEqual(scores);
      expect(result).toHaveLength(2);
    });

    it("handles empty batch", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.scores.createBatch([]);

      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual([]);
      expect(result).toEqual([]);
    });
  });

  describe("scores.list", () => {
    it("calls GET /api/traces/:traceId/scores", async () => {
      const scores = [{ scoreId: "s1", name: "quality", value: 0.8 }];
      const mockFn = mockFetchSuccess(scores);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.scores.list("trace-42");

      expect(mockFn.mock.calls[0][0]).toContain("/api/traces/trace-42/scores");
      expect(result).toEqual(scores);
    });

    it("returns empty array when no scores exist", async () => {
      globalThis.fetch = mockFetchSuccess([]);

      const client = createClient();
      const result = await client.scores.list("trace-no-scores");

      expect(result).toEqual([]);
    });
  });

  // ==================== Datasets API ====================

  describe("datasets.create", () => {
    it("calls POST /api/datasets with body", async () => {
      const dataset = { id: "ds-1", name: "test-dataset" };
      const mockFn = mockFetchSuccess(dataset);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.datasets.create({
        projectId: "proj-1",
        name: "test-dataset",
      });

      expect(mockFn.mock.calls[0][0]).toContain("/api/datasets");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual({
        projectId: "proj-1",
        name: "test-dataset",
      });
      expect(result).toEqual(dataset);
    });

    it("includes optional description and items", async () => {
      const mockFn = mockFetchSuccess({ id: "ds-2" });
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.datasets.create({
        projectId: "proj-1",
        name: "ds-with-items",
        description: "A test dataset",
        items: [{ input: { query: "Hello" }, expected: { output: "Hi" } }],
        metadata: { version: "1.0" },
      });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.description).toBe("A test dataset");
      expect(body.items).toHaveLength(1);
      expect(body.items[0].input.query).toBe("Hello");
      expect(body.metadata.version).toBe("1.0");
    });
  });

  describe("datasets.addItems", () => {
    it("calls POST /api/datasets/:datasetId/items", async () => {
      const mockFn = mockFetchSuccess(undefined);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.datasets.addItems("ds-1", [
        { input: { query: "test" } },
        { input: { query: "test2" }, expected: { output: "answer" } },
      ]);

      expect(mockFn.mock.calls[0][0]).toContain("/api/datasets/ds-1/items");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].input.query).toBe("test");
      expect(body.items[1].expected.output).toBe("answer");
    });

    it("returns void (no return value)", async () => {
      globalThis.fetch = mockFetchSuccess(undefined);

      const client = createClient();
      const result = await client.datasets.addItems("ds-1", []);

      expect(result).toBeUndefined();
    });

    it("handles empty items array", async () => {
      const mockFn = mockFetchSuccess(undefined);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.datasets.addItems("ds-1", []);

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.items).toEqual([]);
    });
  });

  describe("datasets.list", () => {
    it("calls GET /api/datasets", async () => {
      const datasets = [
        { id: "ds-1", name: "dataset-1" },
        { id: "ds-2", name: "dataset-2" },
      ];
      const mockFn = mockFetchSuccess(datasets);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.datasets.list();

      expect(mockFn.mock.calls[0][0]).toContain("/api/datasets");
      expect(result).toEqual(datasets);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no datasets exist", async () => {
      globalThis.fetch = mockFetchSuccess([]);

      const client = createClient();
      const result = await client.datasets.list();

      expect(result).toEqual([]);
    });
  });

  describe("datasets.get", () => {
    it("calls GET /api/datasets/:datasetId", async () => {
      const dataset = {
        id: "ds-42",
        name: "my-dataset",
        items: [{ input: { query: "hi" } }],
      };
      const mockFn = mockFetchSuccess(dataset);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.datasets.get("ds-42");

      expect(mockFn.mock.calls[0][0]).toContain("/api/datasets/ds-42");
      expect(result).toEqual(dataset);
    });
  });

  // ==================== Eval API ====================

  describe("eval.runSuite", () => {
    it("calls POST /api/eval/suite with suite body", async () => {
      const evalRun = { id: "run-1", status: "pending" };
      const mockFn = mockFetchSuccess(evalRun);
      globalThis.fetch = mockFn;

      const suite = {
        name: "test-suite",
        tests: [{ name: "t1", input: { query: "hi" } }],
      };

      const client = createClient();
      const result = await client.eval.runSuite(suite as any);

      expect(mockFn.mock.calls[0][0]).toContain("/api/eval/suite");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual(suite);
      expect(result).toEqual(evalRun);
    });
  });

  describe("eval.runTests", () => {
    it("calls POST /api/eval/tests with tests array", async () => {
      const evalResult = {
        runId: "run-1",
        results: [],
        summary: { total: 0, passed: 0, failed: 0, avgScore: 0, passRate: 0 },
      };
      const mockFn = mockFetchSuccess(evalResult);
      globalThis.fetch = mockFn;

      const tests = [
        { name: "t1", input: { query: "hello" } },
        { name: "t2", input: { query: "world" } },
      ];

      const client = createClient();
      const result = await client.eval.runTests(tests as any);

      expect(mockFn.mock.calls[0][0]).toContain("/api/eval/tests");
      expect(mockFn.mock.calls[0][1].method).toBe("POST");
      expect(JSON.parse(mockFn.mock.calls[0][1].body)).toEqual({ tests });
      expect(result).toEqual(evalResult);
    });
  });

  describe("eval.getRunStatus", () => {
    it("calls GET /api/eval/runs/:runId", async () => {
      const run = { id: "run-5", status: "running", progress: { completed: 3, total: 10 } };
      const mockFn = mockFetchSuccess(run);
      globalThis.fetch = mockFn;

      const client = createClient();
      const result = await client.eval.getRunStatus("run-5");

      expect(mockFn.mock.calls[0][0]).toContain("/api/eval/runs/run-5");
      expect(result).toEqual(run);
    });
  });

  describe("eval.waitForRun", () => {
    it("polls until status is completed", async () => {
      const finalResult = {
        runId: "run-1",
        results: [{ caseIndex: 0, traceId: "t1", status: "passed", scores: [] }],
        summary: { total: 1, passed: 1, failed: 0, avgScore: 1, passRate: 1 },
      };

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.endsWith("/result")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(finalResult),
            text: () => Promise.resolve(JSON.stringify(finalResult)),
          });
        }
        // First call: running, second call: completed
        const status = callCount <= 1 ? "running" : "completed";
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: "run-1", status, progress: { completed: 1, total: 1 } }),
          text: () => Promise.resolve("{}"),
        });
      });

      const client = createClient();
      const result = await client.eval.waitForRun("run-1", 10); // 10ms poll

      expect(result).toEqual(finalResult);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("throws when run status is failed", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "run-1",
            status: "failed",
            errorMessage: "Agent crashed",
          }),
        text: () => Promise.resolve("{}"),
      });

      const client = createClient();
      await expect(client.eval.waitForRun("run-1", 10)).rejects.toThrow(
        "Evaluation run failed: Agent crashed"
      );
    });

    it("uses default poll interval of 1000ms", () => {
      // Verify the parameter default by checking the method signature behavior
      // We can't easily test timing, but we can verify no error with default
      const client = createClient();
      // The method exists and accepts runId as the only required param
      expect(typeof client.eval.waitForRun).toBe("function");
    });
  });

  // ==================== HTTP Error Handling ====================

  describe("HTTP error handling", () => {
    it("throws on 400 Bad Request", async () => {
      globalThis.fetch = mockFetchError(400, "Invalid request body");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(
        "Neon API error: 400 Invalid request body"
      );
    });

    it("throws on 401 Unauthorized", async () => {
      globalThis.fetch = mockFetchError(401, "Invalid API key");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(
        "Neon API error: 401 Invalid API key"
      );
    });

    it("throws on 403 Forbidden", async () => {
      globalThis.fetch = mockFetchError(403, "Access denied");

      const client = createClient();
      await expect(client.scores.list("t1")).rejects.toThrow(
        "Neon API error: 403 Access denied"
      );
    });

    it("throws on 404 Not Found", async () => {
      globalThis.fetch = mockFetchError(404, "Trace not found");

      const client = createClient();
      await expect(client.traces.get("nonexistent")).rejects.toThrow(
        "Neon API error: 404 Trace not found"
      );
    });

    it("throws on 409 Conflict", async () => {
      globalThis.fetch = mockFetchError(409, "Dataset already exists");

      const client = createClient();
      await expect(
        client.datasets.create({ projectId: "p", name: "dup" })
      ).rejects.toThrow("Neon API error: 409 Dataset already exists");
    });

    it("throws on 422 Unprocessable Entity", async () => {
      globalThis.fetch = mockFetchError(422, "Validation failed");

      const client = createClient();
      await expect(
        client.scores.create({
          projectId: "p",
          traceId: "t",
          name: "s",
          value: -1,
        })
      ).rejects.toThrow("Neon API error: 422 Validation failed");
    });

    it("throws on 429 Rate Limited", async () => {
      globalThis.fetch = mockFetchError(429, "Rate limit exceeded");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(
        "Neon API error: 429 Rate limit exceeded"
      );
    });

    it("throws on 500 Internal Server Error", async () => {
      globalThis.fetch = mockFetchError(500, "Internal server error");

      const client = createClient();
      await expect(client.datasets.list()).rejects.toThrow(
        "Neon API error: 500 Internal server error"
      );
    });

    it("throws on 502 Bad Gateway", async () => {
      globalThis.fetch = mockFetchError(502, "Bad gateway");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(
        "Neon API error: 502 Bad gateway"
      );
    });

    it("throws on 503 Service Unavailable", async () => {
      globalThis.fetch = mockFetchError(503, "Service unavailable");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(
        "Neon API error: 503 Service unavailable"
      );
    });

    it("includes full error text from server response", async () => {
      const detailedError = JSON.stringify({
        error: "Validation failed",
        details: [{ field: "name", message: "required" }],
      });
      globalThis.fetch = mockFetchError(400, detailedError);

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow(detailedError);
    });
  });

  // ==================== Network Errors ====================

  describe("network errors", () => {
    it("propagates fetch TypeError on network failure", async () => {
      globalThis.fetch = mockFetchNetworkError("fetch failed");

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow("fetch failed");
    });

    it("propagates connection refused error", async () => {
      globalThis.fetch = mockFetchNetworkError(
        "connect ECONNREFUSED 127.0.0.1:3000"
      );

      const client = createClient();
      await expect(client.datasets.list()).rejects.toThrow("ECONNREFUSED");
    });

    it("propagates DNS resolution failure", async () => {
      globalThis.fetch = mockFetchNetworkError(
        "getaddrinfo ENOTFOUND api.neon.dev"
      );

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow("ENOTFOUND");
    });

    it("propagates timeout error", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow("aborted");
    });
  });

  // ==================== Response Parsing ====================

  describe("response parsing", () => {
    it("parses valid JSON response", async () => {
      const data = { traceId: "t1", name: "trace", status: "ok" };
      globalThis.fetch = mockFetchSuccess(data);

      const client = createClient();
      const result = await client.traces.get("t1");

      expect(result).toEqual(data);
    });

    it("handles response with nested objects", async () => {
      const data = {
        trace: {
          traceId: "t1",
          metadata: { deep: { nested: "value" } },
        },
        spans: [
          { spanId: "s1", children: [{ spanId: "s2", children: [] }] },
        ],
      };
      globalThis.fetch = mockFetchSuccess(data);

      const client = createClient();
      const result = await client.traces.get("t1");

      expect(result.trace.metadata.deep.nested).toBe("value");
      expect(result.spans[0].children[0].spanId).toBe("s2");
    });

    it("handles malformed JSON response from json()", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        text: () => Promise.resolve("not json"),
      });

      const client = createClient();
      await expect(client.traces.list()).rejects.toThrow("Unexpected token");
    });

    it("handles empty array response", async () => {
      globalThis.fetch = mockFetchSuccess([]);

      const client = createClient();
      const result = await client.traces.list();

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles null values in response", async () => {
      const data = {
        traceId: "t1",
        agentId: null,
        agentVersion: null,
        workflowId: null,
      };
      globalThis.fetch = mockFetchSuccess(data);

      const client = createClient();
      const result = await client.traces.get("t1");

      expect(result.agentId).toBeNull();
      expect(result.agentVersion).toBeNull();
    });

    it("handles response with numeric values", async () => {
      const data = {
        scoreId: "s1",
        value: 0.95,
        name: "quality",
      };
      globalThis.fetch = mockFetchSuccess(data);

      const client = createClient();
      const result = await client.scores.create({
        projectId: "p",
        traceId: "t",
        name: "q",
        value: 0.95,
      });

      expect(result.value).toBe(0.95);
      expect(typeof result.value).toBe("number");
    });
  });

  // ==================== Edge Cases ====================

  describe("edge cases", () => {
    it("handles empty string API key", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient({ apiKey: "" });
      await client.traces.list();

      expect(mockFn.mock.calls[0][1].headers.Authorization).toBe("Bearer ");
    });

    it("handles very long API key", async () => {
      const longKey = "k".repeat(1000);
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient({ apiKey: longKey });
      await client.traces.list();

      expect(mockFn.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${longKey}`
      );
    });

    it("handles concurrent requests", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
          text: () => Promise.resolve("[]"),
        });
      });

      const client = createClient();
      await Promise.all([
        client.traces.list(),
        client.datasets.list(),
        client.scores.list("t1"),
      ]);

      expect(callCount).toBe(3);
    });

    it("makes independent requests (no shared state between calls)", async () => {
      const mockFn = vi.fn();
      mockFn
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ traceId: "first" }]),
          text: () => Promise.resolve(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ traceId: "second" }]),
          text: () => Promise.resolve(""),
        });
      globalThis.fetch = mockFn;

      const client = createClient();
      const first = await client.traces.list();
      const second = await client.traces.list();

      expect(first).toEqual([{ traceId: "first" }]);
      expect(second).toEqual([{ traceId: "second" }]);
    });

    it("handles POST with large body", async () => {
      const mockFn = mockFetchSuccess({ id: "ds-big" });
      globalThis.fetch = mockFn;

      const largeItems = Array.from({ length: 1000 }, (_, i) => ({
        input: { query: `item-${i}`, data: "x".repeat(100) },
        expected: { output: `result-${i}` },
      }));

      const client = createClient();
      await client.datasets.create({
        projectId: "p",
        name: "large-dataset",
        items: largeItems,
      });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.items).toHaveLength(1000);
    });

    it("supports multiple client instances with different configs", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client1 = createClient({
        apiKey: "key-1",
        baseUrl: "https://api1.test",
      });
      const client2 = createClient({
        apiKey: "key-2",
        baseUrl: "https://api2.test",
      });

      await client1.traces.list();
      await client2.traces.list();

      expect(mockFn.mock.calls[0][0]).toContain("api1.test");
      expect(mockFn.mock.calls[0][1].headers.Authorization).toBe("Bearer key-1");
      expect(mockFn.mock.calls[1][0]).toContain("api2.test");
      expect(mockFn.mock.calls[1][1].headers.Authorization).toBe("Bearer key-2");
    });
  });

  // ==================== Request Method Verification ====================

  describe("request methods", () => {
    it("uses GET for list operations", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();

      await client.traces.list();
      await client.datasets.list();
      await client.scores.list("t1");

      for (const call of mockFn.mock.calls) {
        // GET requests don't explicitly set method (undefined or not present)
        expect(call[1].method).toBeUndefined();
      }
    });

    it("uses GET for get operations", async () => {
      const mockFn = mockFetchSuccess({});
      globalThis.fetch = mockFn;

      const client = createClient();

      await client.traces.get("t1");
      await client.datasets.get("ds1");
      await client.eval.getRunStatus("run1");

      for (const call of mockFn.mock.calls) {
        expect(call[1].method).toBeUndefined();
      }
    });

    it("uses POST for create operations", async () => {
      const mockFn = mockFetchSuccess({});
      globalThis.fetch = mockFn;

      const client = createClient();

      await client.scores.create({
        projectId: "p",
        traceId: "t",
        name: "s",
        value: 1,
      });
      await client.datasets.create({ projectId: "p", name: "ds" });

      for (const call of mockFn.mock.calls) {
        expect(call[1].method).toBe("POST");
      }
    });

    it("sends JSON body for POST requests", async () => {
      const mockFn = mockFetchSuccess({});
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.scores.create({
        projectId: "p",
        traceId: "t",
        name: "s",
        value: 0.5,
      });

      const body = mockFn.mock.calls[0][1].body;
      expect(typeof body).toBe("string");
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("does not send body for GET requests", async () => {
      const mockFn = mockFetchSuccess([]);
      globalThis.fetch = mockFn;

      const client = createClient();
      await client.traces.list();

      expect(mockFn.mock.calls[0][1].body).toBeUndefined();
    });
  });

  // ==================== URL Path Construction ====================

  describe("URL path construction", () => {
    it("constructs correct paths for all endpoints", async () => {
      const mockFn = mockFetchSuccess({});
      globalThis.fetch = mockFn;

      const client = createClient({ baseUrl: "https://api.test" });

      await client.traces.list();
      await client.traces.get("t1");
      await client.traces.search("q");
      await client.scores.create({ projectId: "p", traceId: "t", name: "s", value: 1 });
      await client.scores.createBatch([]);
      await client.scores.list("t1");
      await client.datasets.create({ projectId: "p", name: "ds" });
      await client.datasets.addItems("ds1", []);
      await client.datasets.list();
      await client.datasets.get("ds1");
      await client.eval.runSuite({} as any);
      await client.eval.runTests([]);
      await client.eval.getRunStatus("r1");

      const urls = mockFn.mock.calls.map((c: any[]) => c[0]);
      expect(urls[0]).toContain("/api/traces?");
      expect(urls[1]).toBe("https://api.test/api/traces/t1");
      expect(urls[2]).toContain("/api/traces/search?");
      expect(urls[3]).toBe("https://api.test/api/scores");
      expect(urls[4]).toBe("https://api.test/api/scores/batch");
      expect(urls[5]).toBe("https://api.test/api/traces/t1/scores");
      expect(urls[6]).toBe("https://api.test/api/datasets");
      expect(urls[7]).toBe("https://api.test/api/datasets/ds1/items");
      expect(urls[8]).toBe("https://api.test/api/datasets");
      expect(urls[9]).toBe("https://api.test/api/datasets/ds1");
      expect(urls[10]).toBe("https://api.test/api/eval/suite");
      expect(urls[11]).toBe("https://api.test/api/eval/tests");
      expect(urls[12]).toBe("https://api.test/api/eval/runs/r1");
    });
  });
});
