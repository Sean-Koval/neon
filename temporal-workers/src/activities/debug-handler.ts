/**
 * Debug Handler Activity
 *
 * Temporal activity for handling debug operations including:
 * - Debug session management (pause/resume)
 * - Breakpoint evaluation
 * - Step-through execution control
 * - Debug event notification
 *
 * ⚠️  DEVELOPMENT ONLY WARNING ⚠️
 * This implementation uses in-memory storage which WILL NOT WORK in production.
 * For production use, you MUST:
 * 1. Replace debugSessions Map with Redis or similar distributed store
 * 2. Replace resumeResolvers with a pub/sub mechanism (Redis, etc.)
 * 3. Add proper authentication and authorization
 *
 * The in-memory implementation is suitable for:
 * - Local development
 * - Single-instance deployments
 * - Testing and demos
 */

import type { Span, SpanType, Trace } from "@neon/shared";

// Use NEON_API_URL to point to the Next.js frontend API
const NEON_API_URL = process.env.NEON_API_URL || "http://localhost:3000";

// Log warning on module load
console.warn(
  "[debug-handler] ⚠️  Using in-memory debug session storage. " +
  "This is for DEVELOPMENT ONLY and will not work with multiple workers or restarts."
);

// ============================================================================
// Types
// ============================================================================

/**
 * Debug session state
 */
export type DebugState = "running" | "paused" | "stepping" | "completed";

/**
 * Step mode for step-through debugging
 */
export type StepMode = "over" | "into" | "out" | null;

/**
 * Serializable breakpoint definition for debug evaluation
 * Note: Uses string patterns instead of RegExp for JSON serialization
 */
export interface DebugBreakpoint {
  id: string;
  name?: string;
  enabled: boolean;
  spanType?: SpanType | SpanType[];
  /** Exact match or glob pattern (use * for wildcards) */
  spanName?: string;
  /** Exact match or glob pattern */
  toolName?: string;
  /** Exact match or glob pattern */
  model?: string;
  status?: "ok" | "error" | "unset";
  trigger: "onEnter" | "onExit" | "onError";
  hitCondition?: "always" | number | { every: number } | { after: number };
}

/**
 * Debug session configuration
 */
export interface DebugSession {
  traceId: string;
  projectId: string;
  state: DebugState;
  currentSpanId: string | null;
  stepMode: StepMode;
  stepTargetDepth: number | null;
  breakpoints: DebugBreakpoint[];
  hitCounts: Record<string, number>;
  pausedAt: Date | null;
  createdAt: Date;
}

/**
 * Parameters for initializing a debug session
 */
export interface InitDebugSessionParams {
  traceId: string;
  projectId: string;
  breakpoints?: DebugBreakpoint[];
}

/**
 * Parameters for evaluating a breakpoint
 */
export interface EvaluateBreakpointParams {
  traceId: string;
  span: Span;
  trigger: "onEnter" | "onExit" | "onError";
}

/**
 * Result of breakpoint evaluation
 */
export interface BreakpointEvalResult {
  shouldPause: boolean;
  matchedBreakpoints: DebugBreakpoint[];
  hitCounts: Record<string, number>;
}

/**
 * Parameters for debug control commands
 */
export interface DebugControlParams {
  traceId: string;
  command: "resume" | "stepOver" | "stepInto" | "stepOut" | "pause";
  currentSpanDepth?: number;
}

/**
 * Debug event for notification
 */
export interface DebugEvent {
  type:
    | "sessionStarted"
    | "breakpointHit"
    | "paused"
    | "resumed"
    | "stepCompleted"
    | "sessionEnded";
  traceId: string;
  timestamp: string;
  payload: {
    span?: Span;
    trace?: Trace;
    breakpoint?: DebugBreakpoint;
    state?: DebugState;
    message?: string;
  };
}

// ============================================================================
// In-Memory Session Store (DEVELOPMENT ONLY)
// ============================================================================

/**
 * ⚠️  DEV ONLY: In-memory store for debug sessions
 * Replace with Redis in production!
 */
const debugSessions = new Map<string, DebugSession>();

/**
 * ⚠️  DEV ONLY: Promise resolvers for waitForResume
 * This enables event-driven waiting instead of polling
 */
const resumeResolvers = new Map<string, {
  resolve: (resumed: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}>();

// ============================================================================
// Session Management
// ============================================================================

/**
 * Initialize a debug session for a trace
 */
export async function initDebugSession(
  params: InitDebugSessionParams
): Promise<DebugSession> {
  // Clean up any existing session
  await endDebugSession(params.traceId);

  const session: DebugSession = {
    traceId: params.traceId,
    projectId: params.projectId,
    state: "running",
    currentSpanId: null,
    stepMode: null,
    stepTargetDepth: null,
    breakpoints: params.breakpoints ?? [],
    hitCounts: {},
    pausedAt: null,
    createdAt: new Date(),
  };

  debugSessions.set(params.traceId, session);

  await notifyDebugEvent({
    type: "sessionStarted",
    traceId: params.traceId,
    timestamp: new Date().toISOString(),
    payload: { state: "running" },
  });

  return session;
}

/**
 * Get the current debug session for a trace
 */
export async function getDebugSession(
  traceId: string
): Promise<DebugSession | null> {
  return debugSessions.get(traceId) ?? null;
}

/**
 * Update debug session state
 */
export async function updateDebugSession(
  traceId: string,
  updates: Partial<DebugSession>
): Promise<DebugSession | null> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return null;
  }

  Object.assign(session, updates);
  return session;
}

/**
 * End a debug session
 */
export async function endDebugSession(traceId: string): Promise<void> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return;
  }

  // Cancel any pending waitForResume
  const resolver = resumeResolvers.get(traceId);
  if (resolver) {
    clearTimeout(resolver.timeoutId);
    resolver.resolve(false);
    resumeResolvers.delete(traceId);
  }

  await notifyDebugEvent({
    type: "sessionEnded",
    traceId,
    timestamp: new Date().toISOString(),
    payload: { state: "completed" },
  });

  debugSessions.delete(traceId);
}

// ============================================================================
// Breakpoint Evaluation
// ============================================================================

/**
 * Evaluate breakpoints for a span event
 */
export async function evaluateBreakpoints(
  params: EvaluateBreakpointParams
): Promise<BreakpointEvalResult> {
  const session = debugSessions.get(params.traceId);
  if (!session) {
    return { shouldPause: false, matchedBreakpoints: [], hitCounts: {} };
  }

  const matchedBreakpoints: DebugBreakpoint[] = [];
  const hitCounts: Record<string, number> = { ...session.hitCounts };

  for (const bp of session.breakpoints) {
    if (!bp.enabled) continue;
    if (bp.trigger !== params.trigger) continue;

    if (!matchesBreakpoint(bp, params.span)) {
      continue;
    }

    const currentHits = (hitCounts[bp.id] ?? 0) + 1;
    hitCounts[bp.id] = currentHits;

    if (!shouldFireOnHit(bp.hitCondition ?? "always", currentHits)) {
      continue;
    }

    matchedBreakpoints.push(bp);
  }

  session.hitCounts = hitCounts;

  const shouldPause = matchedBreakpoints.length > 0;

  if (shouldPause) {
    session.state = "paused";
    session.currentSpanId = params.span.spanId;
    session.pausedAt = new Date();

    for (const bp of matchedBreakpoints) {
      await notifyDebugEvent({
        type: "breakpointHit",
        traceId: params.traceId,
        timestamp: new Date().toISOString(),
        payload: {
          span: params.span,
          breakpoint: bp,
          state: "paused",
        },
      });
    }
  }

  return { shouldPause, matchedBreakpoints, hitCounts };
}

// ============================================================================
// Debug Control
// ============================================================================

/**
 * Handle debug control commands (resume, step, pause)
 */
export async function handleDebugControl(
  params: DebugControlParams
): Promise<DebugSession | null> {
  const session = debugSessions.get(params.traceId);
  if (!session) {
    return null;
  }

  switch (params.command) {
    case "resume":
      session.state = "running";
      session.stepMode = null;
      session.stepTargetDepth = null;
      session.pausedAt = null;

      // Resolve any waiting activity
      resolveWaitForResume(params.traceId, true);

      await notifyDebugEvent({
        type: "resumed",
        traceId: params.traceId,
        timestamp: new Date().toISOString(),
        payload: { state: "running" },
      });
      break;

    case "stepOver":
      session.state = "stepping";
      session.stepMode = "over";
      session.stepTargetDepth = params.currentSpanDepth ?? 0;
      resolveWaitForResume(params.traceId, true);
      break;

    case "stepInto":
      session.state = "stepping";
      session.stepMode = "into";
      session.stepTargetDepth = (params.currentSpanDepth ?? 0) + 1;
      resolveWaitForResume(params.traceId, true);
      break;

    case "stepOut":
      session.state = "stepping";
      session.stepMode = "out";
      session.stepTargetDepth = Math.max(0, (params.currentSpanDepth ?? 0) - 1);
      resolveWaitForResume(params.traceId, true);
      break;

    case "pause":
      session.state = "paused";
      session.pausedAt = new Date();

      await notifyDebugEvent({
        type: "paused",
        traceId: params.traceId,
        timestamp: new Date().toISOString(),
        payload: { state: "paused" },
      });
      break;
  }

  return session;
}

/**
 * Check if stepping should pause at this span
 */
export async function checkStepPause(
  traceId: string,
  span: Span,
  spanDepth: number,
  trigger: "onEnter" | "onExit"
): Promise<boolean> {
  const session = debugSessions.get(traceId);
  if (!session || session.state !== "stepping" || !session.stepMode) {
    return false;
  }

  const targetDepth = session.stepTargetDepth ?? 0;
  let shouldPause = false;

  switch (session.stepMode) {
    case "over":
      if (trigger === "onEnter" && spanDepth <= targetDepth) {
        shouldPause = true;
      }
      break;
    case "into":
      if (trigger === "onEnter") {
        shouldPause = true;
      }
      break;
    case "out":
      if (trigger === "onExit" && spanDepth <= targetDepth) {
        shouldPause = true;
      }
      break;
  }

  if (shouldPause) {
    session.state = "paused";
    session.stepMode = null;
    session.stepTargetDepth = null;
    session.currentSpanId = span.spanId;
    session.pausedAt = new Date();

    await notifyDebugEvent({
      type: "stepCompleted",
      traceId,
      timestamp: new Date().toISOString(),
      payload: { span, state: "paused" },
    });
  }

  return shouldPause;
}

// ============================================================================
// Wait for Resume (Event-Driven, NOT Polling)
// ============================================================================

/**
 * Wait for resume signal using Promise-based event pattern
 *
 * This does NOT poll - it creates a Promise that resolves when:
 * - handleDebugControl is called with resume/step command
 * - The session is ended
 * - Timeout expires (auto-resumes)
 *
 * @param traceId - The trace to wait for
 * @param timeoutMs - Maximum wait time (default 5 minutes)
 * @returns true if resumed, false if session ended or timed out
 */
export async function waitForResume(
  traceId: string,
  timeoutMs: number = 300000
): Promise<boolean> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return false;
  }

  // If not paused, return immediately
  if (session.state === "running" || session.state === "stepping") {
    return true;
  }
  if (session.state === "completed") {
    return false;
  }

  // Create a promise that will be resolved when resumed
  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      // Timeout - auto-resume
      resumeResolvers.delete(traceId);
      
      const session = debugSessions.get(traceId);
      if (session && session.state === "paused") {
        session.state = "running";
        session.pausedAt = null;
        console.warn(`[debug-handler] Auto-resumed trace ${traceId} after timeout`);
      }
      
      resolve(true);
    }, timeoutMs);

    resumeResolvers.set(traceId, { resolve, timeoutId });
  });
}

/**
 * Resolve a pending waitForResume
 */
function resolveWaitForResume(traceId: string, resumed: boolean): void {
  const resolver = resumeResolvers.get(traceId);
  if (resolver) {
    clearTimeout(resolver.timeoutId);
    resolver.resolve(resumed);
    resumeResolvers.delete(traceId);
  }
}

// ============================================================================
// Breakpoint CRUD
// ============================================================================

/**
 * Add a breakpoint to an active session
 */
export async function addBreakpoint(
  traceId: string,
  breakpoint: DebugBreakpoint
): Promise<boolean> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return false;
  }

  session.breakpoints = session.breakpoints.filter((bp) => bp.id !== breakpoint.id);
  session.breakpoints.push(breakpoint);
  return true;
}

/**
 * Remove a breakpoint from an active session
 */
export async function removeBreakpoint(
  traceId: string,
  breakpointId: string
): Promise<boolean> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return false;
  }

  const initialLength = session.breakpoints.length;
  session.breakpoints = session.breakpoints.filter((bp) => bp.id !== breakpointId);
  return session.breakpoints.length < initialLength;
}

/**
 * Enable/disable a breakpoint
 */
export async function setBreakpointEnabled(
  traceId: string,
  breakpointId: string,
  enabled: boolean
): Promise<boolean> {
  const session = debugSessions.get(traceId);
  if (!session) {
    return false;
  }

  const bp = session.breakpoints.find((b) => b.id === breakpointId);
  if (!bp) {
    return false;
  }

  bp.enabled = enabled;
  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a span matches a breakpoint's conditions
 * Uses glob-style pattern matching for string fields
 */
function matchesBreakpoint(bp: DebugBreakpoint, span: Span): boolean {
  // Check span type
  if (bp.spanType !== undefined) {
    const types = Array.isArray(bp.spanType) ? bp.spanType : [bp.spanType];
    if (!types.includes(span.spanType)) {
      return false;
    }
  }

  // Check span name (glob pattern)
  if (bp.spanName !== undefined) {
    if (!matchesGlob(span.name, bp.spanName)) {
      return false;
    }
  }

  // Check tool name (glob pattern)
  if (bp.toolName !== undefined && span.toolName) {
    if (!matchesGlob(span.toolName, bp.toolName)) {
      return false;
    }
  } else if (bp.toolName !== undefined && !span.toolName) {
    return false;
  }

  // Check model (glob pattern)
  if (bp.model !== undefined && span.model) {
    if (!matchesGlob(span.model, bp.model)) {
      return false;
    }
  } else if (bp.model !== undefined && !span.model) {
    return false;
  }

  // Check status
  if (bp.status !== undefined) {
    if (span.status !== bp.status) {
      return false;
    }
  }

  return true;
}

/**
 * Simple glob pattern matching (supports * wildcard)
 */
function matchesGlob(value: string, pattern: string): boolean {
  // Exact match
  if (!pattern.includes("*")) {
    return value === pattern;
  }

  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars except *
    .replace(/\*/g, ".*"); // * matches anything

  return new RegExp(`^${regexPattern}$`).test(value);
}

/**
 * Check if breakpoint should fire based on hit condition
 */
function shouldFireOnHit(
  condition: DebugBreakpoint["hitCondition"],
  hitCount: number
): boolean {
  if (condition === "always" || condition === undefined) {
    return true;
  }

  if (typeof condition === "number") {
    return hitCount === condition;
  }

  if ("every" in condition) {
    return hitCount % condition.every === 0;
  }

  if ("after" in condition) {
    return hitCount > condition.after;
  }

  return true;
}

/**
 * Notify the debug stream endpoint about an event
 */
async function notifyDebugEvent(event: DebugEvent): Promise<void> {
  try {
    const response = await fetch(`${NEON_API_URL}/api/debug/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // In production, add internal API key here
        "X-Internal-Request": "true",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error("[debug-handler] Failed to notify debug event:", await response.text());
    }
  } catch (error) {
    // Don't throw - debug events are best-effort
    console.error("[debug-handler] Error notifying debug event:", error);
  }
}

// ============================================================================
// Cleanup: Auto-cleanup stale sessions (dev helper)
// ============================================================================

const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Clean up stale debug sessions (runs periodically)
 */
function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [traceId, session] of debugSessions) {
    const age = now - session.createdAt.getTime();
    if (age > SESSION_MAX_AGE_MS) {
      console.warn(`[debug-handler] Cleaning up stale session: ${traceId}`);
      endDebugSession(traceId);
    }
  }
}

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupStaleSessions, 5 * 60 * 1000);

// Clean up on process exit
if (typeof process !== "undefined") {
  process.on("beforeExit", () => {
    clearInterval(cleanupInterval);
    for (const traceId of debugSessions.keys()) {
      endDebugSession(traceId);
    }
  });
}

// ============================================================================
// Activity Export Collection
// ============================================================================

/**
 * All debug handler activities for Temporal registration
 */
export const debugActivities = {
  initDebugSession,
  getDebugSession,
  updateDebugSession,
  endDebugSession,
  evaluateBreakpoints,
  handleDebugControl,
  checkStepPause,
  addBreakpoint,
  removeBreakpoint,
  setBreakpointEnabled,
  waitForResume,
};
