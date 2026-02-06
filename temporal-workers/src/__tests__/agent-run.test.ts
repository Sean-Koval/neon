/**
 * Tests for Agent Run Workflow
 *
 * Tests agentRunWorkflow and isSensitiveTool by mocking @temporalio/workflow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRunInput, LLMCallResult } from "../types";

// ============================================================================
// MOCK SETUP
// ============================================================================

const {
  handlers,
  mockLlmCall,
  mockExecuteTool,
  mockEmitSpan,
  mockScoreTrace,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockLlmCall: vi.fn(),
  mockExecuteTool: vi.fn(),
  mockEmitSpan: vi.fn().mockResolvedValue(undefined),
  mockScoreTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: vi.fn(() => ({
    llmCall: (...args: unknown[]) => mockLlmCall(...args),
    executeTool: (...args: unknown[]) => mockExecuteTool(...args),
    emitSpan: (...args: unknown[]) => mockEmitSpan(...args),
    scoreTrace: (...args: unknown[]) => mockScoreTrace(...args),
  })),
  defineSignal: vi.fn((name: string) => name),
  defineQuery: vi.fn((name: string) => name),
  setHandler: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
    handlers[name] = handler;
  }),
  condition: vi.fn(async () => true),
  workflowInfo: vi.fn(() => ({
    workflowId: "test-agent-workflow",
    runId: "test-agent-run",
  })),
}));

import { agentRunWorkflow } from "../workflows/agent-run";

// ============================================================================
// HELPERS
// ============================================================================

function makeInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    projectId: "proj-1",
    agentId: "agent-1",
    agentVersion: "v1",
    input: { query: "What is 2+2?" },
    tools: [
      { name: "calculator", description: "Math tool", parameters: {} },
    ],
    maxIterations: 10,
    requireApproval: false,
    ...overrides,
  };
}

function makeLLMResponse(overrides: Partial<LLMCallResult> = {}): LLMCallResult {
  return {
    content: "The answer is 4.",
    toolCalls: undefined,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("agentRunWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  it("happy path: LLM responds without tools", async () => {
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "The answer is 4.",
    }));

    const result = await agentRunWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(1);
    expect(result.output).toBe("The answer is 4.");
    expect(result.traceId).toContain("proj-1");

    // Should not have called executeTool
    expect(mockExecuteTool).not.toHaveBeenCalled();

    // Should have called scoreTrace
    expect(mockScoreTrace).toHaveBeenCalledTimes(1);

    // Should have emitted spans (start, iteration, complete)
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "agent-run:agent-1" })
    );
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "iteration-1" })
    );
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "agent-run-complete" })
    );
  });

  it("handles tool calls", async () => {
    // First LLM call returns tool calls
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "Let me calculate that.",
      toolCalls: [
        { id: "tc-1", name: "calculator", arguments: { expr: "2+2" } },
      ],
    }));

    // Tool execution
    mockExecuteTool.mockResolvedValueOnce({ result: 4 });

    // Second LLM call returns final answer (no tools)
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "The answer is 4.",
    }));

    const result = await agentRunWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(2);
    expect(result.output).toBe("The answer is 4.");

    // Tool should have been executed
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).toHaveBeenCalledWith({
      traceId: expect.any(String),
      toolName: "calculator",
      toolInput: { expr: "2+2" },
    });
  });

  it("handles approval flow - approved", async () => {
    // LLM wants to use a sensitive tool
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "I need to run a command.",
      toolCalls: [
        { id: "tc-1", name: "shell_execute", arguments: { cmd: "ls" } },
      ],
    }));

    mockExecuteTool.mockResolvedValueOnce({ output: "file1.txt" });

    // Second call, agent completes
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "Done! Found file1.txt.",
    }));

    // Mock condition to simulate approval being granted
    const { condition } = await import("@temporalio/workflow");
    (condition as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // Simulate the approval signal arriving
      if (handlers.approval) {
        handlers.approval(true, "Approved by admin");
      }
      return true;
    });

    const result = await agentRunWorkflow(makeInput({ requireApproval: true }));

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(2);
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);

    // Should have emitted an approval-requested span
    expect(mockEmitSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: "approval-requested" })
    );
  });

  it("handles approval flow - rejected", async () => {
    // LLM wants to use a sensitive tool
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "I need to delete a file.",
      toolCalls: [
        { id: "tc-1", name: "delete_file", arguments: { path: "/etc/hosts" } },
      ],
    }));

    // Mock condition to simulate rejection
    const { condition } = await import("@temporalio/workflow");
    (condition as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // Simulate the approval signal arriving with rejection
      if (handlers.approval) {
        handlers.approval(false, "Too dangerous");
      }
      return true;
    });

    const result = await agentRunWorkflow(makeInput({ requireApproval: true }));

    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("Too dangerous");
    expect(result.iterations).toBe(1);

    // Tool should NOT have been executed
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("handles cancellation", async () => {
    let callCount = 0;
    // First LLM call returns tool calls, triggering cancellation during the second iteration
    mockLlmCall.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return makeLLMResponse({
          content: "Still working...",
          toolCalls: [
            { id: "tc-1", name: "calculator", arguments: { expr: "1+1" } },
          ],
        });
      }
      // During second LLM call, trigger cancel
      if (handlers.cancel) {
        handlers.cancel();
      }
      return makeLLMResponse({
        content: "More work...",
        toolCalls: [
          { id: "tc-2", name: "calculator", arguments: { expr: "2+2" } },
        ],
      });
    });

    mockExecuteTool.mockResolvedValue({ result: 2 });

    const result = await agentRunWorkflow(makeInput());

    // Cancellation causes loop exit. Since iteration < maxIterations and
    // status was never set to "completed" (no empty toolCalls response),
    // the status remains "running" from the workflow's perspective.
    // The workflow code does not mark cancelled runs as "completed" unless
    // iteration >= maxIterations.
    expect(result.status).toBe("running");
    // Should have stopped iterating relatively early
    expect(result.iterations).toBeLessThanOrEqual(3);
    expect(mockScoreTrace).toHaveBeenCalledTimes(1);
  });

  it("respects max iterations", async () => {
    // LLM always returns tool calls, never finishes
    mockLlmCall.mockResolvedValue(makeLLMResponse({
      content: "Using a tool...",
      toolCalls: [
        { id: "tc-1", name: "calculator", arguments: { expr: "1+1" } },
      ],
    }));
    mockExecuteTool.mockResolvedValue({ result: 2 });

    const result = await agentRunWorkflow(makeInput({ maxIterations: 3 }));

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(3);
    expect(mockLlmCall).toHaveBeenCalledTimes(3);
  });

  it("defaults maxIterations to 10", async () => {
    mockLlmCall.mockResolvedValue(makeLLMResponse({
      content: "Using a tool...",
      toolCalls: [
        { id: "tc-1", name: "calculator", arguments: { expr: "1+1" } },
      ],
    }));
    mockExecuteTool.mockResolvedValue({ result: 2 });

    const result = await agentRunWorkflow(makeInput({ maxIterations: undefined }));

    expect(result.iterations).toBe(10);
    expect(mockLlmCall).toHaveBeenCalledTimes(10);
  });

  it("exposes status and progress via query handlers", async () => {
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
      content: "Done.",
    }));

    await agentRunWorkflow(makeInput());

    // Query handlers should be registered
    expect(handlers.status).toBeDefined();
    expect(handlers.progress).toBeDefined();

    const progress = handlers.progress() as { iteration: number; maxIterations: number };
    expect(progress.iteration).toBe(1);
    expect(progress.maxIterations).toBe(10);
  });

  it("builds correct traceId from projectId and workflowId", async () => {
    mockLlmCall.mockResolvedValueOnce(makeLLMResponse({ content: "Done." }));

    const result = await agentRunWorkflow(makeInput({ projectId: "my-project" }));

    expect(result.traceId).toBe("trace-my-project-test-agent-workflow");
  });

  it("handles multiple tool calls in a single response", async () => {
    mockLlmCall
      .mockResolvedValueOnce(makeLLMResponse({
        content: "Running two tools.",
        toolCalls: [
          { id: "tc-1", name: "calculator", arguments: { expr: "2+2" } },
          { id: "tc-2", name: "calculator", arguments: { expr: "3+3" } },
        ],
      }))
      .mockResolvedValueOnce(makeLLMResponse({
        content: "Results: 4 and 6.",
      }));

    mockExecuteTool
      .mockResolvedValueOnce({ result: 4 })
      .mockResolvedValueOnce({ result: 6 });

    const result = await agentRunWorkflow(makeInput());

    expect(result.status).toBe("completed");
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
  });
});

describe("isSensitiveTool (tested via agentRunWorkflow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
  });

  const sensitiveCases = [
    "delete_file",
    "remove_user",
    "drop_table",
    "destroy_resource",
    "execute_command",
    "run_script",
    "shell_exec",
    "bash_command",
    "sudo_action",
    "admin_panel",
    "payment_process",
    "transfer_funds",
    "send_email",
    "publish_post",
    "destructive_cleanup",
  ];

  for (const toolName of sensitiveCases) {
    it(`detects '${toolName}' as sensitive`, async () => {
      mockLlmCall.mockResolvedValueOnce(makeLLMResponse({
        content: "Using tool.",
        toolCalls: [{ id: "tc-1", name: toolName, arguments: {} }],
      }));

      // Rejection simulates that approval was requested
      const { condition } = await import("@temporalio/workflow");
      (condition as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        if (handlers.approval) {
          handlers.approval(false, "Denied");
        }
        return true;
      });

      const result = await agentRunWorkflow(
        makeInput({ requireApproval: true })
      );

      // If tool is sensitive, the workflow should enter approval flow and get rejected
      expect(result.status).toBe("rejected");
    });
  }

  const safeCases = ["calculator", "search", "read_file", "list_items", "get_weather"];

  for (const toolName of safeCases) {
    it(`allows '${toolName}' without approval`, async () => {
      mockLlmCall
        .mockResolvedValueOnce(makeLLMResponse({
          content: "Using tool.",
          toolCalls: [{ id: "tc-1", name: toolName, arguments: {} }],
        }))
        .mockResolvedValueOnce(makeLLMResponse({ content: "Done." }));

      mockExecuteTool.mockResolvedValueOnce({ result: "ok" });

      const result = await agentRunWorkflow(
        makeInput({ requireApproval: true })
      );

      // Safe tools should not trigger approval, workflow should complete
      expect(result.status).toBe("completed");
    });
  }
});
