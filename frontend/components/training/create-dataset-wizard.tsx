'use client'

import { clsx } from 'clsx'
import { Check, Loader2, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface CreateDatasetWizardProps {
  onClose: () => void
  onCreated?: (id: string) => void
  defaultAgentId?: string
}

const FORMATS = [
  { id: 'sft' as const, label: 'SFT', desc: 'Single-turn: input → corrected output' },
  { id: 'dpo' as const, label: 'DPO', desc: 'Paired: input → chosen output + rejected output' },
  { id: 'kto' as const, label: 'KTO', desc: 'Binary: input → output + good/bad label' },
  { id: 'dspy' as const, label: 'DSPy', desc: 'Prompt/completion pairs for DSPy optimization' },
]

const SPLIT_OPTIONS = [
  { label: '70/30', value: 70 },
  { label: '80/20', value: 80 },
  { label: '90/10', value: 90 },
]

export function CreateDatasetWizard({ onClose, onCreated, defaultAgentId }: CreateDatasetWizardProps) {
  const [step, setStep] = useState(1)

  // Step 1
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState(defaultAgentId ?? '')
  const [format, setFormat] = useState<'sft' | 'dpo' | 'kto' | 'dspy'>('sft')

  // Step 2
  const [includeCorrections, setIncludeCorrections] = useState(true)
  const [includePreferences, setIncludePreferences] = useState(true)
  const [includeTraces, setIncludeTraces] = useState(true)
  const [scoreThreshold, setScoreThreshold] = useState(0.85)

  // Step 3
  const [trainTestRatio, setTrainTestRatio] = useState(80)
  const [stratified, setStratified] = useState(true)
  const [shuffleSeed, setShuffleSeed] = useState(42)

  const { data: agents } = trpc.agents.list.useQuery()
  const createMutation = trpc.datasets.create.useMutation()
  const { data: previewData } = trpc.datasets.getExamples.useQuery(
    { datasetId: 'ds-booking-sft-v3', limit: 3 },
    { enabled: step === 4 },
  )

  const agentList = agents ?? []

  const canNext = useMemo(() => {
    if (step === 1) return name.trim().length > 0 && agentId.length > 0
    if (step === 2) return includeCorrections || includePreferences || includeTraces
    if (step === 3) return trainTestRatio >= 50 && trainTestRatio <= 95
    return true
  }, [step, name, agentId, includeCorrections, includePreferences, includeTraces, trainTestRatio])

  const handleCreate = useCallback(async () => {
    const result = await createMutation.mutateAsync({
      name,
      agentId,
      format,
      sources: {
        corrections: includeCorrections,
        preferences: includePreferences,
        traces: includeTraces,
      },
      scoreThreshold,
      trainTestRatio,
      stratified,
      shuffleSeed,
    })
    onCreated?.(result.id)
    onClose()
  }, [name, agentId, format, includeCorrections, includePreferences, includeTraces, scoreThreshold, trainTestRatio, stratified, shuffleSeed, createMutation, onCreated, onClose])

  const steps = ['Configure', 'Sources', 'Split', 'Preview']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-content-primary">Create Dataset</h2>
            <button type="button" onClick={onClose} className="p-1 hover:bg-surface-overlay rounded">
              <X className="w-5 h-5 text-content-muted" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {steps.map((label, i) => {
              const stepNum = i + 1
              const isCompleted = stepNum < step
              const isCurrent = stepNum === step
              return (
                <div key={label} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => isCompleted && setStep(stepNum)}
                    disabled={!isCompleted}
                    className={clsx(
                      'w-6 h-6 rounded-full text-xs font-medium flex items-center justify-center',
                      isCompleted && 'bg-primary-500 text-white cursor-pointer',
                      isCurrent && 'bg-primary-500 text-white ring-2 ring-primary-500/30',
                      !isCompleted && !isCurrent && 'bg-surface-overlay text-content-muted',
                    )}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
                  </button>
                  <span className={clsx('text-xs', isCurrent ? 'text-content-primary font-medium' : 'text-content-muted')}>
                    {label}
                  </span>
                  {i < steps.length - 1 && (
                    <div className={clsx('w-8 h-0.5 rounded', isCompleted ? 'bg-primary-500' : 'bg-border')} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Step 1: Configure */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-content-primary block mb-1">Dataset Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. booking-agent-sft-v1"
                  className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500"
                />
              </div>
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
              <div>
                <label className="text-sm font-medium text-content-primary block mb-2">Format *</label>
                <div className="space-y-3">
                  {FORMATS.map((f) => (
                    <label key={f.id} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value={f.id}
                        checked={format === f.id}
                        onChange={() => setFormat(f.id)}
                        className="mt-1 accent-primary-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-content-primary">{f.label}</p>
                        <p className="text-xs text-content-muted">{f.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Sources */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-content-muted">Select which data sources to include.</p>

              <div className="card p-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeCorrections} onChange={(e) => setIncludeCorrections(e.target.checked)} className="accent-primary-500" />
                  <span className="text-sm text-content-primary font-medium">Include corrections</span>
                </label>
              </div>

              <div className="card p-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includePreferences} onChange={(e) => setIncludePreferences(e.target.checked)} className="accent-primary-500" />
                  <span className="text-sm text-content-primary font-medium">Include preference pairs</span>
                </label>
              </div>

              <div className="card p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeTraces} onChange={(e) => setIncludeTraces(e.target.checked)} className="accent-primary-500" />
                  <span className="text-sm text-content-primary font-medium">Include high-scoring traces</span>
                </label>
                {includeTraces && (
                  <div className="ml-6 space-y-2">
                    <label className="text-xs text-content-muted block">
                      Score threshold: {scoreThreshold.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.05}
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(Number(e.target.value))}
                      className="w-full accent-primary-500"
                    />
                    <div className="flex justify-between text-[10px] text-content-muted">
                      <span>0.5</span>
                      <span>1.0</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Split */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-content-primary block mb-2">Train / Test Split</label>
                <div className="bg-surface-overlay/30 rounded-lg p-1 inline-flex gap-1">
                  {SPLIT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTrainTestRatio(opt.value)}
                      className={clsx(
                        'px-3 py-1.5 rounded-md text-sm',
                        trainTestRatio === opt.value
                          ? 'bg-surface-card shadow-sm text-content-primary font-medium'
                          : 'text-content-muted hover:text-content-secondary',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split preview bar */}
              <div className="h-3 rounded-full overflow-hidden flex">
                <div className="bg-primary-500" style={{ width: `${trainTestRatio}%` }} />
                <div className="bg-primary-500/40" style={{ width: `${100 - trainTestRatio}%` }} />
              </div>
              <p className="text-xs text-content-muted">
                Stratified split maintains source distribution in both sets.
              </p>

              <div>
                <label className="text-sm font-medium text-content-primary block mb-1">Shuffle Seed</label>
                <input
                  type="number"
                  value={shuffleSeed}
                  onChange={(e) => setShuffleSeed(Number(e.target.value))}
                  className="w-24 h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
                />
                <p className="text-xs text-content-muted mt-1">Same seed = same split</p>
              </div>
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-surface-overlay/30 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-content-muted">Name</span>
                  <span className="text-content-primary">{name}</span>
                  <span className="text-content-muted">Agent</span>
                  <span className="text-content-primary">{agentId}</span>
                  <span className="text-content-muted">Format</span>
                  <span className="text-content-primary">{format.toUpperCase()}</span>
                  <span className="text-content-muted">Split</span>
                  <span className="text-content-primary">{trainTestRatio}/{100 - trainTestRatio}</span>
                  <span className="text-content-muted">Sources</span>
                  <span className="text-content-primary">
                    {[
                      includeCorrections && 'Corrections',
                      includePreferences && 'Preferences',
                      includeTraces && `Traces (≥${scoreThreshold})`,
                    ].filter(Boolean).join(' + ')}
                  </span>
                </div>
              </div>

              {/* Sample examples */}
              <div className="space-y-2">
                <p className="text-sm text-content-muted">Preview: sample examples</p>
                {(previewData?.examples ?? []).map((ex, i) => (
                  <div key={ex.id} className="bg-surface-overlay/20 rounded-md p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-content-primary">Example {i + 1}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        ex.source === 'corrections' ? 'bg-purple-500/20 text-purple-500' :
                          ex.source === 'preferences' ? 'bg-blue-500/20 text-blue-500' :
                            'bg-emerald-500/20 text-emerald-500',
                      )}>
                        {ex.source}
                      </span>
                    </div>
                    <p className="text-content-muted">Input: <span className="text-content-secondary font-mono">{ex.input}</span></p>
                    <p className="text-content-muted">Output: <span className="text-content-secondary font-mono line-clamp-2">{ex.output}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="btn btn-ghost">
                &larr; Back
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="btn btn-primary disabled:opacity-50"
              >
                Next &rarr;
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="btn btn-primary disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  'Create Dataset'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
