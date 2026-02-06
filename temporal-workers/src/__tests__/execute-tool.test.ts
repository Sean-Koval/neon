/**
 * Tests for Execute Tool Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executeTool,
  registerTool,
  hasTool,
  executeMCPTool,
} from "../activities/execute-tool";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
vi.mock("crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

describe("executeTool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock emitSpan calls (successful)
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe("built-in tools", () => {
    it("executes echo tool and returns input", async () => {
      const result = await executeTool({
        traceId: "trace-test-123",
        toolName: "echo",
        toolInput: { message: "hello world" },
      });

      expect(result).toEqual({ message: "hello world" });
    });

    it("executes sleep tool and waits", async () => {
      const startTime = Date.now();
      const result = await executeTool({
        traceId: "trace-test-123",
        toolName: "sleep",
        toolInput: { ms: 50 },
      });
      const endTime = Date.now();

      expect(result).toEqual({ slept: 50 });
      expect(endTime - startTime).toBeGreaterThanOrEqual(45);
    });

    it("executes sleep tool with default duration", async () => {
      const result = await executeTool({
        traceId: "trace-test-123",
        toolName: "sleep",
        toolInput: {},
      });

      expect(result).toEqual({ slept: 1000 });
    }, 2000);

    it("executes http_get tool", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        // Distinguish between span emission and actual HTTP calls
        if (url.includes("/api/spans")) {
          return Promise.resolve({ ok: true });
        }
        if (options?.method === "GET" || !options?.method) {
          return Promise.resolve({
            status: 200,
            text: () => Promise.resolve('{"data": "test"}'),
          });
        }
        return Promise.reject(new Error("Unknown request"));
      });

      const result = await executeTool({
        traceId: "trace-test-123",
        toolName: "http_get",
        toolInput: { url: "https://api.example.com/test" },
      });

      expect(result).toEqual({
        status: 200,
        body: '{"data": "test"}',
      });
    });

    it("executes http_post tool", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes("/api/spans")) {
          return Promise.resolve({ ok: true });
        }
        if (options?.method === "POST" && url === "https://api.example.com/test") {
          return Promise.resolve({
            status: 201,
            text: () => Promise.resolve('{"created": true}'),
          });
        }
        return Promise.reject(new Error("Unknown request"));
      });

      const result = await executeTool({
        traceId: "trace-test-123",
        toolName: "http_post",
        toolInput: {
          url: "https://api.example.com/test",
          body: { name: "test" },
        },
      });

      expect(result).toEqual({
        status: 201,
        body: '{"created": true}',
      });
    });
  });

  describe("error handling", () => {
    it("throws error for unknown tool", async () => {
      await expect(
        executeTool({
          traceId: "trace-test-123",
          toolName: "unknown_tool",
          toolInput: {},
        })
      ).rejects.toThrow("Tool not found: unknown_tool");
    });

    it("emits error span when tool execution fails", async () => {
      // Register a failing tool
      registerTool("failing_tool", async () => {
        throw new Error("Tool execution failed");
      });

      await expect(
        executeTool({
          traceId: "trace-test-123",
          toolName: "failing_tool",
          toolInput: {},
        })
      ).rejects.toThrow("Tool execution failed");

      // Verify error span was emitted
      const spanCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/spans")
      );
      expect(spanCall).toBeDefined();
    });
  });

  describe("span emission", () => {
    it("emits success span with correct data", async () => {
      await executeTool({
        traceId: "trace-test-123",
        toolName: "echo",
        toolInput: { msg: "test" },
      });

      // Find the span emission call
      const spanCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/spans")
      );
      expect(spanCall).toBeDefined();

      const body = JSON.parse(spanCall![1]?.body as string);
      expect(body.trace_id).toBe("trace-test-123");
      expect(body.span_type).toBe("tool");
      expect(body.status).toBe("ok");
      expect(body.tool_name).toBe("echo");
    });
  });
});

describe("registerTool", () => {
  it("registers a custom tool that can be executed", async () => {
    registerTool("custom_tool", async (input) => {
      return { doubled: (input.value as number) * 2 };
    });

    mockFetch.mockResolvedValue({ ok: true });

    const result = await executeTool({
      traceId: "trace-test-123",
      toolName: "custom_tool",
      toolInput: { value: 5 },
    });

    expect(result).toEqual({ doubled: 10 });
  });

  it("overwrites existing tool with same name", async () => {
    registerTool("overwrite_test", async () => ({ version: 1 }));
    registerTool("overwrite_test", async () => ({ version: 2 }));

    mockFetch.mockResolvedValue({ ok: true });

    const result = await executeTool({
      traceId: "trace-test-123",
      toolName: "overwrite_test",
      toolInput: {},
    });

    expect(result).toEqual({ version: 2 });
  });
});

describe("hasTool", () => {
  it("returns true for built-in tools", () => {
    expect(hasTool("echo")).toBe(true);
    expect(hasTool("sleep")).toBe(true);
    expect(hasTool("http_get")).toBe(true);
    expect(hasTool("http_post")).toBe(true);
  });

  it("returns false for unknown tools", () => {
    expect(hasTool("nonexistent_tool")).toBe(false);
  });

  it("returns true for registered custom tools", () => {
    registerTool("my_custom_tool", async () => ({}));
    expect(hasTool("my_custom_tool")).toBe(true);
  });
});

describe("executeMCPTool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls MCP server with correct URL and body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: "success" }),
    });

    const result = await executeMCPTool(
      "http://mcp-server:8080",
      "search",
      { query: "test" }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://mcp-server:8080/tools/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test" }),
      }
    );
    expect(result).toEqual({ result: "success" });
  });

  it("throws error when MCP server returns error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Tool not found"),
    });

    await expect(
      executeMCPTool("http://mcp-server:8080", "unknown", {})
    ).rejects.toThrow("MCP tool execution failed: Tool not found");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    await expect(
      executeMCPTool("http://mcp-server:8080", "search", {})
    ).rejects.toThrow("Connection refused");
  });
});
