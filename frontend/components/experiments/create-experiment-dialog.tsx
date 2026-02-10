'use client'

import { clsx } from 'clsx'
import { FlaskConical, GitBranch, Layers, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useToast } from '@/components/toast'
import { useCreateExperiment } from '@/hooks/use-experiments'
import type { ExperimentType } from '@/hooks/use-experiments'

interface CreateExperimentDialogProps {
  open: boolean
  onClose: () => void
}

interface FormState {
  type: ExperimentType | null
  name: string
  agentId: string
  // AB test
  variantAAgentId: string
  variantAVersion: string
  variantBAgentId: string
  variantBVersion: string
  // Rollout
  baselineVersion: string
  candidateVersion: string
  // Eval config
  suiteId: string
  scorers: string[]
  sampleSize: number
  significanceLevel: number
  // Rollout stages
  stages: Array<{ percentage: number; gateThreshold: number }>
  stageDurationMs: number
}

const defaultStages = [
  { percentage: 1, gateThreshold: 0.8 },
  { percentage: 5, gateThreshold: 0.8 },
  { percentage: 25, gateThreshold: 0.85 },
  { percentage: 50, gateThreshold: 0.85 },
  { percentage: 100, gateThreshold: 0.9 },
]

const initialState: FormState = {
  type: null,
  name: '',
  agentId: '',
  variantAAgentId: '',
  variantAVersion: '',
  variantBAgentId: '',
  variantBVersion: '',
  baselineVersion: '',
  candidateVersion: '',
  suiteId: '',
  scorers: [],
  sampleSize: 100,
  significanceLevel: 0.05,
  stages: defaultStages,
  stageDurationMs: 300000,
}

/**
 * Multi-step dialog for creating new experiments.
 * Step 1: Type selection (A/B Test or Progressive Rollout)
 * Step 2: Variant configuration
 * Step 3: Evaluation configuration
 * Step 4: Review & Start
 */
export function CreateExperimentDialog({ open, onClose }: CreateExperimentDialogProps) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(initialState)
  const router = useRouter()
  const { addToast } = useToast()
  const createMutation = useCreateExperiment()

  const updateForm = useCallback(
    (updates: Partial<FormState>) => {
      setForm((prev) => ({ ...prev, ...updates }))
    },
    [],
  )

  const handleClose = () => {
    setStep(1)
    setForm(initialState)
    onClose()
  }

  const handleTypeSelect = (type: ExperimentType) => {
    updateForm({ type })
    setStep(2)
  }

  const canAdvanceStep2 = () => {
    if (!form.name.trim()) return false
    if (form.type === 'ab_test') {
      return !!form.variantAVersion && !!form.variantBVersion
    }
    return !!form.baselineVersion && !!form.candidateVersion
  }

  const canAdvanceStep3 = () => {
    if (form.type === 'ab_test') {
      return form.sampleSize > 0
    }
    return form.stages.length > 0
  }

  const handleSubmit = async () => {
    try {
      const result = await createMutation.mutateAsync({
        name: form.name,
        type: form.type!,
        agentId: form.agentId || form.variantAAgentId || 'default',
        ...(form.type === 'ab_test'
          ? {
              abTest: {
                variantA: {
                  agentId: form.variantAAgentId || form.agentId || 'default',
                  agentVersion: form.variantAVersion,
                  label: 'Baseline',
                },
                variantB: {
                  agentId: form.variantBAgentId || form.agentId || 'default',
                  agentVersion: form.variantBVersion,
                  label: 'Candidate',
                },
                suiteId: form.suiteId || 'default',
                scorers: form.scorers.length > 0 ? form.scorers : ['tool_selection'],
                sampleSize: form.sampleSize,
                significanceLevel: form.significanceLevel,
              },
            }
          : {
              rollout: {
                baseline: {
                  agentId: form.agentId || 'default',
                  agentVersion: form.baselineVersion,
                },
                candidate: {
                  agentId: form.agentId || 'default',
                  agentVersion: form.candidateVersion,
                },
                suiteId: form.suiteId || 'default',
                scorers: form.scorers.length > 0 ? form.scorers : ['tool_selection'],
                stages: form.stages,
                stageDurationMs: form.stageDurationMs,
              },
            }),
      })

      addToast('Experiment started successfully', 'success')
      handleClose()
      router.push(`/experiments/${result.experimentId}`)
    } catch {
      addToast('Failed to create experiment', 'error')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 bg-surface-card border border-border rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-content-primary">
              New Experiment
            </h2>
            <span className="text-xs text-content-muted">
              Step {step} of 4
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-content-muted hover:text-content-primary rounded-md hover:bg-surface-raised transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={clsx(
                  'h-1 flex-1 rounded-full transition-colors',
                  s <= step ? 'bg-cyan-500' : 'bg-surface-raised',
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-content-secondary text-sm">
                Choose the type of experiment to run.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleTypeSelect('ab_test')}
                  className="card p-6 text-left hover:border-cyan-500/50 transition-colors cursor-pointer group"
                >
                  <GitBranch className="w-8 h-8 text-violet-500 mb-3 group-hover:text-cyan-500 transition-colors" />
                  <h3 className="font-semibold text-content-primary mb-1">A/B Test</h3>
                  <p className="text-xs text-content-muted">
                    Compare two variants head-to-head with statistical significance testing
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeSelect('progressive_rollout')}
                  className="card p-6 text-left hover:border-cyan-500/50 transition-colors cursor-pointer group"
                >
                  <Layers className="w-8 h-8 text-emerald-500 mb-3 group-hover:text-cyan-500 transition-colors" />
                  <h3 className="font-semibold text-content-primary mb-1">Progressive Rollout</h3>
                  <p className="text-xs text-content-muted">
                    Gradually increase traffic through gated stages with automatic rollback
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Variant Configuration */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium text-content-primary">
                {form.type === 'ab_test' ? 'A/B Test Configuration' : 'Rollout Configuration'}
              </h3>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Experiment Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g., prompt-v3-test"
                  className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Agent
                </label>
                <input
                  type="text"
                  value={form.agentId}
                  onChange={(e) => updateForm({ agentId: e.target.value })}
                  placeholder="Agent ID"
                  className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {form.type === 'ab_test' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-content-secondary">Variant A (Baseline)</h4>
                    <input
                      type="text"
                      value={form.variantAVersion}
                      onChange={(e) => updateForm({ variantAVersion: e.target.value })}
                      placeholder="Version (e.g., v2.1)"
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-content-secondary">Variant B (Candidate)</h4>
                    <input
                      type="text"
                      value={form.variantBVersion}
                      onChange={(e) => updateForm({ variantBVersion: e.target.value })}
                      placeholder="Version (e.g., v2.2)"
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-content-secondary">Baseline Version</h4>
                    <input
                      type="text"
                      value={form.baselineVersion}
                      onChange={(e) => updateForm({ baselineVersion: e.target.value })}
                      placeholder="Current version"
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-content-secondary">Candidate Version</h4>
                    <input
                      type="text"
                      value={form.candidateVersion}
                      onChange={(e) => updateForm({ candidateVersion: e.target.value })}
                      placeholder="New version"
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Evaluation Configuration */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-content-primary">Evaluation Configuration</h3>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Suite ID
                </label>
                <input
                  type="text"
                  value={form.suiteId}
                  onChange={(e) => updateForm({ suiteId: e.target.value })}
                  placeholder="Evaluation suite ID"
                  className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {form.type === 'ab_test' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">
                      Sample Size
                    </label>
                    <input
                      type="number"
                      value={form.sampleSize}
                      onChange={(e) => updateForm({ sampleSize: parseInt(e.target.value) || 100 })}
                      min={10}
                      max={10000}
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">
                      Significance Level
                    </label>
                    <select
                      value={form.significanceLevel}
                      onChange={(e) => updateForm({ significanceLevel: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 bg-surface-card border border-border rounded-lg text-content-primary text-sm focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value={0.01}>0.01 (99% confidence)</option>
                      <option value={0.05}>0.05 (95% confidence)</option>
                      <option value={0.1}>0.10 (90% confidence)</option>
                    </select>
                  </div>
                </div>
              )}

              {form.type === 'progressive_rollout' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-content-secondary">Stage Configuration</h4>
                  {form.stages.map((stage, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-xs text-content-muted">Stage {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={stage.percentage}
                          onChange={(e) => {
                            const newStages = [...form.stages]
                            newStages[i] = { ...stage, percentage: parseInt(e.target.value) || 0 }
                            updateForm({ stages: newStages })
                          }}
                          min={1}
                          max={100}
                          className="w-full px-2 py-1.5 bg-surface-card border border-border rounded text-content-primary text-xs focus:outline-none focus:border-cyan-500/50"
                        />
                        <span className="text-xs text-content-muted">%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.01}
                          value={stage.gateThreshold}
                          onChange={(e) => {
                            const newStages = [...form.stages]
                            newStages[i] = { ...stage, gateThreshold: parseFloat(e.target.value) || 0 }
                            updateForm({ stages: newStages })
                          }}
                          min={0}
                          max={1}
                          className="w-full px-2 py-1.5 bg-surface-card border border-border rounded text-content-primary text-xs focus:outline-none focus:border-cyan-500/50"
                        />
                        <span className="text-xs text-content-muted">gate</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review & Start */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-content-primary">Review Configuration</h3>

              <div className="bg-surface-raised rounded-lg p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-content-muted">Name</span>
                  <span className="text-content-primary font-medium">{form.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-muted">Type</span>
                  <span className="text-content-primary font-medium">
                    {form.type === 'ab_test' ? 'A/B Test' : 'Progressive Rollout'}
                  </span>
                </div>
                {form.type === 'ab_test' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Variant A</span>
                      <span className="text-content-primary">{form.variantAVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Variant B</span>
                      <span className="text-content-primary">{form.variantBVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Sample Size</span>
                      <span className="text-content-primary">{form.sampleSize}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Significance</span>
                      <span className="text-content-primary">{form.significanceLevel}</span>
                    </div>
                  </>
                )}
                {form.type === 'progressive_rollout' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Stages</span>
                      <span className="text-content-primary">
                        {form.stages.map((s) => `${s.percentage}%`).join(' → ')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="btn btn-secondary text-sm"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleClose} className="btn btn-secondary text-sm">
              Cancel
            </button>
            {step < 4 && step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={step === 2 ? !canAdvanceStep2() : step === 3 ? !canAdvanceStep3() : false}
                className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {createMutation.isPending ? 'Starting...' : 'Start Experiment'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
