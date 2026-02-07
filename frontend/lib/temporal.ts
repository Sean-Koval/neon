/**
 * Temporal Client
 *
 * Provides connection to Temporal for starting and querying workflows.
 */

import { Client, Connection } from '@temporalio/client'

// Singleton client instance
let client: Client | null = null
let connection: Connection | null = null

/**
 * Temporal configuration from environment
 */
const config = {
  address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'agent-workers',
}

/**
 * Get or create Temporal client
 *
 * Uses a short timeout to fail fast when Temporal is unavailable.
 */
export async function getTemporalClient(): Promise<Client> {
  if (!client) {
    // Create a promise that rejects after timeout
    const timeoutMs = 2000 // 2 second timeout - fail fast when unavailable
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              'Temporal connection timeout - service may be unavailable',
            ),
          ),
        timeoutMs,
      )
    })

    // Race between connection and timeout
    connection = await Promise.race([
      Connection.connect({
        address: config.address,
      }),
      timeoutPromise,
    ])

    client = new Client({
      connection,
      namespace: config.namespace,
    })
  }
  return client
}

/**
 * Get the default task queue
 */
export function getTaskQueue(): string {
  return config.taskQueue
}

/**
 * Close the Temporal connection (for cleanup)
 */
export async function closeTemporalConnection(): Promise<void> {
  if (connection) {
    await connection.close()
    connection = null
    client = null
  }
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export interface StartEvalRunParams {
  runId: string
  projectId: string
  agentId: string
  agentVersion: string
  dataset: {
    items: Array<{
      input: Record<string, unknown>
      expected?: Record<string, unknown>
    }>
  }
  tools: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  scorers: string[]
  parallel?: boolean
  parallelism?: number
}

export interface EvalRunProgress {
  completed: number
  total: number
  passed: number
  failed: number
  results: Array<{
    caseIndex: number
    result: {
      traceId: string
      status: string
      iterations: number
      reason?: string
    }
    scores: Array<{
      name: string
      value: number
      reason?: string
    }>
  }>
}

export interface WorkflowStatus {
  workflowId: string
  runId: string
  status:
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'TERMINATED'
    | 'TIMED_OUT'
  startTime: string
  closeTime?: string
  progress?: EvalRunProgress
  result?: unknown
  error?: string
}

// ============================================================================
// WORKFLOW OPERATIONS
// ============================================================================

/**
 * Start an eval run workflow
 */
export async function startEvalRunWorkflow(
  params: StartEvalRunParams,
): Promise<{ workflowId: string; runId: string }> {
  const client = await getTemporalClient()

  const workflowId = `eval-run-${params.runId}`
  const workflowName = params.parallel
    ? 'parallelEvalRunWorkflow'
    : 'evalRunWorkflow'

  const handle = await client.workflow.start(workflowName, {
    taskQueue: getTaskQueue(),
    workflowId,
    args: [
      {
        runId: params.runId,
        projectId: params.projectId,
        agentId: params.agentId,
        agentVersion: params.agentVersion,
        dataset: params.dataset,
        tools: params.tools,
        scorers: params.scorers,
        ...(params.parallel && { parallelism: params.parallelism || 5 }),
      },
    ],
  })

  return {
    workflowId: handle.workflowId,
    runId: params.runId,
  }
}

/**
 * Start a single eval case workflow
 */
export async function startEvalCaseWorkflow(params: {
  caseId: string
  projectId: string
  agentId: string
  agentVersion?: string
  input: Record<string, unknown> | string
  expected?: Record<string, unknown>
  tools?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  scorers: string[]
  mode?: 'full' | 'lightweight'
  model?: string
}): Promise<{ workflowId: string; caseId: string }> {
  const client = await getTemporalClient()

  const workflowId = `eval-case-${params.caseId}`

  const handle = await client.workflow.start('evalCaseWorkflow', {
    taskQueue: getTaskQueue(),
    workflowId,
    args: [params],
  })

  return {
    workflowId: handle.workflowId,
    caseId: params.caseId,
  }
}

/**
 * Get workflow status and progress
 */
export async function getWorkflowStatus(
  workflowId: string,
): Promise<WorkflowStatus> {
  const client = await getTemporalClient()
  const handle = client.workflow.getHandle(workflowId)

  const description = await handle.describe()

  const status: WorkflowStatus = {
    workflowId,
    runId: workflowId.replace('eval-run-', ''),
    status: description.status.name as WorkflowStatus['status'],
    startTime: description.startTime.toISOString(),
    closeTime: description.closeTime?.toISOString(),
  }

  // Try to get progress if workflow is running
  if (description.status.name === 'RUNNING') {
    try {
      const progress = await handle.query<EvalRunProgress>('progress')
      status.progress = progress
    } catch {
      // Query not available yet, that's OK
    }
  }

  // Get result if completed
  if (description.status.name === 'COMPLETED') {
    try {
      status.result = await handle.result()
    } catch {
      // Result not available
    }
  }

  // Get failure info if failed
  if (description.status.name === 'FAILED') {
    try {
      await handle.result()
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error)
    }
  }

  return status
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const client = await getTemporalClient()
  const handle = client.workflow.getHandle(workflowId)
  await handle.cancel()
}

/**
 * Signal a workflow to pause
 */
export async function pauseEvalRun(workflowId: string): Promise<void> {
  const client = await getTemporalClient()
  const handle = client.workflow.getHandle(workflowId)
  await handle.signal('pause', true)
}

/**
 * Signal a workflow to resume
 */
export async function resumeEvalRun(workflowId: string): Promise<void> {
  const client = await getTemporalClient()
  const handle = client.workflow.getHandle(workflowId)
  await handle.signal('pause', false)
}

/**
 * List recent eval runs with timeout protection
 */
export async function listEvalRuns(options?: {
  limit?: number
  offset?: number
  status?: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TERMINATED' | 'TIMED_OUT'
}): Promise<{ items: WorkflowStatus[]; hasMore: boolean }> {
  const client = await getTemporalClient()

  // Map UI status values to Temporal visibility query format (title-case, single quotes)
  const statusMap: Record<string, string> = {
    RUNNING: 'Running',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Canceled',
    TERMINATED: 'Terminated',
    TIMED_OUT: 'TimedOut',
  }

  let query =
    '(WorkflowType = "evalRunWorkflow" OR WorkflowType = "parallelEvalRunWorkflow")'
  if (options?.status) {
    const temporalStatus = statusMap[options.status] || options.status
    query += ` AND ExecutionStatus = '${temporalStatus}'`
  }

  const limit = options?.limit || 50
  const offset = options?.offset || 0
  const timeoutMs = 3000 // 3 second timeout for listing - fail fast when slow

  // Create a promise that collects workflows with timeout
  const listPromise = async (): Promise<{
    items: WorkflowStatus[]
    hasMore: boolean
  }> => {
    const workflows: WorkflowStatus[] = []
    const iterator = client.workflow.list({ query })

    let index = 0
    let hasMore = false
    // TODO: O(n) offset pagination - iterates through all skipped items sequentially.
    // For deep pages (e.g., page 50 with pageSize=20 = 1000 items iterated).
    // Consider cursor-based pagination or server-side offset support for better scaling.
    for await (const workflow of iterator) {
      // Skip items before offset
      if (index < offset) {
        index++
        continue
      }

      // Check if there are more items beyond this page
      if (workflows.length >= limit) {
        hasMore = true
        break
      }

      workflows.push({
        workflowId: workflow.workflowId,
        runId: workflow.workflowId.replace('eval-run-', ''),
        status: workflow.status.name as WorkflowStatus['status'],
        startTime: workflow.startTime.toISOString(),
        closeTime: workflow.closeTime?.toISOString(),
      })

      index++
    }

    return { items: workflows, hasMore }
  }

  // Race between listing and timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(new Error('Temporal list timeout - service may be unavailable')),
      timeoutMs,
    )
  })

  return Promise.race([listPromise(), timeoutPromise])
}
