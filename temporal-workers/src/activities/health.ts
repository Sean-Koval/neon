/**
 * Health Check Activity
 *
 * Provides health check capabilities for the Temporal worker.
 */

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    temporal: boolean;
    neonApi: boolean;
    anthropic: boolean;
  };
  timestamp: string;
  uptime: number;
}

const startTime = Date.now();

/**
 * Check worker health
 *
 * Verifies connectivity to external services:
 * - Neon API (ClickHouse via Next.js)
 * - Anthropic API
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const checks = {
    temporal: true, // If we're running, Temporal is working
    neonApi: false,
    anthropic: false,
  };

  // Check Neon API connectivity
  const neonApiUrl = process.env.NEON_API_URL || "http://localhost:3000";
  try {
    const response = await fetch(`${neonApiUrl}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    checks.neonApi = response.ok;
  } catch {
    // API not reachable - might be OK during development
    checks.neonApi = false;
  }

  // Check Anthropic API (if key is set)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      // 200 or 400 (bad request) means API is reachable
      checks.anthropic = response.ok || response.status === 400;
    } catch {
      checks.anthropic = false;
    }
  } else {
    // No API key configured
    checks.anthropic = false;
  }

  // Determine overall status
  const allHealthy = checks.temporal && checks.neonApi && checks.anthropic;
  const anyHealthy = checks.temporal || checks.neonApi || checks.anthropic;

  let status: HealthCheckResult["status"];
  if (allHealthy) {
    status = "healthy";
  } else if (anyHealthy) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
  };
}

/**
 * Simple ping activity to verify worker is responsive
 */
export async function ping(): Promise<{ pong: true; timestamp: string }> {
  return {
    pong: true,
    timestamp: new Date().toISOString(),
  };
}
