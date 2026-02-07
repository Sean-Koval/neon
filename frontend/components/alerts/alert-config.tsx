'use client'

import { Save, Settings } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/toast'
import { useSaveThreshold } from '@/hooks/use-alerts'
import type { AlertThreshold } from '@/lib/regression'
import { DEFAULT_THRESHOLD } from '@/lib/regression'

interface AlertConfigProps {
  suiteId: string
  suiteName: string
  current?: AlertThreshold
}

export function AlertConfig({ suiteId, suiteName, current }: AlertConfigProps) {
  const [absoluteMin, setAbsoluteMin] = useState(
    current?.absoluteMin ?? DEFAULT_THRESHOLD.absoluteMin,
  )
  const [dropPercent, setDropPercent] = useState(
    current?.dropPercent ?? DEFAULT_THRESHOLD.dropPercent,
  )
  const [windowSize, setWindowSize] = useState(
    current?.windowSize ?? DEFAULT_THRESHOLD.windowSize,
  )
  const { addToast } = useToast()

  const { mutate: save, isPending } = useSaveThreshold({
    onSuccess: () => addToast('Threshold saved', 'success'),
    onError: () => addToast('Failed to save threshold', 'error'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    save({ suiteId, absoluteMin, dropPercent, windowSize })
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Settings className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-medium text-gray-900">{suiteName}</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor={`abs-${suiteId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Absolute minimum score (0-1)
          </label>
          <input
            id={`abs-${suiteId}`}
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={absoluteMin}
            onChange={(e) => setAbsoluteMin(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`drop-${suiteId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Drop % from average to trigger alert (0-1)
          </label>
          <input
            id={`drop-${suiteId}`}
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={dropPercent}
            onChange={(e) => setDropPercent(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`win-${suiteId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Historical window size (runs)
          </label>
          <input
            id={`win-${suiteId}`}
            type="number"
            min="1"
            max="50"
            step="1"
            value={windowSize}
            onChange={(e) => setWindowSize(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary inline-flex items-center gap-1.5 text-sm"
        >
          <Save className="w-3.5 h-3.5" />
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  )
}
