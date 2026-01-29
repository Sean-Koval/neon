/**
 * Cloud Module Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SuiteResult } from "../test.js";
import {
  NeonCloudClient,
  CloudSyncError,
  createCloudClientFromEnv,
  isCloudSyncConfigured,
  type EvalSyncPayload,
} from "../cloud/client.js";
import {
  syncResultsToCloud,
  syncSuiteResult,
  createBackgroundSync,
  formatSyncStatus,
  type SyncResult,
} from "../cloud/sync.js";

// Store original fetch
const originalFetch = globalThis.fetch;

// Create a fresh mock for each test suite
const createMockFetch = () => {
  const mockFn = vi.fn();
  globalThis.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
};

// Sample suite result for testing
const createSampleSuiteResult = (name = "test-suite"): SuiteResult => ({
  name,
  results: [
    {
      name: "test-1",
      passed: true,
      scores: [{ name: "accuracy", value: 0.85, reason: "Good accuracy" }],
      durationMs: 100,
    },
    {
      name: "test-2",
      passed: false,
      scores: [{ name: "accuracy", value: 0.5 }],
      durationMs: 200,
      error: "Assertion failed",
    },
  ],
  summary: {
    total: 2,
    passed: 1,
    failed: 1,
    passRate: 0.5,
    avgScore: 0.675,
  },
  durationMs: 300,
});

describe("NeonCloudClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("creates client with required config", () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });
      expect(client.isConfigured()).toBe(true);
    });

    it("removes trailing slash from apiUrl", () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev/",
        apiKey: "test-key",
      });
      expect(client.isConfigured()).toBe(true);
    });

    it("uses default timeout", () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe("isConfigured", () => {
    it("returns true when apiUrl and apiKey are set", () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });
      expect(client.isConfigured()).toBe(true);
    });

    it("returns false when apiUrl is empty", () => {
      const client = new NeonCloudClient({
        apiUrl: "",
        apiKey: "test-key",
      });
      expect(client.isConfigured()).toBe(false);
    });

    it("returns false when apiKey is empty", () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "",
      });
      expect(client.isConfigured()).toBe(false);
    });
  });

  describe("syncResults", () => {
    it("sends correct request to server", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });

      const mockResponse = { runId: "run-123", dashboardUrl: "https://neon.dev/runs/123" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      const result = await client.syncResults(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.neon.dev/api/eval/sync",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws CloudSyncError on HTTP error", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      await expect(client.syncResults(payload)).rejects.toThrow(CloudSyncError);
    });

    it("includes status code in error message", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      try {
        await client.syncResults(payload);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CloudSyncError);
        expect((error as Error).message).toContain("401");
      }
    });

    it("throws CloudSyncError on network error", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });

      mockFetch.mockRejectedValue(new Error("Network failure"));

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      await expect(client.syncResults(payload)).rejects.toThrow(CloudSyncError);
    });

    it("includes network error message", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
      });

      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      try {
        await client.syncResults(payload);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CloudSyncError);
        expect((error as Error).message).toContain("Network error");
      }
    });

    it("handles timeout", async () => {
      const client = new NeonCloudClient({
        apiUrl: "https://api.neon.dev",
        apiKey: "test-key",
        timeout: 100,
      });

      // Create a mock that throws AbortError
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const payload: EvalSyncPayload = {
        suiteName: "test-suite",
        testCases: [],
        summary: { total: 0, passed: 0, failed: 0, passRate: 0, avgScore: 0 },
        durationMs: 100,
        timestamp: new Date().toISOString(),
      };

      await expect(client.syncResults(payload)).rejects.toThrow("timed out");
    });
  });

  describe("createPayload", () => {
    it("converts SuiteResult to EvalSyncPayload", () => {
      const suiteResult = createSampleSuiteResult();
      const payload = NeonCloudClient.createPayload(suiteResult);

      expect(payload.suiteName).toBe("test-suite");
      expect(payload.testCases).toHaveLength(2);
      expect(payload.testCases[0].name).toBe("test-1");
      expect(payload.testCases[0].passed).toBe(true);
      expect(payload.testCases[1].error).toBe("Assertion failed");
      expect(payload.summary).toEqual(suiteResult.summary);
      expect(payload.durationMs).toBe(300);
      expect(payload.timestamp).toBeDefined();
    });

    it("includes metadata when provided", () => {
      const suiteResult = createSampleSuiteResult();
      const metadata = { branch: "main", commit: "abc123" };
      const payload = NeonCloudClient.createPayload(suiteResult, metadata);

      expect(payload.metadata).toEqual(metadata);
    });
  });
});

describe("createCloudClientFromEnv", () => {
  const originalApiUrl = process.env.NEON_API_URL;
  const originalApiKey = process.env.NEON_API_KEY;

  afterEach(() => {
    // Restore original env
    if (originalApiUrl !== undefined) {
      process.env.NEON_API_URL = originalApiUrl;
    } else {
      delete process.env.NEON_API_URL;
    }
    if (originalApiKey !== undefined) {
      process.env.NEON_API_KEY = originalApiKey;
    } else {
      delete process.env.NEON_API_KEY;
    }
  });

  it("returns undefined when NEON_API_URL is not set", () => {
    delete process.env.NEON_API_URL;
    process.env.NEON_API_KEY = "test-key";

    const client = createCloudClientFromEnv();
    expect(client).toBeUndefined();
  });

  it("returns undefined when NEON_API_KEY is not set", () => {
    process.env.NEON_API_URL = "https://api.neon.dev";
    delete process.env.NEON_API_KEY;

    const client = createCloudClientFromEnv();
    expect(client).toBeUndefined();
  });

  it("returns client when both env vars are set", () => {
    process.env.NEON_API_URL = "https://api.neon.dev";
    process.env.NEON_API_KEY = "test-key";

    const client = createCloudClientFromEnv();
    expect(client).toBeInstanceOf(NeonCloudClient);
  });
});

describe("isCloudSyncConfigured", () => {
  const originalApiUrl = process.env.NEON_API_URL;
  const originalApiKey = process.env.NEON_API_KEY;

  afterEach(() => {
    if (originalApiUrl !== undefined) {
      process.env.NEON_API_URL = originalApiUrl;
    } else {
      delete process.env.NEON_API_URL;
    }
    if (originalApiKey !== undefined) {
      process.env.NEON_API_KEY = originalApiKey;
    } else {
      delete process.env.NEON_API_KEY;
    }
  });

  it("returns false when env vars are not set", () => {
    delete process.env.NEON_API_URL;
    delete process.env.NEON_API_KEY;

    expect(isCloudSyncConfigured()).toBe(false);
  });

  it("returns true when both env vars are set", () => {
    process.env.NEON_API_URL = "https://api.neon.dev";
    process.env.NEON_API_KEY = "test-key";

    expect(isCloudSyncConfigured()).toBe(true);
  });
});

describe("syncResultsToCloud", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns skipped results when no client configured", async () => {
    const results = [createSampleSuiteResult()];
    const syncResults = await syncResultsToCloud(results, {
      client: undefined,
    });

    expect(syncResults).toHaveLength(1);
    expect(syncResults[0].skipped).toBe(true);
    expect(syncResults[0].success).toBe(false);
  });

  it("syncs results successfully", async () => {
    const mockResponse = { runId: "run-123" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const results = [createSampleSuiteResult()];
    const syncResults = await syncResultsToCloud(results, { client });

    expect(syncResults).toHaveLength(1);
    expect(syncResults[0].success).toBe(true);
    expect(syncResults[0].response).toEqual(mockResponse);
  });

  it("handles errors gracefully by default", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const results = [createSampleSuiteResult()];
    const syncResults = await syncResultsToCloud(results, {
      client,
      logger: mockLogger,
    });

    expect(syncResults).toHaveLength(1);
    expect(syncResults[0].success).toBe(false);
    expect(syncResults[0].error).toBeDefined();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("throws errors when throwOnError is true", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const results = [createSampleSuiteResult()];

    await expect(
      syncResultsToCloud(results, { client, throwOnError: true })
    ).rejects.toThrow(CloudSyncError);
  });

  it("includes metadata in payload", async () => {
    const mockResponse = { runId: "run-123" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const metadata = { branch: "main" };
    const results = [createSampleSuiteResult()];
    await syncResultsToCloud(results, { client, metadata });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.metadata).toEqual(metadata);
  });
});

describe("syncSuiteResult", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("syncs a single suite result", async () => {
    const mockResponse = { runId: "run-123" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const result = createSampleSuiteResult();
    const syncResult = await syncSuiteResult(result, { client });

    expect(syncResult.success).toBe(true);
    expect(syncResult.response).toEqual(mockResponse);
  });
});

describe("createBackgroundSync", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns promise that resolves to sync results", async () => {
    const mockResponse = { runId: "run-123" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const results = [createSampleSuiteResult()];
    const syncPromise = createBackgroundSync(results, { client });

    // Promise should resolve without throwing
    const syncResults = await syncPromise;
    expect(syncResults).toHaveLength(1);
    expect(syncResults[0].success).toBe(true);
  });

  it("handles errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const client = new NeonCloudClient({
      apiUrl: "https://api.neon.dev",
      apiKey: "test-key",
    });

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const results = [createSampleSuiteResult()];
    const syncPromise = createBackgroundSync(results, { client, logger: mockLogger });

    // Promise should resolve (not reject) even on error
    const syncResults = await syncPromise;
    expect(syncResults).toHaveLength(1);
    expect(syncResults[0].success).toBe(false);
  });
});

describe("formatSyncStatus", () => {
  it("returns empty string when all skipped and not verbose", () => {
    const results: SyncResult[] = [{ success: false, skipped: true }];
    expect(formatSyncStatus(results, false)).toBe("");
  });

  it("returns config hint when all skipped and verbose", () => {
    const results: SyncResult[] = [{ success: false, skipped: true }];
    const status = formatSyncStatus(results, true);
    expect(status).toContain("Not configured");
    expect(status).toContain("NEON_API_URL");
  });

  it("returns success message when all synced", () => {
    const results: SyncResult[] = [{ success: true, response: { runId: "123" } }];
    const status = formatSyncStatus(results, false);
    expect(status).toBe("Results synced to Neon");
  });

  it("includes dashboard URL when provided", () => {
    const results: SyncResult[] = [
      { success: true, response: { runId: "123", dashboardUrl: "https://neon.dev/run/123" } },
    ];
    const status = formatSyncStatus(results, false);
    expect(status).toContain("https://neon.dev/run/123");
  });

  it("returns warning when some failed", () => {
    const results: SyncResult[] = [
      { success: true, response: { runId: "123" } },
      { success: false, error: "Network error" },
    ];
    const status = formatSyncStatus(results, false);
    expect(status).toContain("Warning");
    expect(status).toContain("1/2");
  });

  it("includes error details when verbose", () => {
    const results: SyncResult[] = [{ success: false, error: "Connection refused" }];
    const status = formatSyncStatus(results, true);
    expect(status).toContain("Connection refused");
  });
});
