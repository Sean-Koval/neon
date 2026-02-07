'use client'

import { ArrowLeft, ArrowRight, Loader2, Save } from 'lucide-react'
import { useCallback, useState } from 'react'
import { StepCases } from './step-cases'
import { StepConfig } from './step-config'
import { StepInfo } from './step-info'
import { StepReview } from './step-review'
import {
  DEFAULT_FORM_DATA,
  type SuiteFormData,
  WIZARD_STEPS,
  type WizardStep,
} from './types'

interface SuiteEditorProps {
  initialData?: Partial<SuiteFormData>
  onSubmit: (data: SuiteFormData) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

export function SuiteEditor({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Suite',
}: SuiteEditorProps) {
  const [data, setData] = useState<SuiteFormData>({
    ...DEFAULT_FORM_DATA,
    ...initialData,
  })
  const [currentStep, setCurrentStep] = useState<WizardStep>('info')
  const [submitting, setSubmitting] = useState(false)

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === currentStep)
  const isFirst = stepIndex === 0
  const isLast = stepIndex === WIZARD_STEPS.length - 1

  const onChange = useCallback((updates: Partial<SuiteFormData>) => {
    setData((prev) => ({ ...prev, ...updates }))
  }, [])

  const goNext = () => {
    if (!isLast) setCurrentStep(WIZARD_STEPS[stepIndex + 1].key)
  }

  const goPrev = () => {
    if (!isFirst) setCurrentStep(WIZARD_STEPS[stepIndex - 1].key)
  }

  const canSubmit =
    data.name.trim() !== '' &&
    data.agent_id.trim() !== '' &&
    data.default_scorers.length > 0 &&
    data.cases.length > 0 &&
    data.cases.every((c) => c.name.trim() !== '' && c.scorers.length > 0)

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <nav className="mb-8">
        <ol className="flex items-center gap-2">
          {WIZARD_STEPS.map((step, i) => {
            const isCurrent = step.key === currentStep
            const isPast = i < stepIndex
            return (
              <li key={step.key} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-zinc-700" />}
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.key)}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : isPast
                        ? 'bg-zinc-700 text-zinc-200'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-xs bg-black/20">
                    {i + 1}
                  </span>
                  {step.label}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === 'info' && <StepInfo data={data} onChange={onChange} />}
        {currentStep === 'config' && (
          <StepConfig data={data} onChange={onChange} />
        )}
        {currentStep === 'cases' && (
          <StepCases data={data} onChange={onChange} />
        )}
        {currentStep === 'review' && <StepReview data={data} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-700">
        <div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isFirst && (
            <button
              type="button"
              onClick={goPrev}
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}

          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {isLast && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
