'use client'

import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { EvalCaseCreate, ScorerType } from '@/lib/types'
import { ALL_SCORERS } from './types'

interface CaseEditorProps {
  caseData: EvalCaseCreate
  index: number
  onChange: (updated: EvalCaseCreate) => void
  onRemove: () => void
}

export function CaseEditor({ caseData, index, onChange, onRemove }: CaseEditorProps) {
  const [expanded, setExpanded] = useState(true)

  const updateField = <K extends keyof EvalCaseCreate>(key: K, value: EvalCaseCreate[K]) => {
    onChange({ ...caseData, [key]: value })
  }

  const toggleScorer = (scorer: ScorerType) => {
    const current = caseData.scorers
    const updated = current.includes(scorer)
      ? current.filter((s) => s !== scorer)
      : [...current, scorer]
    updateField('scorers', updated)
  }

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            Case {index + 1}: {caseData.name || '(untitled)'}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-zinc-500 hover:text-red-400 transition-colors"
          title="Remove case"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Case Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={caseData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Handle refund request"
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Input (JSON) */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Input (JSON) <span className="text-red-400">*</span>
            </label>
            <textarea
              value={JSON.stringify(caseData.input, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  updateField('input', parsed)
                } catch {
                  // Allow invalid JSON while typing
                }
              }}
              rows={4}
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder='{"message": "I want a refund"}'
            />
          </div>

          {/* Expected tools */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Expected Tools (comma-separated)
            </label>
            <input
              type="text"
              value={(caseData.expected_tools ?? []).join(', ')}
              onChange={(e) =>
                updateField(
                  'expected_tools',
                  e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [],
                )
              }
              placeholder="lookup_order, process_refund"
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Expected output contains */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Expected Output Contains (comma-separated)
            </label>
            <input
              type="text"
              value={(caseData.expected_output_contains ?? []).join(', ')}
              onChange={(e) =>
                updateField(
                  'expected_output_contains',
                  e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [],
                )
              }
              placeholder="refund processed, confirmation"
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Scorers */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Scorers</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SCORERS.map((scorer) => {
                const active = caseData.scorers.includes(scorer.value)
                return (
                  <button
                    key={scorer.value}
                    type="button"
                    onClick={() => toggleScorer(scorer.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {scorer.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Min score + timeout row */}
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Min Score</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={caseData.min_score}
                onChange={(e) => updateField('min_score', Number.parseFloat(e.target.value) || 0.7)}
                className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Timeout (s)</label>
              <input
                type="number"
                min={1}
                max={3600}
                value={caseData.timeout_seconds}
                onChange={(e) => updateField('timeout_seconds', Number.parseInt(e.target.value, 10) || 60)}
                className="mt-1 block w-24 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">Tags (comma-separated)</label>
            <input
              type="text"
              value={caseData.tags.join(', ')}
              onChange={(e) =>
                updateField(
                  'tags',
                  e.target.value ? e.target.value.split(',').map((s) => s.trim()) : [],
                )
              }
              placeholder="refund, happy-path"
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
