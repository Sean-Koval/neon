/**
 * Trajectory Scorers
 *
 * Scorers that evaluate agent trajectory quality:
 * - Path optimality: Did the agent take the shortest path?
 * - Step consistency: Were there contradictory or redundant steps?
 * - Recovery efficiency: How well did the agent recover from errors?
 * - Plan adherence: Did the agent follow its own plan?
 */

import type { SpanWithChildren } from "@neon/shared";
import { defineScorer, type Scorer, type EvalContext, type ScoreResult } from "./base.js";

/**
 * Measures if the agent took the optimal path through tool calls.
 *
 * Compares actual tool steps to the expected minimum steps.
 * Score = minSteps / actualSteps, capped at 1.0 (fewer steps = better).
 *
 * @example
 * ```typescript
 * const scorer = pathOptimalityScorer();
 * const result = scorer.evaluate({
 *   trace,
 *   expected: { minSteps: 3 },
 * });
 * ```
 */
export function pathOptimalityScorer(): Scorer {
  return defineScorer({
    name: "path_optimality",
    description: "Measures if the agent took the optimal path",
    dataType: "numeric",
    evaluate: (ctx: EvalContext): ScoreResult => {
      const toolSpans = ctx.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool",
      );
      const actualSteps = toolSpans.length;
      const minSteps = (ctx.expected?.minSteps as number) || actualSteps;
      const score =
        minSteps > 0
          ? Math.min(1.0, minSteps / Math.max(actualSteps, 1))
          : 1.0;
      return {
        value: score,
        reason: `${actualSteps} steps taken, ${minSteps} minimum expected`,
      };
    },
  });
}

/**
 * Checks for contradictory or redundant step pairs in the trajectory.
 *
 * Detects:
 * - Repeated identical tool calls (same tool + same input)
 * - Create-then-delete patterns on the same resource
 *
 * Score = 1 - (contradictions / totalPairs), or 1.0 if no tool spans.
 */
export function stepConsistencyScorer(): Scorer {
  return defineScorer({
    name: "step_consistency",
    description: "Checks for contradictory or redundant steps",
    dataType: "numeric",
    evaluate: (ctx: EvalContext): ScoreResult => {
      const toolSpans = ctx.trace.spans
        .filter((s: SpanWithChildren) => s.spanType === "tool")
        .sort(
          (a: SpanWithChildren, b: SpanWithChildren) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      if (toolSpans.length <= 1) {
        return {
          value: 1.0,
          reason:
            toolSpans.length === 0
              ? "No tool spans to evaluate"
              : "Single tool span, no contradictions possible",
        };
      }

      let contradictions = 0;
      const totalPairs = toolSpans.length - 1;

      // Contradictory pairs to detect
      const opposites: Record<string, string[]> = {
        create: ["delete", "remove", "destroy"],
        add: ["remove", "delete"],
        open: ["close"],
        start: ["stop", "end"],
        enable: ["disable"],
        insert: ["delete", "remove"],
      };

      for (let i = 0; i < toolSpans.length; i++) {
        for (let j = i + 1; j < toolSpans.length; j++) {
          const a = toolSpans[i];
          const b = toolSpans[j];
          const nameA = (a.toolName || a.name).toLowerCase();
          const nameB = (b.toolName || b.name).toLowerCase();

          // Check repeated identical calls
          if (
            nameA === nameB &&
            a.toolInput &&
            b.toolInput &&
            a.toolInput === b.toolInput
          ) {
            contradictions++;
            continue;
          }

          // Check create-then-delete patterns
          for (const [action, inverses] of Object.entries(opposites)) {
            if (
              nameA.includes(action) &&
              inverses.some((inv) => nameB.includes(inv))
            ) {
              contradictions++;
              break;
            }
          }
        }
      }

      const maxPairs = (toolSpans.length * (toolSpans.length - 1)) / 2;
      const score = maxPairs > 0 ? 1 - contradictions / maxPairs : 1.0;

      return {
        value: Math.max(0, score),
        reason: `${contradictions} contradictions found in ${totalPairs + 1} steps (${maxPairs} pairs checked)`,
      };
    },
  });
}

/**
 * Measures how efficiently the agent recovers from errors.
 *
 * Finds error spans followed by successful retry/recovery spans.
 * Score = successful recoveries / total errors, or 1.0 if no errors.
 */
export function recoveryEfficiencyScorer(): Scorer {
  return defineScorer({
    name: "recovery_efficiency",
    description: "Measures error recovery efficiency",
    dataType: "numeric",
    evaluate: (ctx: EvalContext): ScoreResult => {
      const spans = ctx.trace.spans.sort(
        (a: SpanWithChildren, b: SpanWithChildren) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const errorSpans = spans.filter(
        (s: SpanWithChildren) => s.status === "error",
      );

      if (errorSpans.length === 0) {
        return { value: 1.0, reason: "No errors encountered" };
      }

      let recoveries = 0;
      for (const errorSpan of errorSpans) {
        const errorTime = new Date(errorSpan.timestamp).getTime();
        // Look for a subsequent successful span of the same type or tool
        const recovered = spans.some((s: SpanWithChildren) => {
          const sTime = new Date(s.timestamp).getTime();
          return (
            sTime > errorTime &&
            s.status === "ok" &&
            (s.spanType === errorSpan.spanType ||
              (s.toolName && s.toolName === errorSpan.toolName))
          );
        });
        if (recovered) {
          recoveries++;
        }
      }

      const score = recoveries / errorSpans.length;
      return {
        value: score,
        reason: `${recoveries}/${errorSpans.length} errors recovered from`,
      };
    },
  });
}

/**
 * Measures how well the agent followed its own plan.
 *
 * Finds planning spans (componentType === 'planning') and checks
 * how many planned actions were subsequently executed as tool spans.
 * Score based on overlap between planned and executed actions.
 */
export function planAdherenceScorer(): Scorer {
  return defineScorer({
    name: "plan_adherence",
    description: "Measures adherence to planned actions",
    dataType: "numeric",
    evaluate: (ctx: EvalContext): ScoreResult => {
      const planningSpans = ctx.trace.spans.filter(
        (s: SpanWithChildren) => s.componentType === "planning",
      );

      if (planningSpans.length === 0) {
        return { value: 1.0, reason: "No planning spans found, skipping" };
      }

      const toolSpans = ctx.trace.spans.filter(
        (s: SpanWithChildren) => s.spanType === "tool",
      );

      if (toolSpans.length === 0) {
        return {
          value: 0.0,
          reason: "Planning spans found but no tool execution followed",
        };
      }

      // Extract planned action names from planning span outputs/attributes
      const plannedActions = new Set<string>();
      for (const plan of planningSpans) {
        // Try to extract action names from plan output
        if (plan.output) {
          // Look for tool/action names in the output text
          const toolNames = toolSpans.map(
            (t: SpanWithChildren) => t.toolName || t.name,
          );
          for (const name of toolNames) {
            if (name && plan.output.toLowerCase().includes(name.toLowerCase())) {
              plannedActions.add(name.toLowerCase());
            }
          }
        }
        // Check attributes for planned actions
        if (plan.attributes?.["plan.actions"]) {
          try {
            const actions = JSON.parse(plan.attributes["plan.actions"]);
            if (Array.isArray(actions)) {
              for (const a of actions) {
                plannedActions.add(String(a).toLowerCase());
              }
            }
          } catch {
            // Not parseable, skip
          }
        }
      }

      if (plannedActions.size === 0) {
        // Could not extract specific planned actions, score based on plan existence + execution
        return {
          value: 0.7,
          reason: `${planningSpans.length} planning span(s) found, ${toolSpans.length} tool(s) executed, but could not extract specific planned actions`,
        };
      }

      // Check how many planned actions were executed
      const executedNames = new Set(
        toolSpans.map((t: SpanWithChildren) =>
          (t.toolName || t.name).toLowerCase(),
        ),
      );
      let matchCount = 0;
      for (const planned of plannedActions) {
        if (executedNames.has(planned)) {
          matchCount++;
        }
      }

      const score = matchCount / plannedActions.size;
      return {
        value: score,
        reason: `${matchCount}/${plannedActions.size} planned actions were executed`,
      };
    },
  });
}
