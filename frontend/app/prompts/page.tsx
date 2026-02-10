'use client'

import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  User,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { CreatePromptDialog } from '@/components/prompts/create-prompt-dialog'
import { DeletePromptDialog } from '@/components/prompts/delete-prompt-dialog'
import { PromptCard } from '@/components/prompts/prompt-card'
import { PromptFilters } from '@/components/prompts/prompt-filters'
import { PromptStats } from '@/components/prompts/prompt-stats'
import { useToast } from '@/components/toast'
import { trpc } from '@/lib/trpc'
import type { Prompt } from '@/lib/types'

const PAGE_SIZE = 20

function isRegressedPromptHeuristic(commitMessage?: string): boolean {
  if (!commitMessage) return false
  return /(regress|rollback|degrad|worse|drop)/i.test(commitMessage)
}

function isNoEvalPromptHeuristic(commitMessage?: string): boolean {
  if (!commitMessage) return true
  return !/(eval|score|benchmark|suite)/i.test(commitMessage)
}

function PromptsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const utils = trpc.useUtils()

  const currentSearch = searchParams.get('search') || ''
  const currentType = searchParams.get('type') || ''
  const currentStatus = searchParams.get('status') || ''
  const currentSort = searchParams.get('sort') || 'newest'
  const currentTags = searchParams.get('tags')?.split(',').filter(Boolean) || []
  const currentView = searchParams.get('view') || 'cards'
  const currentSource = searchParams.get('source') || ''
  const currentPreset = searchParams.get('preset') || ''

  const [createOpen, setCreateOpen] = useState(false)
  const [duplicateData, setDuplicateData] =
    useState<Parameters<typeof CreatePromptDialog>[0]['duplicate']>()
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null)

  // Derive isProduction filter
  const isProduction =
    currentStatus === 'production'
      ? true
      : currentStatus === 'draft'
        ? false
        : undefined

  // Fetch prompts
  const { data, isLoading, error, refetch } = trpc.prompts.list.useQuery({
    isProduction,
    tags: currentTags.length > 0 ? currentTags : undefined,
    limit: 100, // Get all for client-side filtering/sorting
  })

  const updateMutation = trpc.prompts.update.useMutation()
  const deleteMutation = trpc.prompts.delete.useMutation()

  // All prompts from API
  const allPrompts = data?.items ?? []

  // Client-side filtering and sorting
  const filteredPrompts = useMemo(() => {
    let result = [...allPrompts]

    // Search filter
    if (currentSearch) {
      const q = currentSearch.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      )
    }

    // Type filter
    if (currentType) {
      result = result.filter((p) => p.type === currentType)
    }

    if (currentSource === 'auto-opt') {
      result = result.filter((p) => p.created_by === 'auto-opt')
    } else if (currentSource === 'human') {
      result = result.filter((p) => p.created_by !== 'auto-opt')
    }

    if (currentPreset === 'regressed') {
      result = result.filter((p) => isRegressedPromptHeuristic(p.commit_message))
    } else if (currentPreset === 'no-eval') {
      result = result.filter((p) => isNoEvalPromptHeuristic(p.commit_message))
    }

    // Sort
    switch (currentSort) {
      case 'oldest':
        result.sort(
          (a, b) =>
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
        )
        break
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'versions':
        result.sort((a, b) => b.version - a.version)
        break
      default: // newest
        result.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
    }

    return result
  }, [allPrompts, currentSearch, currentType, currentSort, currentSource, currentPreset])

  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visiblePrompts = filteredPrompts.slice(0, visibleCount)
  const hasMore = visibleCount < filteredPrompts.length
  const [loadingMore, setLoadingMore] = useState(false)

  const loadMore = useCallback(() => {
    setLoadingMore(true)
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE)
      setLoadingMore(false)
    }, 100)
  }, [])

  // Collect all distinct tags for filter
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const prompt of allPrompts) {
      if (prompt.tags) {
        for (const tag of prompt.tags) {
          tagSet.add(tag)
        }
      }
    }
    return Array.from(tagSet).sort()
  }, [allPrompts])

  // Card actions
  const handleDuplicate = useCallback((prompt: Prompt) => {
    setDuplicateData({
      name: prompt.name,
      description: prompt.description || '',
      type: prompt.type,
      template: prompt.template || '',
      messages: prompt.messages || [{ role: 'system', content: '' }],
      tags: prompt.tags || [],
      variant: prompt.variant,
      config: prompt.config
        ? {
            model: prompt.config.model,
            temperature: prompt.config.temperature,
            maxTokens: prompt.config.maxTokens,
          }
        : undefined,
    })
    setCreateOpen(true)
  }, [])

  const handleSetProduction = useCallback(
    async (prompt: Prompt) => {
      try {
        await updateMutation.mutateAsync({
          id: prompt.name,
          is_production: true,
        })
        addToast(
          `${prompt.name} v${prompt.version} set as production`,
          'success',
        )
        refetch()
      } catch {
        addToast('Failed to update production status', 'error')
      }
    },
    [updateMutation, addToast, refetch],
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.name })
      await utils.prompts.list.invalidate()
      await utils.prompts.getById.invalidate()
      addToast(`"${deleteTarget.name}" deleted`, 'success')
      setDeleteTarget(null)
      refetch()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete prompt'
      addToast(message, 'error')
    }
  }, [deleteTarget, deleteMutation, utils, addToast, refetch])

  const handleCreateClose = useCallback(() => {
    setCreateOpen(false)
    setDuplicateData(undefined)
    refetch()
  }, [refetch])

  const isEmpty = !isLoading && filteredPrompts.length === 0
  const isEmptyDatabase = !isLoading && allPrompts.length === 0
  const isFilteredEmpty = isEmpty && !isEmptyDatabase

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (!value) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const presets = [
    {
      id: 'production',
      label: 'Production',
      action: () => updateParams({ preset: 'production', status: 'production' }),
    },
    {
      id: 'regressed',
      label: 'Regressed',
      action: () => updateParams({ preset: 'regressed', status: null }),
    },
    {
      id: 'no-eval',
      label: 'No Eval',
      action: () => updateParams({ preset: 'no-eval', status: null }),
    },
    {
      id: 'auto-opt',
      label: 'Auto-Opt',
      action: () => updateParams({ preset: 'auto-opt', source: 'auto-opt' }),
    },
  ] as const

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Prompts</h1>
            <p className="mt-1 text-sm text-content-secondary">
              Version, manage, and deploy prompts for your agents
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDuplicateData(undefined)
              setCreateOpen(true)
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Create Prompt
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <PromptStats prompts={allPrompts} isLoading={isLoading} />

      {/* Filters (hidden when no prompts at all) */}
      {!isEmptyDatabase && (
        <div className="rounded-xl border border-border bg-surface-card/95 p-3 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={preset.action}
                  className={`badge text-[10px] transition-colors ${
                    currentPreset === preset.id
                      ? 'bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-500/40'
                      : 'badge-gray hover:bg-surface-raised'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {currentPreset && (
                <button
                  type="button"
                  onClick={() => updateParams({ preset: null, source: null, status: null })}
                  className="text-xs text-content-muted hover:text-content-secondary"
                >
                  Clear Preset
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-surface-card p-1">
              <button
                type="button"
                onClick={() => updateParams({ view: null })}
                className={`h-7 px-2 text-xs rounded ${
                  currentView === 'cards'
                    ? 'bg-primary-500/20 text-primary-700 dark:text-primary-300'
                    : 'text-content-secondary hover:bg-surface-raised'
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => updateParams({ view: 'table' })}
                className={`h-7 px-2 text-xs rounded ${
                  currentView === 'table'
                    ? 'bg-primary-500/20 text-primary-700 dark:text-primary-300'
                    : 'text-content-secondary hover:bg-surface-raised'
                }`}
              >
                Table
              </button>
            </div>
          </div>
          <PromptFilters allTags={allTags} />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-lg font-medium text-content-primary mb-2">
            Failed to load prompts
          </h3>
          <p className="text-sm text-content-muted mb-4">
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn btn-secondary text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {['s1', 's2', 's3'].map((key) => (
            <div key={key} className="card p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-40 rounded bg-surface-raised" />
                <div className="h-5 w-16 rounded-full bg-surface-raised" />
              </div>
              <div className="mt-3 h-4 w-64 rounded bg-surface-raised" />
              <div className="mt-2 h-3 w-48 rounded bg-surface-raised" />
              <div className="mt-2 h-3 w-36 rounded bg-surface-raised" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state - no prompts at all */}
      {isEmptyDatabase && !error && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <FileText className="w-12 h-12 text-content-muted mb-3" />
          <h3 className="text-lg font-medium text-content-primary mb-2">
            No prompts yet
          </h3>
          <p className="text-sm text-content-muted max-w-sm mx-auto mb-4">
            Create prompts to version-control your agent system messages and
            conversation templates.
          </p>
          <button
            type="button"
            onClick={() => {
              setDuplicateData(undefined)
              setCreateOpen(true)
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Create First Prompt
          </button>
        </div>
      )}

      {/* Filtered empty state */}
      {isFilteredEmpty && (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <Search className="w-12 h-12 text-content-muted mb-3" />
          <h3 className="text-lg font-medium text-content-primary mb-2">
            No prompts match your filters
          </h3>
          <p className="text-sm text-content-muted mb-4">
            Try adjusting your search or filter criteria.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/prompts', { scroll: false })}
            className="btn btn-secondary text-sm"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Prompt cards */}
      {!isLoading && !error && visiblePrompts.length > 0 && currentView !== 'table' && (
        <div className="space-y-3">
          {visiblePrompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onDuplicate={handleDuplicate}
              onSetProduction={handleSetProduction}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && visiblePrompts.length > 0 && currentView === 'table' && (
        <div className="card overflow-hidden border border-border dark:border-slate-700/80 dark:bg-slate-900/72">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-slate-700/85 bg-surface-raised/50 dark:bg-slate-900/95">
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Prompt</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Variant</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Type</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Version</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Author</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Updated</th>
                <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visiblePrompts.map((prompt) => {
                const href =
                  prompt.variant && prompt.variant !== 'control'
                    ? `/prompts/${prompt.name}?variant=${encodeURIComponent(prompt.variant)}`
                    : `/prompts/${prompt.name}`
                return (
                  <tr
                    key={prompt.id}
                    onClick={() => router.push(href)}
                    className="border-b border-border/40 dark:border-slate-700/75 hover:bg-surface-raised/30 dark:hover:bg-slate-800/45 cursor-pointer"
                  >
                    <td className="py-2 px-3 font-mono text-content-primary">{prompt.name}</td>
                    <td className="py-2 px-3">
                      <span className="badge text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {prompt.variant || 'control'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-content-secondary">{prompt.type}</td>
                    <td className="py-2 px-3 text-content-secondary">v{prompt.version}</td>
                    <td className="py-2 px-3 text-content-secondary">
                      <span className="inline-flex items-center gap-1">
                        {prompt.created_by === 'auto-opt' ? <Sparkles className="w-3 h-3 text-amber-500" /> : <User className="w-3 h-3" />}
                        {prompt.created_by || 'human'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-content-muted">{new Date(prompt.updated_at).toLocaleString()}</td>
                    <td className="py-2 px-3">
                      {prompt.is_production ? (
                        <span className="badge badge-green text-[10px]">
                          <Check className="w-2.5 h-2.5" /> production
                        </span>
                      ) : (
                        <span className="text-xs text-content-muted">draft</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicate(prompt)
                          }}
                          className="text-xs text-content-muted hover:text-content-secondary"
                        >
                          Duplicate
                        </button>
                        <span className="text-content-muted/50">|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(prompt)
                          }}
                          className="text-xs text-rose-500 hover:text-rose-400"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="text-center space-y-2">
          <p className="text-sm text-content-muted">
            Showing {visibleCount} of {filteredPrompts.length} prompts
          </p>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn btn-secondary text-sm"
          >
            {loadingMore ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}

      {/* Create dialog */}
      <CreatePromptDialog
        open={createOpen}
        onClose={handleCreateClose}
        existingTags={allTags}
        duplicate={duplicateData}
      />

      {/* Delete dialog */}
      <DeletePromptDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        promptName={deleteTarget?.name ?? ''}
        versionCount={deleteTarget?.version ?? 0}
        isProduction={deleteTarget?.is_production}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  )
}

export default function PromptsPage() {
  return (
    <Suspense
      fallback={
        <div className="relative p-6 space-y-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
          <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
            <div className="h-8 w-32 animate-pulse rounded bg-surface-raised" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-raised" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {['kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'].map((key) => (
              <div key={key} className="stat-card animate-pulse">
                <div className="mb-2 h-3 w-20 rounded bg-surface-raised" />
                <div className="h-7 w-12 rounded bg-surface-raised" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-surface-card/95 p-3 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
            <div className="h-9 w-full max-w-md animate-pulse rounded bg-surface-raised" />
          </div>
          <div className="space-y-3">
            {['row-1', 'row-2', 'row-3'].map((key) => (
              <div key={key} className="card p-4 animate-pulse">
                <div className="h-4 w-40 rounded bg-surface-raised" />
                <div className="mt-3 h-4 w-64 rounded bg-surface-raised" />
              </div>
            ))}
          </div>
        </div>
      }
    >
      <PromptsPageContent />
    </Suspense>
  )
}
