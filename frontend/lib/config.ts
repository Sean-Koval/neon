/**
 * Centralized configuration constants for the frontend application.
 * Replaces magic numbers scattered throughout components and hooks.
 */
export const CONFIG = {
  /** Score threshold for pass/fail visualization on the dashboard */
  DASHBOARD_SCORE_THRESHOLD: 0.7,

  /** How long React Query caches dashboard data (ms) */
  DASHBOARD_CACHE_TIME_MS: 10_000,

  /** Polling interval for active run status checks (ms) */
  REALTIME_POLLING_INTERVAL_MS: 2000,

  /** WebSocket ping interval to keep connection alive (ms) */
  REALTIME_PING_INTERVAL_MS: 30_000,

  /** Maximum reconnection attempts before falling back to polling */
  REALTIME_MAX_RECONNECT_ATTEMPTS: 3,

  /** Delay before first reconnection attempt (ms); doubles with each retry */
  REALTIME_RECONNECT_DELAY_MS: 1000,

  /** Duration before toast notifications auto-dismiss (ms) */
  TOAST_AUTO_DISMISS_MS: 5000,
} as const
