/**
 * Composite hook that aggregates all currently running work items
 * (eval runs, experiments, training loops) for the Command Center.
 */

import { useWorkflowRuns } from '@/hooks/use-workflow-runs'

// =============================================================================
// Types
// =============================================================================

export interface RunningWorkItem {
  id: string
  type: 'eval' | 'experiment' | 'training'
  name: string
  progress: number // 0-100
  detail: string // e.g., "45/100 cases"
  href: string // link to detail page
}

// Type priority for sorting: training (0) > experiment (1) > eval (2)
const TYPE_PRIORITY: Record<RunningWorkItem['type'], number> = {
  training: 0,
  experiment: 1,
  eval: 2,
}

// =============================================================================
// Hook
// =============================================================================

export function useRunningWork(): {
  items: RunningWorkItem[]
  isLoading: boolean
  error: Error | null
} {
  // --- Running eval runs ---
  const {
    data: runningEvals,
    isLoading: isLoadingEvals,
    error: evalsError,
  } = useWorkflowRuns({ status: 'RUNNING' }, { refetchInterval: 5000 })

  if (evalsError) {
    console.error('[useRunningWork] Failed to fetch running eval runs:', evalsError)
  }

  const evalItems: RunningWorkItem[] = (runningEvals ?? []).map((run) => {
    const completed = run.progress?.completed ?? 0
    const total = run.progress?.total ?? 0
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    return {
      id: run.id,
      type: 'eval' as const,
      name: run.workflowId,
      progress,
      detail: total > 0 ? `${completed}/${total} cases` : 'Starting...',
      href: `/eval-runs/${run.id}`,
    }
  })

  // --- Running experiments ---
  // TODO: Wire up experiment workflows when Temporal experiment workflows are connected.
  const experimentItems: RunningWorkItem[] = []

  // --- Running training loops ---
  // TODO: Wire up training loop workflows when Temporal training workflows are connected.
  const trainingItems: RunningWorkItem[] = []

  // --- Combine and sort ---
  const items = [...evalItems, ...experimentItems, ...trainingItems].sort(
    (a, b) => {
      // Sort by type priority first (training > experiment > eval)
      const typeDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
      if (typeDiff !== 0) return typeDiff
      // Then by progress ascending (least complete first)
      return a.progress - b.progress
    },
  )

  return {
    items,
    isLoading: isLoadingEvals,
    error: evalsError ?? null,
  }
}
