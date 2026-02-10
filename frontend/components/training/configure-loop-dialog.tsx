'use client'

import { clsx } from 'clsx'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface ConfigureLoopDialogProps {
  onClose: () => void
  onCreated?: () => void
  defaultAgentId?: string
}

const STRATEGIES = [
  {
    id: 'coordinate_ascent' as const,
    label: 'Coordinate Ascent',
    desc: 'Iteratively optimize one parameter at a time while holding others fixed. Best for stable, incremental improvement.',
  },
  {
    id: 'example_selection' as const,
    label: 'Example Selection',
    desc: 'Add/remove few-shot examples based on performance. Best for agents that rely on in-context learning.',
  },
  {
    id: 'reflection' as const,
    label: 'Reflection',
    desc: 'Use an LLM to analyze failures and rewrite prompts. Best for complex system prompts with many instructions.',
  },
]

const TRIGGERS = [
  { id: 'manual' as const, label: 'Manual', desc: 'Start loop now, run once' },
  { id: 'regression' as const, label: 'Regression', desc: 'Auto-start when score drops below threshold' },
  { id: 'signal' as const, label: 'Signal', desc: 'Start when feedback count exceeds threshold' },
]

const MONITORING_PERIODS = ['6h', '12h', '24h', '48h', '72h'] as const

export function ConfigureLoopDialog({ onClose, onCreated, defaultAgentId }: ConfigureLoopDialogProps) {
  const [agentId, setAgentId] = useState(defaultAgentId ?? '')
  const [strategy, setStrategy] = useState<'coordinate_ascent' | 'example_selection' | 'reflection'>('coordinate_ascent')
  const [trigger, setTrigger] = useState<'manual' | 'regression' | 'signal'>('manual')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [maxIterations, setMaxIterations] = useState(3)
  const [improvementThreshold, setImprovementThreshold] = useState(2)
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(5)
  const [evalSuiteId, setEvalSuiteId] = useState('')
  const [monitoringPeriod, setMonitoringPeriod] = useState<'6h' | '12h' | '24h' | '48h' | '72h'>('24h')

  const { data: agents } = trpc.agents.list.useQuery()
  const { data: suites } = trpc.suites.list.useQuery()
  const startMutation = trpc.trainingLoops.start.useMutation()

  const agentList = agents ?? []
  const suiteList = (suites as Array<{ id: string; name: string }>) ?? []

  const isValid = agentId.length > 0 && autoApproveThreshold > improvementThreshold

  const summary = useMemo(() => {
    const agent = agentId || 'selected agent'
    const stratLabel = STRATEGIES.find((s) => s.id === strategy)?.label?.toLowerCase() || strategy
    return `Will run ${stratLabel} on ${agent} for up to ${maxIterations} iterations. Improvements ≥${autoApproveThreshold}% auto-approved, ${improvementThreshold}-${autoApproveThreshold}% requires review, <${improvementThreshold}% rejected. After deployment, monitors for ${monitoringPeriod} before marking complete.`
  }, [agentId, strategy, maxIterations, improvementThreshold, autoApproveThreshold, monitoringPeriod])

  const handleStart = useCallback(async () => {
    await startMutation.mutateAsync({
      agentId,
      strategy,
      trigger,
      maxIterations,
      improvementThreshold,
      autoApproveThreshold,
      evalSuiteId: evalSuiteId || undefined,
      monitoringPeriod,
    })
    onCreated?.()
    onClose()
  }, [agentId, strategy, trigger, maxIterations, improvementThreshold, autoApproveThreshold, evalSuiteId, monitoringPeriod, startMutation, onCreated, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-content-primary">Configure Optimization Loop</h2>
            <button type="button" onClick={onClose} className="p-1 hover:bg-surface-overlay rounded">
              <X className="w-5 h-5 text-content-muted" />
            </button>
          </div>

          {/* Agent */}
          <div>
            <label className="text-sm font-medium text-content-primary block mb-1">Agent *</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
            >
              <option value="">Select agent...</option>
              {agentList.map((a: { id: string; name: string }) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="text-sm font-medium text-content-primary block mb-2">Strategy *</label>
            <div className="space-y-3">
              {STRATEGIES.map((s) => (
                <label key={s.id} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="strategy"
                    value={s.id}
                    checked={strategy === s.id}
                    onChange={() => setStrategy(s.id)}
                    className="mt-1 accent-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-content-primary">{s.label}</p>
                    <p className="text-xs text-content-muted max-w-md">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="text-sm font-medium text-content-primary block mb-2">Trigger *</label>
            <div className="space-y-2">
              {TRIGGERS.map((t) => (
                <label key={t.id} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="trigger"
                    value={t.id}
                    checked={trigger === t.id}
                    onChange={() => setTrigger(t.id)}
                    className="mt-1 accent-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-content-primary">{t.label}</p>
                    <p className="text-xs text-content-muted">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-content-muted hover:text-content-primary"
            >
              <ChevronDown className={clsx('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-6 border-l-2 border-border">
                <div>
                  <label className="text-sm font-medium text-content-primary block mb-1">Max Iterations</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Number(e.target.value))}
                    className="w-24 h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-content-primary block mb-1">Improvement Threshold (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={improvementThreshold}
                    onChange={(e) => setImprovementThreshold(Number(e.target.value))}
                    className="w-24 h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                  />
                  <p className="text-xs text-content-muted mt-1">Improvements below this are auto-rejected.</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-content-primary block mb-1">Auto-Approve Threshold (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={autoApproveThreshold}
                    onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
                    className="w-24 h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                  />
                  {autoApproveThreshold <= improvementThreshold && (
                    <p className="text-xs text-amber-500 mt-1">Auto-approve threshold must be greater than improvement threshold.</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-content-primary block mb-1">Eval Suite</label>
                  <select
                    value={evalSuiteId}
                    onChange={(e) => setEvalSuiteId(e.target.value)}
                    className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                  >
                    <option value="">Select eval suite...</option>
                    {suiteList.map((s: { id: string; name: string }) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-content-primary block mb-1">Monitoring Period</label>
                  <select
                    value={monitoringPeriod}
                    onChange={(e) => setMonitoringPeriod(e.target.value as typeof monitoringPeriod)}
                    className="w-32 h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                  >
                    {MONITORING_PERIODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-surface-overlay/20 rounded-md p-3">
            <p className="text-xs text-content-muted">{summary}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={handleStart}
              disabled={!isValid || startMutation.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {startMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
              ) : (
                'Start Loop'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
