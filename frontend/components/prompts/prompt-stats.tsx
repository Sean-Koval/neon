'use client'

import { FileText, Rocket, GitCommitHorizontal, Sparkles } from 'lucide-react'
import { StatCard, StatCardSkeleton } from '@/components/dashboard/stat-cards'
import type { Prompt } from '@/lib/types'

interface PromptStatsProps {
  prompts: Prompt[]
  isLoading: boolean
}

export function PromptStats({ prompts, isLoading }: PromptStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    )
  }

  const totalPrompts = prompts.length
  const inProduction = prompts.filter((p) => p.is_production).length
  // Changes in 7d: count prompts updated within the last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const changes7d = prompts.filter(
    (p) => new Date(p.updated_at) >= sevenDaysAgo,
  ).length
  const autoOptimized = prompts.filter(
    (p) => p.created_by === 'auto-opt',
  ).length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Prompts"
        value={totalPrompts.toString()}
        icon={<FileText className="w-5 h-5 text-primary-500" />}
        subtitle={`${totalPrompts} prompt${totalPrompts !== 1 ? 's' : ''} managed`}
        trend="neutral"
      />
      <StatCard
        title="In Production"
        value={inProduction.toString()}
        icon={<Rocket className="w-5 h-5 text-emerald-500" />}
        subtitle={
          totalPrompts > 0
            ? `${Math.round((inProduction / totalPrompts) * 100)}% deployed`
            : 'No prompts yet'
        }
        trend={inProduction > 0 ? 'up' : 'neutral'}
      />
      <StatCard
        title="Changes (7d)"
        value={changes7d.toString()}
        icon={<GitCommitHorizontal className="w-5 h-5 text-amber-500" />}
        subtitle={`${changes7d} version${changes7d !== 1 ? 's' : ''} this week`}
        trend="neutral"
      />
      <StatCard
        title="Auto-Optimized"
        value={autoOptimized.toString()}
        icon={<Sparkles className="w-5 h-5 text-accent-500" />}
        subtitle={
          changes7d > 0 && autoOptimized > changes7d * 0.5
            ? 'High auto-opt volume'
            : autoOptimized > 0
              ? 'Machine-generated'
              : 'None yet'
        }
        trend="neutral"
      />
    </div>
  )
}
