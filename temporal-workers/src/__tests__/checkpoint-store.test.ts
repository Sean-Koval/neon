import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("captureAgentCheckpoint", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEON_API_URL = "http://localhost:3000";
    process.env.NEON_API_KEY = "ae_dev_test";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEON_API_KEY;
  });

  it("persists a checkpoint through the Neon API and returns a snapshot reference", async () => {
    const { captureAgentCheckpoint } = await import("../activities/checkpoint-store");

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        manifest: {
          format: "neon.checkpoint.v1",
          checkpointId: "checkpoint-1",
          snapshotId: "checkpoint-1",
          name: "iteration-1",
          stateType: "agent_run",
          payload: {
            kind: "uri",
            uri: "/api/checkpoints/checkpoint-1",
          },
          runtime: {
            projectId: "proj-1",
            traceId: "trace-1",
          },
          restore: {
            mode: "replay",
            target: "workflow",
            requiresApproval: false,
            replaysSideEffects: true,
          },
          integrity: {
            schemaVersion: "1",
            contentHash: "sha256:abc",
          },
        },
        envelope: {
          format: "neon.checkpoint-body.v1",
          kind: "agent_run",
          checkpointId: "checkpoint-1",
          traceId: "trace-1",
          projectId: "proj-1",
          agentId: "agent-1",
          capturedAt: "2026-03-30T00:00:00.000Z",
          state: {
            iteration: 1,
            maxIterations: 10,
            status: "running",
            messages: [],
            requireApproval: false,
            tools: [],
          },
          input: { query: "What is 2+2?" },
        },
      }),
    });

    const result = await captureAgentCheckpoint({
      projectId: "proj-1",
      traceId: "trace-1",
      agentId: "agent-1",
      agentVersion: "v1",
      input: { query: "What is 2+2?" },
      state: {
        iteration: 1,
        maxIterations: 10,
        status: "running",
        messages: [],
        requireApproval: false,
        tools: [],
      },
      manifest: {
        format: "neon.checkpoint.v1",
        checkpointId: "checkpoint-1",
        snapshotId: "checkpoint-1",
        name: "iteration-1",
        stateType: "agent_run",
        runtime: {
          projectId: "proj-1",
          traceId: "trace-1",
        },
        restore: {
          mode: "replay",
          target: "workflow",
          requiresApproval: false,
          replaysSideEffects: true,
        },
        integrity: {
          schemaVersion: "1",
        },
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/checkpoints",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-workspace-id": "proj-1",
          "x-api-key": "ae_dev_test",
        }),
      })
    );
    expect(result.snapshot.snapshotId).toBe("checkpoint-1");
    expect(result.snapshot.uri).toBe("/api/checkpoints/checkpoint-1");
    expect(result.snapshot.checkpoint?.checkpointId).toBe("checkpoint-1");
  });
});
