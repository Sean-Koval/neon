/**
 * Debugging Module
 *
 * Tools for debugging and inspecting agent traces.
 *
 * @example
 * ```typescript
 * import {
 *   defineBreakpoint,
 *   onSpanType,
 *   onError,
 *   and,
 *   BreakpointManager,
 * } from '@neon/sdk';
 *
 * // Create a breakpoint that fires on tool errors
 * const bp = defineBreakpoint({
 *   name: 'tool-errors',
 *   matcher: and(onSpanType('tool'), onError()),
 *   trigger: 'onExit',
 *   action: {
 *     type: 'notify',
 *     handler: (ctx) => {
 *       console.error(`Tool ${ctx.span.toolName} failed!`);
 *     },
 *   },
 * });
 *
 * // Register with manager
 * const manager = new BreakpointManager();
 * manager.register(bp);
 *
 * // Or use global convenience functions
 * import { addBreakpoint } from '@neon/sdk';
 * addBreakpoint({
 *   name: 'slow-generations',
 *   matcher: {
 *     spanType: 'generation',
 *     condition: (span) => span.durationMs > 5000,
 *   },
 *   action: { type: 'log', level: 'warn' },
 * });
 * ```
 */

export {
  // Types
  type BreakpointTrigger,
  type HitCondition,
  type SpanMatcher,
  type BreakpointContext,
  type BreakpointAction,
  type BreakpointConfig,
  type Breakpoint,
  // Core functions
  defineBreakpoint,
  resetBreakpointIdCounter,
  // Matcher factories
  onSpanType,
  onComponentType,
  onSpanName,
  onSpanNameGlob,
  onTool,
  onModel,
  onError,
  onSuccess,
  onAttribute,
  onCondition,
  // Matcher combinators
  and,
  or,
  not,
  // Matching logic
  matchesSpan,
  shouldFire,
  // Manager
  BreakpointManager,
  getBreakpointManager,
  resetBreakpointManager,
  // Convenience functions
  registerBreakpoint,
  addBreakpoint,
  removeBreakpoint,
  evaluateBreakpoints,
} from "./breakpoints.js";

// Debug client (WebSocket-based real-time debugging)
export {
  // Types
  type DebugConnectionState,
  type DebugSessionState,
  type DebugCommand,
  type DebugEventType,
  type DebugCommandMessage,
  type DebugEvent,
  type DebugClientConfig,
  type DebugEventHandlers,
  // Client class
  DebugClient,
  // Factory functions
  createDebugClient,
  createDebugClientFromEnv,
} from "./debug-client.js";
