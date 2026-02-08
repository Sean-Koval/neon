/**
 * Activities index
 *
 * Re-exports all Temporal activities for use in workflows
 */

export { emitSpan, emitSpansBatch } from "./emit-span";
export { llmCall, estimateCost } from "./llm-call";
export { executeTool, registerTool, hasTool, executeMCPTool } from "./execute-tool";
export {
  scoreTrace,
  scoreTraceWithConfig,
  registerScorer,
  hasScorer,
  type ScoreResult,
} from "./score-trace";
export { healthCheck, ping, type HealthCheckResult } from "./health";
export {
  sendSlackNotification,
  sendWebhookNotification,
  sendNotifications,
  notifyActivities,
  type NotifyConfig,
  type EvalRunResult,
} from "./notify";

// Debug handler
export {
  // Types
  type DebugState,
  type StepMode,
  type DebugBreakpoint,
  type DebugSession,
  type InitDebugSessionParams,
  type EvaluateBreakpointParams,
  type BreakpointEvalResult,
  type DebugControlParams,
  type DebugEvent,
  // Activities
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
  debugActivities,
} from "./debug-handler";

// Training loop
export {
  collectSignals,
  curateTrainingData,
  runOptimization,
  checkRegressionStatus,
  recordLoopIteration,
} from "./training-activities";
