'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface ApprovalBannerProps {
  loopId: string
  agentName: string
  scoreBefore: number
  scoreAfter: number
  improvementDelta: number
  threshold: number
  changes: string[]
  stageRequiringApproval: string
  onResolved?: () => void
}

export function ApprovalBanner({
  loopId,
  agentName,
  scoreBefore,
  scoreAfter,
  improvementDelta,
  threshold,
  changes,
  stageRequiringApproval,
  onResolved,
}: ApprovalBannerProps) {
  const signalMutation = trpc.trainingLoops.signal.useMutation()
  const [action, setAction] = useState<string | null>(null)

  const handleSignal = useCallback(async (signal: 'approve' | 'reject' | 'skipStage') => {
    setAction(signal)
    await signalMutation.mutateAsync({ workflowId: loopId, signal })
    onResolved?.()
  }, [loopId, signalMutation, onResolved])

  const isPending = signalMutation.isPending

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-2 flex-1">
          <h3 className="text-sm font-semibold text-content-primary">Approval Required</h3>
          <p className="text-sm text-content-secondary">
            The optimizer found an improvement of <span className="font-medium text-emerald-500">+{improvementDelta.toFixed(1)}%</span> for{' '}
            <span className="font-medium text-content-primary">{agentName}</span>.
            Score: {scoreBefore.toFixed(2)} &rarr; {scoreAfter.toFixed(2)}.
            {improvementDelta < 5 && improvementDelta >= 1 && (
              <> This is within the marginal range (1-5%) and requires human approval.</>
            )}
          </p>

          {changes.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-content-muted">Changes:</p>
              <ul className="text-sm text-content-secondary space-y-0.5">
                {changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-content-muted mt-0.5">•</span>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleSignal('approve')}
              disabled={isPending}
              className="btn btn-primary text-sm"
            >
              {isPending && action === 'approve' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Approve & Deploy
            </button>
            <button
              type="button"
              onClick={() => handleSignal('reject')}
              disabled={isPending}
              className="btn bg-rose-500 hover:bg-rose-600 text-white text-sm"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => handleSignal('skipStage')}
              disabled={isPending}
              className="btn btn-ghost text-sm"
            >
              Skip Stage
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
