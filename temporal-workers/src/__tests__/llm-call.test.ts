/**
 * Tests for LLM Call Activity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { llmCall, estimateCost } from "../activities/llm-call";
import type { LLMCallParams } from "../types";

// Mock the Anthropic SDK
const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockAnthropicCreate };
    },
  };
});

// Mock fetch for span emission
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("llmCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe("basic LLM calls", () => {
    it("makes a successful LLM call and returns content", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "Hello! How can I help you?" }],
        usage: { input_tokens: 10, output_tokens: 15 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Hello" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      const result = await llmCall(params);

      expect(result.content).toBe("Hello! How can I help you?");
      expect(result.toolCalls).toBeUndefined();
    });

    it("handles multiple text blocks in response", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          { type: "text", text: "First part. " },
          { type: "text", text: "Second part." },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Test" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      const result = await llmCall(params);

      expect(result.content).toBe("First part. \nSecond part.");
    });

    it("extracts tool calls from response", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          { type: "text", text: "I'll search for that." },
          {
            type: "tool_use",
            id: "tool-123",
            name: "search",
            input: { query: "test query" },
          },
        ],
        usage: { input_tokens: 20, output_tokens: 30 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Search for something" }],
        tools: [
          {
            name: "search",
            description: "Search the web",
            parameters: { type: "object", properties: {} },
          },
        ],
        model: "claude-3-sonnet-20240229",
      };

      const result = await llmCall(params);

      expect(result.content).toBe("I'll search for that.");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: "tool-123",
        name: "search",
        arguments: { query: "test query" },
      });
    });

    it("handles multiple tool calls", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "search",
            input: { query: "first" },
          },
          {
            type: "tool_use",
            id: "tool-2",
            name: "analyze",
            input: { data: "result" },
          },
        ],
        usage: { input_tokens: 30, output_tokens: 40 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Search and analyze" }],
        tools: [
          { name: "search", description: "Search", parameters: {} },
          { name: "analyze", description: "Analyze", parameters: {} },
        ],
        model: "claude-3-sonnet-20240229",
      };

      const result = await llmCall(params);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].name).toBe("search");
      expect(result.toolCalls![1].name).toBe("analyze");
    });
  });

  describe("message conversion", () => {
    it("converts tool result messages correctly", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "Got it!" }],
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [
          { role: "user", content: "Call the tool" },
          { role: "assistant", content: "Calling search..." },
          { role: "tool", content: "Search results: ..." , toolCallId: "tool-abc" },
        ],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      await llmCall(params);

      const createCall = mockAnthropicCreate.mock.calls[0][0];
      expect(createCall.messages[2]).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-abc",
            content: "Search results: ...",
          },
        ],
      });
    });
  });

  describe("span emission", () => {
    it("emits success span with token counts", async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "Response" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Test" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      await llmCall(params);

      const spanCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/spans")
      );
      expect(spanCall).toBeDefined();

      const body = JSON.parse(spanCall![1].body);
      expect(body).toMatchObject({
        span_type: "generation",
        model: "claude-3-sonnet-20240229",
        input_tokens: 100,
        output_tokens: 50,
        status: "ok",
      });
    });

    it("emits error span on failure", async () => {
      mockAnthropicCreate.mockRejectedValue(new Error("API rate limit exceeded"));

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Test" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      await expect(llmCall(params)).rejects.toThrow("API rate limit exceeded");

      const spanCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/spans")
      );
      expect(spanCall).toBeDefined();

      const body = JSON.parse(spanCall![1].body);
      expect(body.status).toBe("error");
      expect(body.status_message).toBe("API rate limit exceeded");
    });
  });

  describe("error handling", () => {
    it("re-throws errors for Temporal retry handling", async () => {
      mockAnthropicCreate.mockRejectedValue(new Error("Network error"));

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Test" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      await expect(llmCall(params)).rejects.toThrow("Network error");
    });

    it("handles unknown error types", async () => {
      mockAnthropicCreate.mockRejectedValue("String error");

      const params: LLMCallParams = {
        traceId: "trace-project1-12345",
        messages: [{ role: "user", content: "Test" }],
        tools: [],
        model: "claude-3-sonnet-20240229",
      };

      await expect(llmCall(params)).rejects.toBe("String error");

      const spanCall = mockFetch.mock.calls.find(
        (call) => (call[0] as string).includes("/api/spans")
      );
      const body = JSON.parse(spanCall![1].body);
      expect(body.status_message).toBe("Unknown error");
    });
  });
});

describe("estimateCost", () => {
  it("estimates cost for claude-3-5-sonnet", () => {
    const cost = estimateCost("claude-3-5-sonnet", 1000000, 500000);
    
    // $3 per 1M input + $7.50 per 500K output = $10.50
    expect(cost).toBeCloseTo(3 + 7.5, 2);
  });

  it("estimates cost for claude-3-opus", () => {
    const cost = estimateCost("claude-3-opus", 1000000, 1000000);
    
    // $15 per 1M input + $75 per 1M output = $90
    expect(cost).toBeCloseTo(15 + 75, 2);
  });

  it("estimates cost for claude-3-haiku", () => {
    const cost = estimateCost("claude-3-haiku", 10000000, 5000000);
    
    // $2.50 per 10M input + $6.25 per 5M output = $8.75
    expect(cost).toBeCloseTo(2.5 + 6.25, 2);
  });

  it("estimates cost for gpt-4-turbo", () => {
    const cost = estimateCost("gpt-4-turbo", 1000000, 1000000);
    
    // $10 per 1M input + $30 per 1M output = $40
    expect(cost).toBeCloseTo(10 + 30, 2);
  });

  it("estimates cost for gpt-4o", () => {
    const cost = estimateCost("gpt-4o", 1000000, 1000000);
    
    // $5 per 1M input + $15 per 1M output = $20
    expect(cost).toBeCloseTo(5 + 15, 2);
  });

  it("estimates cost for gpt-4o-mini", () => {
    const cost = estimateCost("gpt-4o-mini", 1000000, 1000000);
    
    // $0.15 per 1M input + $0.60 per 1M output = $0.75
    expect(cost).toBeCloseTo(0.15 + 0.60, 2);
  });

  it("uses default pricing for unknown models", () => {
    const cost = estimateCost("unknown-model", 1000000, 1000000);
    
    // Default: $1 per 1M input + $3 per 1M output = $4
    expect(cost).toBeCloseTo(1 + 3, 2);
  });

  it("handles zero tokens", () => {
    const cost = estimateCost("claude-3-sonnet", 0, 0);
    expect(cost).toBe(0);
  });

  it("handles small token counts", () => {
    const cost = estimateCost("claude-3-haiku", 100, 50);
    
    // Very small cost
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.001);
  });
});
