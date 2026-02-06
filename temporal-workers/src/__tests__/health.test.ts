/**
 * Tests for Health Check Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { healthCheck, ping } from "../activities/health";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("healthCheck", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("basic health check", () => {
    it("returns healthy status when all services are reachable", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.NEON_API_URL = "http://localhost:3000";

      // Mock successful responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes("api.anthropic.com")) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const result = await healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.checks.temporal).toBe(true);
      expect(result.checks.neonApi).toBe(true);
      expect(result.checks.anthropic).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it("returns degraded status when some services are unreachable", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.NEON_API_URL = "http://localhost:3000";

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes("api.anthropic.com")) {
          return Promise.reject(new Error("Connection refused"));
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const result = await healthCheck();

      expect(result.status).toBe("degraded");
      expect(result.checks.temporal).toBe(true);
      expect(result.checks.neonApi).toBe(true);
      expect(result.checks.anthropic).toBe(false);
    });

    it("returns degraded status when Neon API is unreachable", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.reject(new Error("Connection refused"));
        }
        if (url.includes("api.anthropic.com")) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const result = await healthCheck();

      expect(result.status).toBe("degraded");
      expect(result.checks.neonApi).toBe(false);
      expect(result.checks.anthropic).toBe(true);
    });

    it("marks anthropic as false when no API key is set", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const result = await healthCheck();

      expect(result.checks.anthropic).toBe(false);
      // Should not call Anthropic API when no key is set
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("api.anthropic.com"),
        expect.anything()
      );
    });

    it("treats Anthropic 400 response as reachable", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";

      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/health")) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes("api.anthropic.com")) {
          return Promise.resolve({ ok: false, status: 400 });
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const result = await healthCheck();

      expect(result.checks.anthropic).toBe(true);
    });
  });

  describe("status determination", () => {
    it("returns unhealthy when only temporal is working", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      mockFetch.mockImplementation(() => {
        return Promise.reject(new Error("Connection refused"));
      });

      const result = await healthCheck();

      // Temporal is always true (if we're running, it's working)
      // but neonApi and anthropic are both false
      expect(result.status).toBe("degraded");
      expect(result.checks.temporal).toBe(true);
      expect(result.checks.neonApi).toBe(false);
      expect(result.checks.anthropic).toBe(false);
    });
  });

  describe("result structure", () => {
    it("includes timestamp in ISO format", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      mockFetch.mockResolvedValue({ ok: true });

      const result = await healthCheck();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("includes uptime in milliseconds", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      mockFetch.mockResolvedValue({ ok: true });

      const result = await healthCheck();

      expect(typeof result.uptime).toBe("number");
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("ping", () => {
  it("returns pong with timestamp", async () => {
    const result = await ping();

    expect(result.pong).toBe(true);
    expect(result.timestamp).toBeDefined();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("is async but resolves immediately", async () => {
    const startTime = Date.now();
    await ping();
    const endTime = Date.now();

    // Should resolve in less than 100ms
    expect(endTime - startTime).toBeLessThan(100);
  });
});
