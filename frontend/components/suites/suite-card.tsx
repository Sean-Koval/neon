'use client'

import type { Suite } from '@/lib/api'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { Bot, ChevronRight, Clock, FileText } from 'lucide-react'
import Link from 'next/link'

interface SuiteCardProps {
  suite: Suite
}

export function SuiteCard({ suite }: SuiteCardProps) {
  return (
    <Link
      href={`/suites/${suite.id}`}
      className="card p-5 hover:shadow-md hover:border-primary-200 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="p-2 bg-primary-50 rounded-lg group-hover:bg-primary-100 transition-colors">
            <FileText className="w-6 h-6 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{suite.name}</h3>
            {suite.description && (
              <p className="mt-1 text-sm text-gray-500 line-clamp-2">{suite.description}</p>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 transition-colors flex-shrink-0" />
      </div>

      <div className="mt-4 flex items-center space-x-4 text-sm">
        <div className="flex items-center text-gray-500">
          <Bot className="w-4 h-4 mr-1.5" />
          <span className="truncate max-w-[120px]">{suite.agent_id}</span>
        </div>
        <div className="text-gray-400">|</div>
        <div className="text-gray-600 font-medium">{suite.cases?.length || 0} cases</div>
      </div>

      {suite.default_scorers && suite.default_scorers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suite.default_scorers.slice(0, 3).map((scorer) => (
            <span key={scorer} className="badge badge-gray text-xs">
              {scorer}
            </span>
          ))}
          {suite.default_scorers.length > 3 && (
            <span className="badge badge-gray text-xs">+{suite.default_scorers.length - 3}</span>
          )}
        </div>
      )}

      {suite.last_run_at && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <div className="flex items-center text-gray-500">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            <span>
              Last run {formatDistanceToNow(new Date(suite.last_run_at), { addSuffix: true })}
            </span>
          </div>
          {suite.last_run_score !== null && <ScoreBadge score={suite.last_run_score} />}
        </div>
      )}
    </Link>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 0.8 ? 'text-green-600' : score >= 0.6 ? 'text-yellow-600' : 'text-red-600'
  const bg = score >= 0.8 ? 'bg-green-50' : score >= 0.6 ? 'bg-yellow-50' : 'bg-red-50'

  return (
    <span className={clsx('px-2 py-0.5 rounded font-medium text-sm', color, bg)}>
      {(score * 100).toFixed(0)}%
    </span>
  )
}

export function SuiteCardSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="flex items-start space-x-4">
        <div className="p-2 bg-gray-100 rounded-lg">
          <div className="w-6 h-6 bg-gray-200 rounded" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-full" />
        </div>
      </div>

      <div className="mt-4 flex items-center space-x-4">
        <div className="h-4 bg-gray-100 rounded w-24" />
        <div className="h-4 bg-gray-100 rounded w-16" />
      </div>

      <div className="mt-3 flex gap-1.5">
        <div className="h-5 bg-gray-100 rounded w-16" />
        <div className="h-5 bg-gray-100 rounded w-20" />
      </div>
    </div>
  )
}
