/**
 * Tests for Notification Activities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendSlackNotification,
  sendWebhookNotification,
  sendNotifications,
  type NotifyConfig,
  type EvalRunResult,
} from "../activities/notify";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("sendSlackNotification", () => {
  const baseResult: EvalRunResult = {
    runId: "run-123",
    projectId: "project-1",
    agentId: "agent-test",
    agentVersion: "1.0.0",
    total: 10,
    passed: 8,
    failed: 2,
    avgScore: 0.85,
    duration: 5000,
  };

  const baseConfig: NotifyConfig = {
    slackWebhookUrl: "https://hooks.slack.com/services/xxx/yyy/zzz",
    dashboardUrl: "https://dashboard.example.com",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("notification triggering", () => {
    it("sends notification when there are failures", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await sendSlackNotification(baseResult, baseConfig);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not send notification on success by default", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const successResult = { ...baseResult, passed: 10, failed: 0 };
      const result = await sendSlackNotification(successResult, baseConfig);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends notification on success when notifyOnSuccess is true", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const successResult = { ...baseResult, passed: 10, failed: 0 };
      const config = { ...baseConfig, notifyOnSuccess: true };

      const result = await sendSlackNotification(successResult, config);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not send on failure when notifyOnFailure is false", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const config = { ...baseConfig, notifyOnFailure: false };
      const result = await sendSlackNotification(baseResult, config);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends notification when score is below threshold", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const successResult = { ...baseResult, passed: 10, failed: 0, avgScore: 0.6 };
      const config = { ...baseConfig, scoreThreshold: 0.8 };

      const result = await sendSlackNotification(successResult, config);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("message formatting", () => {
    it("formats message with correct structure", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await sendSlackNotification(baseResult, baseConfig);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.attachments).toBeDefined();
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].title).toContain("agent-test");
      expect(body.attachments[0].fields).toBeDefined();
    });

    it("includes pass rate in message", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await sendSlackNotification(baseResult, baseConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const passRateField = body.attachments[0].fields.find(
        (f: any) => f.title === "Pass Rate"
      );

      expect(passRateField).toBeDefined();
      expect(passRateField.value).toBe("80.0%");
    });

    it("includes duration in human-readable format", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const longResult = { ...baseResult, duration: 125000 };
      await sendSlackNotification(longResult, baseConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const durationField = body.attachments[0].fields.find(
        (f: any) => f.title === "Duration"
      );

      expect(durationField.value).toBe("2m 5s");
    });

    it("includes regressions when present", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const resultWithRegressions = {
        ...baseResult,
        regressions: [
          { caseName: "test-case-1", scorer: "accuracy", delta: -0.15 },
          { caseName: "test-case-2", scorer: "latency", delta: -0.20 },
        ],
      };

      await sendSlackNotification(resultWithRegressions, baseConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const regressionsField = body.attachments[0].fields.find(
        (f: any) => f.title.includes("Regressions")
      );

      expect(regressionsField).toBeDefined();
      expect(regressionsField.value).toContain("test-case-1");
    });

    it("uses green color for all passing with high score", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const successResult = {
        ...baseResult,
        passed: 10,
        failed: 0,
        avgScore: 0.95,
      };
      const config = { ...baseConfig, notifyOnSuccess: true };

      await sendSlackNotification(successResult, config);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.attachments[0].color).toBe("#36a64f");
    });

    it("uses yellow color for moderate score", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const moderateResult = {
        ...baseResult,
        passed: 7,
        failed: 3,
        avgScore: 0.70,
      };

      await sendSlackNotification(moderateResult, baseConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.attachments[0].color).toBe("#f2c744");
    });

    it("uses red color for low score", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const failResult = {
        ...baseResult,
        passed: 3,
        failed: 7,
        avgScore: 0.30,
      };

      await sendSlackNotification(failResult, baseConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.attachments[0].color).toBe("#dc3545");
    });
  });

  describe("error handling", () => {
    it("returns error when no webhook URL configured", async () => {
      const result = await sendSlackNotification(baseResult, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("No Slack webhook URL configured");
    });

    it("returns error on Slack API failure", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      });

      const result = await sendSlackNotification(baseResult, baseConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Slack API error");
    });

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network timeout"));

      const result = await sendSlackNotification(baseResult, baseConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network timeout");
    });
  });
});

describe("sendWebhookNotification", () => {
  const baseResult: EvalRunResult = {
    runId: "run-123",
    projectId: "project-1",
    agentId: "agent-test",
    agentVersion: "1.0.0",
    total: 10,
    passed: 8,
    failed: 2,
    avgScore: 0.85,
    duration: 5000,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends webhook with correct payload", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const config: NotifyConfig = {
      webhookUrl: "https://webhook.example.com/notify",
    };

    await sendWebhookNotification(baseResult, config);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://webhook.example.com/notify");

    const body = JSON.parse(callArgs[1].body);
    expect(body.event).toBe("eval_run_completed");
    expect(body.runId).toBe("run-123");
    expect(body.agentId).toBe("agent-test");
    expect(body.results.total).toBe(10);
    expect(body.results.passed).toBe(8);
    expect(body.results.avgScore).toBe(0.85);
  });

  it("returns error when no webhook URL configured", async () => {
    const result = await sendWebhookNotification(baseResult, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("No webhook URL configured");
  });

  it("respects notification conditions", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const successResult = { ...baseResult, passed: 10, failed: 0 };
    const config: NotifyConfig = { webhookUrl: "https://example.com" };

    const result = await sendWebhookNotification(successResult, config);

    expect(result.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles webhook errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    const config: NotifyConfig = {
      webhookUrl: "https://webhook.example.com",
    };

    const result = await sendWebhookNotification(baseResult, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Webhook error");
  });
});

describe("sendNotifications", () => {
  const baseResult: EvalRunResult = {
    runId: "run-123",
    projectId: "project-1",
    agentId: "agent-test",
    total: 5,
    passed: 3,
    failed: 2,
    avgScore: 0.75,
    duration: 3000,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("sends to both Slack and webhook when configured", async () => {
    const config: NotifyConfig = {
      slackWebhookUrl: "https://hooks.slack.com/xxx",
      webhookUrl: "https://webhook.example.com",
    };

    const results = await sendNotifications(baseResult, config);

    expect(results.slack?.success).toBe(true);
    expect(results.webhook?.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("only sends to Slack when only Slack is configured", async () => {
    const config: NotifyConfig = {
      slackWebhookUrl: "https://hooks.slack.com/xxx",
    };

    const results = await sendNotifications(baseResult, config);

    expect(results.slack?.success).toBe(true);
    expect(results.webhook).toBeUndefined();
  });

  it("only sends to webhook when only webhook is configured", async () => {
    const config: NotifyConfig = {
      webhookUrl: "https://webhook.example.com",
    };

    const results = await sendNotifications(baseResult, config);

    expect(results.slack).toBeUndefined();
    expect(results.webhook?.success).toBe(true);
  });

  it("returns empty object when no channels configured", async () => {
    const results = await sendNotifications(baseResult, {});

    expect(results).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles partial failures", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Error"),
      });

    const config: NotifyConfig = {
      slackWebhookUrl: "https://hooks.slack.com/xxx",
      webhookUrl: "https://webhook.example.com",
    };

    const results = await sendNotifications(baseResult, config);

    expect(results.slack?.success).toBe(true);
    expect(results.webhook?.success).toBe(false);
  });
});
