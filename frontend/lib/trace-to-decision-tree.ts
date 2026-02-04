/**
 * Trace to Decision Tree Transformation
 *
 * Transforms trace spans into a decision tree structure for visualization.
 * Identifies decision points (routing, planning, tool selection) and builds
 * a tree showing the decision flow and outcomes.
 */

import type {
  ComponentType,
  DecisionMetadata,
  SkillSelectionContext,
  SpanWithChildren,
} from '@neon/shared'

// =============================================================================
// Types
// =============================================================================

export type DecisionType =
  | 'routing'
  | 'planning'
  | 'tool_selection'
  | 'branching'
  | 'termination'

export type DecisionOutcome = 'success' | 'failure' | 'pending' | 'unknown'

export interface DecisionAlternative {
  /** Alternative option identifier */
  option: string
  /** Confidence score (0-1) if available */
  confidence?: number
  /** Reason for considering this option */
  reason?: string
  /** Whether this alternative was chosen */
  wasChosen: boolean
}

export interface DecisionNode {
  /** Unique node identifier */
  id: string
  /** Associated span ID */
  spanId: string
  /** Span name */
  name: string
  /** Decision type */
  type: DecisionType
  /** Question or decision point description */
  question: string
  /** The option that was chosen */
  chosenOption: string
  /** Confidence in the decision (0-1) */
  confidence?: number
  /** Reason for the decision */
  reason?: string
  /** Alternative options that were considered */
  alternatives: DecisionAlternative[]
  /** Outcome of this decision path */
  outcome: DecisionOutcome
  /** Child decision nodes */
  children: DecisionNode[]
  /** Timestamp */
  timestamp: Date
  /** Duration in ms */
  durationMs: number
  /** Whether this decision is a root cause of failure */
  isRootCause?: boolean
  /** Component type from span */
  componentType?: ComponentType
}

export interface DecisionTree {
  /** Root nodes of the tree */
  roots: DecisionNode[]
  /** Total number of decision points */
  totalDecisions: number
  /** Number of successful decision paths */
  successPaths: number
  /** Number of failed decision paths */
  failedPaths: number
  /** Average decision confidence */
  avgConfidence: number
}

// =============================================================================
// Decision Type Detection
// =============================================================================

const DECISION_COMPONENT_TYPES: ComponentType[] = [
  'routing',
  'planning',
  'tool',
  'skill',
]

function isDecisionSpan(span: SpanWithChildren): boolean {
  // Check component type
  if (
    span.componentType &&
    DECISION_COMPONENT_TYPES.includes(span.componentType)
  ) {
    return true
  }

  // Check for skill selection context
  if ('skillSelection' in span && span.skillSelection) {
    return true
  }

  // Check for decision metadata
  if ('decisionMetadata' in span && span.decisionMetadata) {
    return true
  }

  // Check span type
  if (span.spanType === 'tool') {
    return true
  }

  // Check name patterns
  const namePatterns = [
    /route/i,
    /plan/i,
    /select/i,
    /choose/i,
    /decide/i,
    /branch/i,
  ]
  return namePatterns.some((pattern) => pattern.test(span.name))
}

function inferDecisionType(span: SpanWithChildren): DecisionType {
  const componentType = span.componentType

  if (componentType === 'routing') return 'routing'
  if (componentType === 'planning') return 'planning'
  if (componentType === 'tool' || componentType === 'skill')
    return 'tool_selection'

  // Infer from name
  if (/route/i.test(span.name)) return 'routing'
  if (/plan/i.test(span.name)) return 'planning'
  if (/select|choose|tool/i.test(span.name)) return 'tool_selection'
  if (/branch|fork/i.test(span.name)) return 'branching'
  if (/end|stop|finish|terminate/i.test(span.name)) return 'termination'

  return 'tool_selection' // Default for tool spans
}

function inferDecisionQuestion(
  _span: SpanWithChildren,
  type: DecisionType,
): string {
  switch (type) {
    case 'routing':
      return `Route to which component?`
    case 'planning':
      return `What is the next step?`
    case 'tool_selection':
      return `Which tool to use?`
    case 'branching':
      return `Which path to take?`
    case 'termination':
      return `Should we stop here?`
  }
}

function inferOutcome(span: SpanWithChildren): DecisionOutcome {
  if (span.status === 'ok') return 'success'
  if (span.status === 'error') return 'failure'
  if (!span.endTime) return 'pending'
  return 'unknown'
}

// =============================================================================
// Transformation
// =============================================================================

function spanToDecisionNode(
  span: SpanWithChildren,
  _parentOutcome?: DecisionOutcome,
): DecisionNode {
  const type = inferDecisionType(span)
  const skillSelection = (
    span as SpanWithChildren & { skillSelection?: SkillSelectionContext }
  ).skillSelection
  const _decisionMetadata = (
    span as SpanWithChildren & { decisionMetadata?: DecisionMetadata }
  ).decisionMetadata

  // Build alternatives from skill selection context
  const alternatives: DecisionAlternative[] = []
  if (skillSelection?.alternativesConsidered) {
    skillSelection.alternativesConsidered.forEach(
      (alt: string, idx: number) => {
        alternatives.push({
          option: alt,
          confidence: skillSelection.alternativeScores?.[idx],
          wasChosen: false,
        })
      },
    )
  }

  // The chosen option
  const chosenOption =
    skillSelection?.selectedSkill || span.toolName || span.name

  // Add the chosen option to alternatives
  alternatives.unshift({
    option: chosenOption,
    confidence: skillSelection?.selectionConfidence,
    reason: skillSelection?.selectionReason,
    wasChosen: true,
  })

  const outcome = inferOutcome(span)

  return {
    id: `decision-${span.spanId}`,
    spanId: span.spanId,
    name: span.name,
    type,
    question: inferDecisionQuestion(span, type),
    chosenOption,
    confidence: skillSelection?.selectionConfidence,
    reason: skillSelection?.selectionReason,
    alternatives,
    outcome,
    children: [],
    timestamp: new Date(span.timestamp),
    durationMs: span.durationMs,
    componentType: span.componentType,
    isRootCause: false,
  }
}

function buildDecisionTree(
  spans: SpanWithChildren[],
  parentId?: string,
): DecisionNode[] {
  const nodes: DecisionNode[] = []

  for (const span of spans) {
    if (!isDecisionSpan(span)) {
      // Skip non-decision spans but still process children
      if (span.children && span.children.length > 0) {
        nodes.push(...buildDecisionTree(span.children, parentId))
      }
      continue
    }

    const node = spanToDecisionNode(span)

    // Process children
    if (span.children && span.children.length > 0) {
      node.children = buildDecisionTree(span.children, span.spanId)
    }

    // Propagate failure status to identify root causes
    if (node.outcome === 'failure' && node.children.length === 0) {
      node.isRootCause = true
    }

    nodes.push(node)
  }

  return nodes
}

function calculateTreeStats(nodes: DecisionNode[]): {
  totalDecisions: number
  successPaths: number
  failedPaths: number
  avgConfidence: number
} {
  let totalDecisions = 0
  let successPaths = 0
  let failedPaths = 0
  let totalConfidence = 0
  let confidenceCount = 0

  function traverse(node: DecisionNode) {
    totalDecisions++

    if (node.confidence !== undefined) {
      totalConfidence += node.confidence
      confidenceCount++
    }

    if (node.children.length === 0) {
      // Leaf node - count path outcome
      if (node.outcome === 'success') successPaths++
      if (node.outcome === 'failure') failedPaths++
    }

    for (const child of node.children) {
      traverse(child)
    }
  }

  for (const node of nodes) {
    traverse(node)
  }

  return {
    totalDecisions,
    successPaths,
    failedPaths,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
  }
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Transform trace spans into a decision tree
 *
 * @example
 * ```typescript
 * const tree = traceToDecisionTree(trace.spans)
 * console.log(`Found ${tree.totalDecisions} decision points`)
 * console.log(`${tree.successPaths} success, ${tree.failedPaths} failure paths`)
 * ```
 */
export function traceToDecisionTree(spans: SpanWithChildren[]): DecisionTree {
  const roots = buildDecisionTree(spans)
  const stats = calculateTreeStats(roots)

  return {
    roots,
    ...stats,
  }
}

/**
 * Find causal decisions that led to a failed span
 *
 * @example
 * ```typescript
 * const failedSpan = spans.find(s => s.status === 'error')
 * const causalDecisions = findCausalDecisions(failedSpan.spanId, tree)
 * ```
 */
export function findCausalDecisions(
  failedSpanId: string,
  tree: DecisionTree,
): DecisionNode[] {
  const causalPath: DecisionNode[] = []

  function findPath(nodes: DecisionNode[], targetId: string): boolean {
    for (const node of nodes) {
      if (node.spanId === targetId) {
        causalPath.unshift(node)
        return true
      }

      if (node.children.length > 0 && findPath(node.children, targetId)) {
        causalPath.unshift(node)
        return true
      }
    }
    return false
  }

  findPath(tree.roots, failedSpanId)
  return causalPath
}

/**
 * Get all low-confidence decisions that may need review
 */
export function getLowConfidenceDecisions(
  tree: DecisionTree,
  threshold: number = 0.5,
): DecisionNode[] {
  const lowConfidence: DecisionNode[] = []

  function traverse(node: DecisionNode) {
    if (node.confidence !== undefined && node.confidence < threshold) {
      lowConfidence.push(node)
    }
    for (const child of node.children) {
      traverse(child)
    }
  }

  for (const root of tree.roots) {
    traverse(root)
  }

  return lowConfidence.sort((a, b) => (a.confidence || 0) - (b.confidence || 0))
}
