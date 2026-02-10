'use client'

import { clsx } from 'clsx'
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { groupRunsBySuite } from '@/hooks/use-runs'
import { safeFormat, safeFormatDistance } from '@/lib/format-date'
import type { EvalRun } from '@/lib/types'

interface RunSelectorProps {
  label: string
  runs: EvalRun[]
  selectedRunId: string | undefined
  onSelect: (runId: string | undefined) => void
  suiteFilter?: string
  placeholder?: string
  disabled?: boolean
}

export function RunSelector({
  label,
  runs,
  selectedRunId,
  onSelect,
  suiteFilter,
  placeholder = 'Select a run...',
  disabled = false,
}: RunSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter runs by suite if filter is set
  const filteredRuns = useMemo(() => {
    let result = runs
    if (suiteFilter) {
      result = runs.filter((r) => r.suite_name === suiteFilter)
    }
    return result
  }, [runs, suiteFilter])

  // Group runs by suite
  const groupedRuns = useMemo(() => {
    return groupRunsBySuite(filteredRuns)
  }, [filteredRuns])

  // Filter by search term
  const searchFilteredGroups = useMemo(() => {
    if (!search.trim()) return groupedRuns

    const searchLower = search.toLowerCase()
    return groupedRuns
      .map((group) => ({
        ...group,
        runs: group.runs.filter(
          (run) =>
            run.suite_name.toLowerCase().includes(searchLower) ||
            run.agent_version?.toLowerCase().includes(searchLower) ||
            run.id.toLowerCase().includes(searchLower),
        ),
      }))
      .filter((group) => group.runs.length > 0)
  }, [groupedRuns, search])

  // Find selected run
  const selectedRun = useMemo(() => {
    if (!selectedRunId) return undefined
    return runs.find((r) => r.id === selectedRunId)
  }, [runs, selectedRunId])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearch('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (runId: string) => {
    onSelect(runId)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(undefined)
  }

  const labelId = `run-selector-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div ref={containerRef} className="relative">
      <span
        id={labelId}
        className="mb-2 block text-sm font-medium text-content-secondary"
      >
        {label}
      </span>

      {/* Selected value display / trigger */}
      <button
        type="button"
        aria-labelledby={labelId}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full flex items-center justify-between px-3 py-2 text-left',
          'border rounded-lg transition-colors',
          disabled
            ? 'cursor-not-allowed border-border bg-surface-raised/60 text-content-muted'
            : 'border-border bg-surface-card hover:border-primary-500/40',
          isOpen && 'ring-2 ring-primary-500 border-primary-500',
        )}
      >
        <span
          className={clsx('truncate', !selectedRun && 'text-content-muted')}
        >
          {selectedRun ? (
            <span className="flex items-center gap-2">
              <span className="font-medium text-content-primary">
                {selectedRun.suite_name}
              </span>
              <span className="text-content-muted">-</span>
              <span className="text-content-secondary">
                {selectedRun.agent_version || selectedRun.id.slice(0, 8)}
              </span>
            </span>
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center gap-1">
          {selectedRun && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-content-muted hover:text-content-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={clsx(
              'h-4 w-4 text-content-muted transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-card shadow-lg dark:border-slate-700/80 dark:bg-slate-900">
          {/* Search input */}
          <div className="border-b border-border/70 p-2 dark:border-slate-700/70">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search runs..."
                className="w-full rounded-md border border-border bg-surface-card py-2 pl-9 pr-3 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto">
            {searchFilteredGroups.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-content-muted">
                No runs found
              </div>
            ) : (
              searchFilteredGroups.map((group) => (
                <div key={group.suiteId}>
                  {/* Suite group header */}
                  <div className="sticky top-0 bg-surface-raised/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-content-muted backdrop-blur-sm dark:bg-slate-950/75">
                    {group.suiteName}
                  </div>

                  {/* Runs in group */}
                  {group.runs.map((run) => (
                    <RunOption
                      key={run.id}
                      run={run}
                      isSelected={run.id === selectedRunId}
                      onSelect={() => handleSelect(run.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface RunOptionProps {
  run: EvalRun
  isSelected: boolean
  onSelect: () => void
}

function RunOption({ run, isSelected, onSelect }: RunOptionProps) {
  const statusIcon =
    run.status === 'completed' ? (
      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
    ) : (
      <Clock className="w-3.5 h-3.5 text-gray-400" />
    )

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'w-full px-3 py-2 text-left transition-colors hover:bg-surface-raised/60 dark:hover:bg-slate-800/60',
        isSelected && 'bg-primary-500/10',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {statusIcon}
          <span className="truncate font-medium text-content-primary">
            {run.agent_version || run.id.slice(0, 8)}
          </span>
        </div>
        {run.summary && (
          <span
            className={clsx(
              'text-sm font-medium',
              run.summary.avg_score >= 0.8
                ? 'text-green-600 dark:text-emerald-400'
                : run.summary.avg_score >= 0.6
                  ? 'text-yellow-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400',
            )}
          >
            {(run.summary.avg_score * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-content-muted">
        <Calendar className="w-3 h-3" />
        <span>
          {safeFormat(run.created_at, 'MMM d, yyyy')} (
          {safeFormatDistance(run.created_at)})
        </span>
      </div>
    </button>
  )
}

interface RunSummaryCardProps {
  run: EvalRun | undefined
  label: string
}

export function RunSummaryCard({ run, label }: RunSummaryCardProps) {
  if (!run) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-content-muted dark:border-slate-700/80">
        Select a {label.toLowerCase()} run to see details
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised/50 p-4 dark:border-slate-700/80 dark:bg-slate-950/40">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-content-primary">{label}</h4>
        <span
          className={clsx(
            'badge',
            run.status === 'completed' ? 'badge-green' : 'badge-gray',
          )}
        >
          {run.status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-content-muted">Suite</span>
          <span className="font-medium text-content-primary">
            {run.suite_name}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-content-muted">Version</span>
          <span className="font-medium text-content-primary">
            {run.agent_version || run.id.slice(0, 8)}
          </span>
        </div>
        {run.summary && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-content-muted">Score</span>
              <span
                className={clsx(
                  'font-medium',
                  run.summary.avg_score >= 0.8
                    ? 'text-green-600 dark:text-emerald-400'
                    : run.summary.avg_score >= 0.6
                      ? 'text-yellow-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400',
                )}
              >
                {(run.summary.avg_score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-content-muted">Results</span>
              <span className="font-medium text-content-primary">
                <span className="text-green-600 dark:text-emerald-400">
                  {run.summary.passed}
                </span>
                {' / '}
                <span className="text-content-secondary">
                  {run.summary.total_cases}
                </span>
                {' passed'}
              </span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-content-muted">Date</span>
          <span className="text-content-primary">
            {safeFormat(run.created_at, 'MMM d, yyyy h:mm a')}
          </span>
        </div>
      </div>
    </div>
  )
}

interface ThresholdSelectorProps {
  value: number
  onChange: (value: number) => void
  options?: readonly { value: number; label: string }[]
}

export function ThresholdSelector({
  value,
  onChange,
  options = [
    { value: 0.01, label: '1%' },
    { value: 0.05, label: '5%' },
    { value: 0.1, label: '10%' },
    { value: 0.15, label: '15%' },
    { value: 0.2, label: '20%' },
  ],
}: ThresholdSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-content-secondary">
        Regression Threshold
        <HelpTooltip content="Minimum score drop to flag as a regression. Lower values catch smaller changes but may increase noise." />
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              value === option.value
                ? 'bg-primary-600 text-white'
                : 'bg-surface-raised text-content-secondary hover:bg-surface-raised/80 dark:bg-slate-800/70 dark:hover:bg-slate-700/70',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-content-muted">
        Score drops greater than this threshold are flagged as regressions
      </p>
    </fieldset>
  )
}

interface SuiteFilterProps {
  suites: string[]
  value: string
  onChange: (value: string) => void
}

export function SuiteFilter({ suites, value, onChange }: SuiteFilterProps) {
  return (
    <div>
      <label
        htmlFor="suite-filter"
        className="mb-2 block text-sm font-medium text-content-secondary"
      >
        Filter by Suite
      </label>
      <select
        id="suite-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-content-secondary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      >
        <option value="">All Suites</option>
        {suites.map((suite) => (
          <option key={suite} value={suite}>
            {suite}
          </option>
        ))}
      </select>
    </div>
  )
}
