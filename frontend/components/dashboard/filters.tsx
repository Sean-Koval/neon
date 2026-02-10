'use client'

import { Calendar, ChevronDown, Filter, X } from 'lucide-react'
import { useState } from 'react'
import type { EvalRunStatus, EvalSuite } from '@/lib/types'

export type DateRangeOption = '7d' | '30d' | '90d' | 'all'

export interface DashboardFilters {
  status: EvalRunStatus | 'all'
  suiteId: string | 'all'
  dateRange: DateRangeOption
}

interface FilterButtonProps {
  label: string
  value: string
  isActive: boolean
  onClick: () => void
}

function FilterButton({ label, value, isActive, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200
        ${
          isActive
            ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-500/25'
            : 'bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-300 border border-transparent hover:bg-gray-200 dark:hover:bg-dark-700'
        }
      `}
    >
      {label}
    </button>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  icon?: React.ReactNode
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  icon,
}: FilterSelectProps) {
  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`
            w-full appearance-none rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800
            py-2 pr-8 text-sm font-medium text-gray-700 dark:text-gray-100
            hover:border-primary-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500
            transition-colors cursor-pointer
            ${icon ? 'pl-9' : 'pl-3'}
          `}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      </div>
    </div>
  )
}

interface DashboardFiltersBarProps {
  filters: DashboardFilters
  onFiltersChange: (filters: DashboardFilters) => void
  suites: EvalSuite[]
  isLoadingSuites?: boolean
}

export function DashboardFiltersBar({
  filters,
  onFiltersChange,
  suites,
  isLoadingSuites,
}: DashboardFiltersBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusOptions: { value: EvalRunStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'running', label: 'Running' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  const suiteOptions = [
    { value: 'all', label: 'All Suites' },
    ...suites.map((suite) => ({ value: suite.id, label: suite.name })),
  ]

  const dateRangeOptions: { value: DateRangeOption; label: string }[] = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
  ]

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.suiteId !== 'all' ||
    filters.dateRange !== '7d'

  const clearFilters = () => {
    onFiltersChange({
      status: 'all',
      suiteId: 'all',
      dateRange: '7d',
    })
  }

  return (
    <div className="space-y-3">
      {/* Quick filter pills for date range */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Time Range:</span>
          <div className="flex gap-1">
            {dateRangeOptions.map((opt) => (
              <FilterButton
                key={opt.value}
                label={opt.label}
                value={opt.value}
                isActive={filters.dateRange === opt.value}
                onClick={() =>
                  onFiltersChange({ ...filters, dateRange: opt.value })
                }
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
            transition-all duration-200
            ${
              isExpanded || hasActiveFilters
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-500/25'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
            }
          `}
        >
          <Filter className="w-4 h-4" />
          More Filters
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 bg-primary-600 text-white text-xs rounded-full">
              {
                [
                  filters.status !== 'all',
                  filters.suiteId !== 'all',
                  filters.dateRange !== '7d',
                ].filter(Boolean).length
              }
            </span>
          )}
        </button>
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="p-4 bg-gray-50 dark:bg-dark-900 rounded-lg border border-gray-200 dark:border-dark-700 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FilterSelect
              label="Status"
              value={filters.status}
              options={statusOptions}
              onChange={(value) =>
                onFiltersChange({
                  ...filters,
                  status: value as EvalRunStatus | 'all',
                })
              }
            />
            <FilterSelect
              label="Suite"
              value={filters.suiteId}
              options={
                isLoadingSuites
                  ? [{ value: 'all', label: 'Loading...' }]
                  : suiteOptions
              }
              onChange={(value) =>
                onFiltersChange({ ...filters, suiteId: value })
              }
            />
            <FilterSelect
              label="Date Range"
              value={filters.dateRange}
              options={dateRangeOptions}
              onChange={(value) =>
                onFiltersChange({
                  ...filters,
                  dateRange: value as DateRangeOption,
                })
              }
              icon={<Calendar className="w-4 h-4 text-gray-400" />}
            />
          </div>

          {hasActiveFilters && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-dark-700 flex justify-end">
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <X className="w-4 h-4" />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper to convert date range to start date
export function getDateFromRange(range: DateRangeOption): Date | null {
  const now = new Date()
  switch (range) {
    case '7d':
      return new Date(now.setDate(now.getDate() - 7))
    case '30d':
      return new Date(now.setDate(now.getDate() - 30))
    case '90d':
      return new Date(now.setDate(now.getDate() - 90))
    case 'all':
      return null
  }
}
