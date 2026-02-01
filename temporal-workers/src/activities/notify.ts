/**
 * Notification Activities
 *
 * Send notifications via Slack, webhooks, and other channels.
 */

/**
 * Slack message attachment for rich formatting
 */
interface SlackAttachment {
  color: string;
  title: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

/**
 * Slack message payload
 */
interface SlackMessage {
  text?: string;
  attachments?: SlackAttachment[];
  blocks?: unknown[];
}

/**
 * Notification configuration
 */
export interface NotifyConfig {
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Generic webhook URL */
  webhookUrl?: string;
  /** Dashboard URL for linking to results */
  dashboardUrl?: string;
  /** Whether to send on success */
  notifyOnSuccess?: boolean;
  /** Whether to send on failure (default: true) */
  notifyOnFailure?: boolean;
  /** Score threshold below which to notify */
  scoreThreshold?: number;
}

/**
 * Eval run result for notification
 */
export interface EvalRunResult {
  runId: string;
  projectId: string;
  agentId: string;
  agentVersion?: string;
  total: number;
  passed: number;
  failed: number;
  avgScore: number;
  duration: number;
  scores?: Array<{
    name: string;
    value: number;
    reason?: string;
  }>;
  regressions?: Array<{
    caseName: string;
    scorer: string;
    delta: number;
  }>;
}

/**
 * Get status color for Slack
 */
function getStatusColor(passed: number, total: number, avgScore: number): string {
  if (total === 0) return "#808080"; // Gray for no results
  if (passed === total && avgScore >= 0.8) return "#36a64f"; // Green
  if (avgScore >= 0.6) return "#f2c744"; // Yellow
  return "#dc3545"; // Red
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms >= 60000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Build Slack message for eval run result
 */
function buildSlackMessage(
  result: EvalRunResult,
  config: NotifyConfig
): SlackMessage {
  const passRate = result.total > 0 ? (result.passed / result.total) * 100 : 0;
  const color = getStatusColor(result.passed, result.total, result.avgScore);

  const status = result.failed === 0 ? "Passed" : `${result.failed} Failed`;
  const emoji = result.failed === 0 ? ":white_check_mark:" : ":x:";

  const fields: SlackAttachment["fields"] = [
    {
      title: "Pass Rate",
      value: `${passRate.toFixed(1)}%`,
      short: true,
    },
    {
      title: "Avg Score",
      value: result.avgScore.toFixed(2),
      short: true,
    },
    {
      title: "Results",
      value: `${result.passed}/${result.total} passed`,
      short: true,
    },
    {
      title: "Duration",
      value: formatDuration(result.duration),
      short: true,
    },
  ];

  // Add regressions if any
  if (result.regressions && result.regressions.length > 0) {
    const regressionsText = result.regressions
      .slice(0, 5)
      .map((r) => `\u2022 ${r.caseName} (${r.scorer}): ${(r.delta * 100).toFixed(1)}%`)
      .join("\n");
    fields.push({
      title: `Regressions (${result.regressions.length})`,
      value: regressionsText,
      short: false,
    });
  }

  const title = `${emoji} Eval Run ${status}: ${result.agentId}`;
  const titleLink = config.dashboardUrl
    ? `${config.dashboardUrl}/eval-runs/${result.runId}`
    : undefined;

  return {
    attachments: [
      {
        color,
        title,
        title_link: titleLink,
        text: result.agentVersion
          ? `Version: ${result.agentVersion}`
          : undefined,
        fields,
        footer: "Neon Agent Ops",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Send notification to Slack
 */
export async function sendSlackNotification(
  result: EvalRunResult,
  config: NotifyConfig
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = config.slackWebhookUrl;

  if (!webhookUrl) {
    return { success: false, error: "No Slack webhook URL configured" };
  }

  // Check if we should notify
  const shouldNotify =
    (result.failed > 0 && config.notifyOnFailure !== false) ||
    (result.failed === 0 && config.notifyOnSuccess) ||
    (config.scoreThreshold !== undefined && result.avgScore < config.scoreThreshold);

  if (!shouldNotify) {
    return { success: true };
  }

  try {
    const message = buildSlackMessage(result, config);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Slack API error: ${response.status} ${text}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send notification to a generic webhook
 */
export async function sendWebhookNotification(
  result: EvalRunResult,
  config: NotifyConfig
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = config.webhookUrl;

  if (!webhookUrl) {
    return { success: false, error: "No webhook URL configured" };
  }

  // Check if we should notify
  const shouldNotify =
    (result.failed > 0 && config.notifyOnFailure !== false) ||
    (result.failed === 0 && config.notifyOnSuccess) ||
    (config.scoreThreshold !== undefined && result.avgScore < config.scoreThreshold);

  if (!shouldNotify) {
    return { success: true };
  }

  try {
    const payload = {
      event: "eval_run_completed",
      timestamp: new Date().toISOString(),
      runId: result.runId,
      projectId: result.projectId,
      agentId: result.agentId,
      agentVersion: result.agentVersion,
      results: {
        total: result.total,
        passed: result.passed,
        failed: result.failed,
        avgScore: result.avgScore,
        duration: result.duration,
      },
      regressions: result.regressions,
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `Webhook error: ${response.status} ${text}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send notifications to all configured channels
 */
export async function sendNotifications(
  result: EvalRunResult,
  config: NotifyConfig
): Promise<{ slack?: { success: boolean; error?: string }; webhook?: { success: boolean; error?: string } }> {
  const results: {
    slack?: { success: boolean; error?: string };
    webhook?: { success: boolean; error?: string };
  } = {};

  // Send to Slack if configured
  if (config.slackWebhookUrl) {
    results.slack = await sendSlackNotification(result, config);
  }

  // Send to generic webhook if configured
  if (config.webhookUrl) {
    results.webhook = await sendWebhookNotification(result, config);
  }

  return results;
}

// Export activities for Temporal
export const notifyActivities = {
  sendSlackNotification,
  sendWebhookNotification,
  sendNotifications,
};
