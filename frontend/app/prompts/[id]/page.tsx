'use client'

import { clsx } from 'clsx'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileQuestion,
  GitBranch,
  GripVertical,
  History,
  MoreVertical,
  Plus,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatMessages } from '@/components/prompts/chat-messages'
import { DeletePromptDialog } from '@/components/prompts/delete-prompt-dialog'
import { PromptPerformance } from '@/components/prompts/prompt-performance'
import { UsedInExperiments } from '@/components/prompts/used-in-experiments'
import { VariablesTable } from '@/components/prompts/variables-table'
import { useToast } from '@/components/toast'
import {
  extractVariables,
  extractVariablesFromMessages,
  highlightVariables,
} from '@/lib/extract-variables'
import {
  buildSamplePayload,
  buildVariableContracts,
  parseJsonPayload,
  renderChatMessagesWithPayload,
  renderPromptTextWithPayload,
  validateVariablePayload,
} from '@/lib/prompt-variable-contract'
import { trpc } from '@/lib/trpc'
import type { PromptMessage, PromptVariable } from '@/lib/types'

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  const diffWeeks = Math.floor(diffDays / 7)
  return `${diffWeeks}w ago`
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function HighlightedContent({ content }: { content: string }) {
  const segments = highlightVariables(content)
  return (
    <span>
      {segments.map((seg, i) =>
        seg.isVariable ? (
          <span key={i} className="text-amber-500 font-semibold">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}

export default function PromptDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const utils = trpc.useUtils()
  const id = params.id as string
  const selectedVariant = searchParams.get('variant') || 'control'

  // State
  const [isEditing, setIsEditing] = useState(false)
  const [editTemplate, setEditTemplate] = useState('')
  const [editMessages, setEditMessages] = useState<PromptMessage[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [editModel, setEditModel] = useState('')
  const [editTemperature, setEditTemperature] = useState(0.7)
  const [editMaxTokens, setEditMaxTokens] = useState(2048)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [productionToggling, setProductionToggling] = useState(false)
  const [newVariantName, setNewVariantName] = useState('')
  const [compareLeftVersion, setCompareLeftVersion] = useState<number | null>(null)
  const [compareRightVersion, setCompareRightVersion] = useState<number | null>(null)
  const [samplePayloadText, setSamplePayloadText] = useState('{\n}')
  const [samplePayloadTouched, setSamplePayloadTouched] = useState(false)
  const [editableVariableContracts, setEditableVariableContracts] = useState<PromptVariable[]>([])
  const [variableContractsTouched, setVariableContractsTouched] = useState(false)

  // Fetch prompt
  const { data: prompt, isLoading, error, refetch } = trpc.prompts.getById.useQuery({
    id,
    variant: selectedVariant,
  })

  // Fetch version history
  const { data: historyData, refetch: refetchHistory } = trpc.prompts.getById.useQuery(
    { id, history: true, variant: selectedVariant },
    { enabled: !!prompt && !('items' in (prompt ?? {})) },
  )

  const { data: variantsData, refetch: refetchVariants } =
    trpc.prompts.listVariants.useQuery(
      { id },
      { enabled: !!id },
    )

  const updateMutation = trpc.prompts.update.useMutation()
  const createMutation = trpc.prompts.create.useMutation()
  const deleteMutation = trpc.prompts.delete.useMutation()
  const createVariantMutation = trpc.prompts.createVariant.useMutation()

  // Enter edit mode
  const enterEditMode = useCallback(
    (restoreContent?: string, restoreMessages?: PromptMessage[]) => {
      if (!prompt || 'items' in prompt) return
      setEditTemplate(restoreContent ?? prompt.template ?? '')
      setEditMessages(
        restoreMessages ?? prompt.messages ?? [{ role: 'system', content: '' }],
      )
      setCommitMessage('')
      setEditModel(prompt.config?.model || '')
      setEditTemperature(prompt.config?.temperature ?? 0.7)
      setEditMaxTokens(prompt.config?.maxTokens ?? 2048)
      setIsEditing(true)
    },
    [prompt],
  )

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
    setCommitMessage('')
  }, [])

  // Save edit (creates new version)
  const saveEdit = useCallback(async () => {
    if (!prompt || 'items' in prompt) return
    try {
      const config: Record<string, unknown> = {}
      if (editModel) config.model = editModel
      config.temperature = editTemperature
      config.maxTokens = editMaxTokens

      await updateMutation.mutateAsync({
        id: prompt.name,
        template: prompt.type === 'text' ? editTemplate : undefined,
        messages: prompt.type === 'chat' ? editMessages : undefined,
        variables: editableVariableContracts,
        config,
        commit_message: commitMessage.trim() || undefined,
      })

      addToast(`Version v${prompt.version + 1} created`, 'success')
      setIsEditing(false)
      setCommitMessage('')
      await Promise.all([
        refetch(),
        refetchHistory(),
        refetchVariants(),
        utils.prompts.list.invalidate(),
      ])
    } catch {
      addToast('Failed to save. Please try again.', 'error')
    }
  }, [
    prompt,
    editTemplate,
    editMessages,
    editModel,
    editTemperature,
    editMaxTokens,
    editableVariableContracts,
    commitMessage,
    updateMutation,
    addToast,
    refetch,
    refetchHistory,
    refetchVariants,
    utils,
  ])

  // Check if content has changed
  const hasContentChanged = useMemo(() => {
    if (!prompt || 'items' in prompt) return false
    if (prompt.type === 'text') {
      return editTemplate !== (prompt.template ?? '')
    }
    return JSON.stringify(editMessages) !== JSON.stringify(prompt.messages ?? [])
  }, [prompt, editTemplate, editMessages])

  // Production toggle
  const toggleProduction = useCallback(async () => {
    if (!prompt || 'items' in prompt) return
    setProductionToggling(true)
    try {
      await updateMutation.mutateAsync({
        id: prompt.name,
        is_production: !prompt.is_production,
      })
      addToast(
        prompt.is_production
          ? 'Removed from production'
          : `Set as production (v${prompt.version})`,
        'success',
      )
      refetch()
    } catch {
      addToast('Failed to update production status', 'error')
    } finally {
      setProductionToggling(false)
    }
  }, [prompt, updateMutation, addToast, refetch])

  const duplicatePrompt = useCallback(async () => {
    if (!prompt || 'items' in prompt) return
    const duplicateName = `${prompt.name}-copy`
    try {
      const duplicated = await createMutation.mutateAsync({
        name: duplicateName,
        description: prompt.description,
        type: prompt.type,
        template: prompt.template,
        messages: prompt.messages,
        config: prompt.config,
        tags: prompt.tags,
        variant: prompt.variant || 'control',
        commit_message: `Duplicated from ${prompt.name} v${prompt.version}`,
      })
      addToast(`Duplicated as ${duplicated.name}`, 'success')
      router.push(`/prompts/${duplicated.name}?variant=${duplicated.variant || 'control'}`)
    } catch {
      addToast('Failed to duplicate prompt', 'error')
    }
  }, [prompt, createMutation, addToast, router])

  const createVariantFromCurrent = useCallback(async () => {
    if (!prompt || 'items' in prompt) return
    const variant = newVariantName.trim().toLowerCase()
    if (!variant) return
    try {
      const created = await createVariantMutation.mutateAsync({
        id: prompt.id,
        variant,
      })
      addToast(`Created variant "${created.variant}"`, 'success')
      setNewVariantName('')
      refetch()
      refetchVariants()
      router.replace(`/prompts/${prompt.name}?variant=${created.variant || 'control'}`)
    } catch {
      addToast('Failed to create variant', 'error')
    }
  }, [
    prompt,
    newVariantName,
    createVariantMutation,
    addToast,
    refetch,
    refetchVariants,
    router,
  ])

  // Variables detection
  const detectedVars = useMemo(() => {
    if (!prompt || 'items' in prompt) return []
    if (isEditing) {
      if (prompt.type === 'chat') return extractVariablesFromMessages(editMessages)
      return extractVariables(editTemplate)
    }
    if (prompt.type === 'chat' && prompt.messages)
      return extractVariablesFromMessages(prompt.messages)
    if (prompt.template) return extractVariables(prompt.template)
    return []
  }, [isEditing, prompt, editTemplate, editMessages])

  const variableContracts = useMemo<PromptVariable[]>(() => {
    if (!prompt || 'items' in prompt) return []
    return buildVariableContracts({
      detectedNames: detectedVars.map((v) => v.name),
      persisted: prompt.variables,
    })
  }, [prompt, detectedVars])

  const hasVariableContractsChanged = useMemo(() => {
    return (
      JSON.stringify(editableVariableContracts) !== JSON.stringify(variableContracts)
    )
  }, [editableVariableContracts, variableContracts])

  const hasConfigChanged = useMemo(() => {
    if (!prompt || 'items' in prompt) return false
    const modelChanged = editModel !== (prompt.config?.model || '')
    const temperatureChanged =
      editTemperature !== (prompt.config?.temperature ?? 0.7)
    const maxTokensChanged = editMaxTokens !== (prompt.config?.maxTokens ?? 2048)
    return modelChanged || temperatureChanged || maxTokensChanged
  }, [prompt, editModel, editTemperature, editMaxTokens])

  const canSave =
    (hasContentChanged || hasVariableContractsChanged || hasConfigChanged) &&
    !updateMutation.isPending

  useEffect(() => {
    if (variableContractsTouched) return
    setEditableVariableContracts(variableContracts)
  }, [variableContracts, variableContractsTouched])

  useEffect(() => {
    if (samplePayloadTouched) return
    const sample = buildSamplePayload(variableContracts)
    setSamplePayloadText(JSON.stringify(sample, null, 2))
  }, [variableContracts, samplePayloadTouched])

  useEffect(() => {
    setVariableContractsTouched(false)
  }, [
    id,
    selectedVariant,
    prompt && !('items' in prompt) ? prompt.version : undefined,
  ])

  const parsedPayload = useMemo(
    () => parseJsonPayload(samplePayloadText),
    [samplePayloadText],
  )

  const payloadValidationIssues = useMemo(() => {
    if (!parsedPayload.value) return []
    return validateVariablePayload(editableVariableContracts, parsedPayload.value)
  }, [editableVariableContracts, parsedPayload])

  const renderedPreview = useMemo(() => {
    if (!prompt || 'items' in prompt) return ''
    const payload = parsedPayload.value || {}
    if (prompt.type === 'chat') {
      const sourceMessages = isEditing ? editMessages : prompt.messages || []
      const renderedMessages = renderChatMessagesWithPayload(
        sourceMessages,
        payload,
        editableVariableContracts,
      )
      return JSON.stringify(renderedMessages, null, 2)
    }
    const sourceTemplate = isEditing ? editTemplate : prompt.template || ''
    return renderPromptTextWithPayload(sourceTemplate, payload, editableVariableContracts)
  }, [prompt, isEditing, editTemplate, editMessages, parsedPayload, editableVariableContracts])

  // Edit message management
  const addMessage = useCallback(() => {
    setEditMessages((prev) => [...prev, { role: 'user', content: '' }])
  }, [])
  const removeMessage = useCallback((i: number) => {
    setEditMessages((prev) => prev.filter((_, idx) => idx !== i))
  }, [])
  const updateEditMessage = useCallback(
    (i: number, field: 'role' | 'content', value: string) => {
      setEditMessages((prev) =>
        prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)),
      )
    },
    [],
  )

  // Version history
  const versions = useMemo(() => {
    if (!historyData || !('items' in historyData)) return []
    return historyData.items
  }, [historyData])

  const availableVariants = useMemo(() => {
    if (!variantsData) return []
    return variantsData.items
      .map((v) => v.variant || 'control')
      .filter((v, index, arr) => arr.indexOf(v) === index)
  }, [variantsData])

  useEffect(() => {
    if (versions.length === 0) return
    if (compareLeftVersion === null) {
      setCompareLeftVersion(versions[0].version)
    }
    if (compareRightVersion === null) {
      setCompareRightVersion(versions[1]?.version ?? versions[0].version)
    }
  }, [versions, compareLeftVersion, compareRightVersion])

  const { data: compareLeftPrompt } = trpc.prompts.getById.useQuery(
    {
      id,
      version: compareLeftVersion ?? undefined,
      variant: selectedVariant,
    },
    { enabled: compareLeftVersion !== null },
  )

  const { data: compareRightPrompt } = trpc.prompts.getById.useQuery(
    {
      id,
      version: compareRightVersion ?? undefined,
      variant: selectedVariant,
    },
    { enabled: compareRightVersion !== null },
  )

  const compareLeftText = useMemo(() => {
    if (!compareLeftPrompt || 'items' in compareLeftPrompt) return ''
    return compareLeftPrompt.type === 'chat'
      ? JSON.stringify(compareLeftPrompt.messages ?? [], null, 2)
      : compareLeftPrompt.template ?? ''
  }, [compareLeftPrompt])

  const compareRightText = useMemo(() => {
    if (!compareRightPrompt || 'items' in compareRightPrompt) return ''
    return compareRightPrompt.type === 'chat'
      ? JSON.stringify(compareRightPrompt.messages ?? [], null, 2)
      : compareRightPrompt.template ?? ''
  }, [compareRightPrompt])

  const diffStats = useMemo(() => {
    const leftLines = compareLeftText.split('\n').map((l) => l.trim()).filter(Boolean)
    const rightLines = compareRightText.split('\n').map((l) => l.trim()).filter(Boolean)
    const leftSet = new Set(leftLines)
    const rightSet = new Set(rightLines)
    let removed = 0
    let added = 0
    for (const line of leftSet) {
      if (!rightSet.has(line)) removed++
    }
    for (const line of rightSet) {
      if (!leftSet.has(line)) added++
    }
    return { added, removed }
  }, [compareLeftText, compareRightText])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-4 w-32 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
        <div className="space-y-3">
          <div className="h-8 w-64 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-200 dark:bg-dark-700 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 dark:bg-dark-700 rounded" />
              <div className="mt-3 h-8 w-16 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
          ))}
        </div>
        <div className="card p-6 animate-pulse space-y-2">
          <div className="h-4 w-full bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-4 w-2/3 bg-gray-200 dark:bg-dark-700 rounded" />
        </div>
      </div>
    )
  }

  // Error / not found state
  if (error) {
    const isNotFound = error.message.includes('not found')
    return (
      <div className="p-6 space-y-6">
        <Link
          href="/prompts"
          className="inline-flex items-center gap-1 text-sm text-content-muted hover:text-content-secondary"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Prompts
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          {isNotFound ? (
            <FileQuestion className="w-12 h-12 text-content-muted mb-3" />
          ) : (
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          )}
          <h3 className="text-lg font-medium text-content-primary mb-2">
            {isNotFound ? 'Prompt not found' : 'Failed to load prompt'}
          </h3>
          <p className="text-sm text-content-muted mb-4">
            {isNotFound
              ? "The prompt you're looking for doesn't exist or has been deleted."
              : 'This prompt may have been deleted or you may not have access.'}
          </p>
          <Link href="/prompts" className="btn btn-secondary text-sm">
            Back to Prompts
          </Link>
        </div>
      </div>
    )
  }

  // Guard: if the response is version history (shouldn't happen), bail
  if (!prompt || 'items' in prompt) return null

  const isAutoOpt = prompt.created_by === 'auto-opt'

  return (
    <div className="p-6 space-y-6">
      {/* Back nav */}
      <Link
        href="/prompts"
        className="inline-flex items-center gap-1 text-sm text-content-muted hover:text-content-secondary"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Prompts
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-content-primary">
              {prompt.name}
            </h1>
            <span
              className={clsx(
                'badge text-[10px]',
                prompt.type === 'chat' ? 'badge-primary' : 'badge-gray',
              )}
            >
              {prompt.type}
            </span>
            <span className="badge text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              {prompt.variant || 'control'}
            </span>
            {prompt.is_production && (
              <span className="badge badge-green text-[10px]">
                <Check className="w-2.5 h-2.5" /> production
              </span>
            )}
          </div>
        </div>

        {/* Description / edit status */}
        {isEditing ? (
          <p className="text-sm text-amber-500 mt-1">
            Editing &middot; Changes will create version v{prompt.version + 1}
          </p>
        ) : (
          prompt.description && (
            <p className="text-sm text-content-muted mt-1">{prompt.description}</p>
          )
        )}

        {/* Attribution */}
        {!isEditing && (
          <div className="flex items-center gap-1.5 text-xs text-content-muted mt-1">
            <span>v{prompt.version}</span>
            <span>&middot;</span>
            {isAutoOpt ? (
              <Sparkles className="w-3 h-3 text-amber-500" />
            ) : (
              <User className="w-3 h-3" />
            )}
            <span>{isAutoOpt ? 'auto-opt' : prompt.created_by || 'human'}</span>
            <span>&middot;</span>
            <span>Updated {formatRelativeTime(prompt.updated_at)}</span>
          </div>
        )}

        {!isEditing && (
          <div className="mt-3 rounded-xl border border-border bg-gradient-to-br from-surface-card to-surface-raised/40 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-content-muted">
                  <GitBranch className="w-3.5 h-3.5" />
                  Variant Control
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card px-2 py-0.5 text-[11px] text-content-secondary">
                  <History className="w-3 h-3" />
                  v{prompt.version}
                </span>
              </div>
              <div className="text-[11px] text-content-muted">
                Active branch: <span className="font-medium text-content-secondary">{selectedVariant}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {availableVariants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => {
                    router.replace(`/prompts/${prompt.name}?variant=${variant}`)
                  }}
                  className={clsx(
                    'h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors',
                    variant === selectedVariant
                      ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300 border-primary-500/40 shadow-sm'
                      : 'border-border bg-surface-card text-content-secondary hover:bg-surface-raised',
                  )}
                >
                  {variant}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                placeholder="new variant name"
                className="h-8 w-48 rounded-md border border-border bg-surface-card px-2 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
              />
              <button
                type="button"
                onClick={createVariantFromCurrent}
                disabled={!newVariantName.trim() || createVariantMutation.isPending}
                className="btn btn-secondary h-8 px-2.5 text-xs disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {createVariantMutation.isPending ? 'Creating...' : 'New Variant'}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!canSave}
                  className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateMutation.isPending
                    ? 'Saving...'
                    : `Save as v${prompt.version + 1}`}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-ghost text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => enterEditMode()}
                  className="btn btn-primary text-sm"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={duplicatePrompt}
                  disabled={createMutation.isPending}
                  className="btn btn-secondary text-sm"
                >
                  <Copy className="w-3.5 h-3.5" /> {createMutation.isPending ? 'Duplicating...' : 'Duplicate'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="btn btn-ghost text-sm text-rose-500 hover:text-rose-400"
                >
                  Delete
                </button>
              </>
            )}
          </div>

          {/* Production toggle */}
          {!isEditing && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-content-secondary">Production</span>
              <button
                type="button"
                onClick={toggleProduction}
                disabled={productionToggling}
                className={clsx(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  prompt.is_production
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-dark-600',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    prompt.is_production ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Performance */}
      <PromptPerformance
        avgScore={null}
        avgLatency={null}
        costPerCall={null}
        evalCount={0}
      />

      {/* Content */}
      <div>
        <h3 className="text-sm font-semibold text-content-primary mb-3">
          Content
        </h3>

        {isEditing ? (
          <div className="space-y-4">
            {prompt.type === 'text' ? (
              <textarea
                value={editTemplate}
                onChange={(e) => setEditTemplate(e.target.value)}
                className="w-full min-h-[300px] p-4 font-mono text-sm bg-surface-card border-2 border-primary-500 rounded-md text-content-primary resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            ) : (
              <div className="space-y-3 border-2 border-primary-500 rounded-md p-4">
                {editMessages.map((msg, i) => (
                  <div
                    key={i}
                    className="border border-border rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-content-muted cursor-grab" />
                        <span className="text-xs text-content-muted">
                          Message {i + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={msg.role}
                          onChange={(e) =>
                            updateEditMessage(i, 'role', e.target.value)
                          }
                          className="h-7 text-xs bg-surface-card border border-border rounded px-2 text-content-secondary focus:outline-none"
                        >
                          <option value="system">system</option>
                          <option value="user">user</option>
                          <option value="assistant">assistant</option>
                        </select>
                        {editMessages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMessage(i)}
                            className="text-content-muted hover:text-rose-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={msg.content}
                      onChange={(e) =>
                        updateEditMessage(i, 'content', e.target.value)
                      }
                      placeholder="Enter message content..."
                      className="w-full min-h-[100px] p-2 font-mono text-sm bg-surface-card border border-border rounded text-content-primary placeholder:text-content-muted resize-y focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMessage}
                  className="btn btn-ghost text-sm"
                >
                  <Plus className="w-4 h-4" /> Add Message
                </button>
              </div>
            )}

            {/* Live variables */}
            <div className="text-xs text-content-muted">
              Variables detected:{' '}
              {variableContracts.length === 0
                ? '(none)'
                : variableContracts.map((v) => (
                    <span
                      key={v.name}
                      className="badge badge-gray text-[10px] mx-0.5"
                    >
                      {v.name}
                    </span>
                  ))}
            </div>

            {/* Commit message */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-1.5">
                What changed? (optional)
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="e.g. Added currency variable for international support"
                className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
              />
            </div>

            {/* Model config (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setConfigOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-sm font-medium text-content-secondary hover:text-content-primary"
              >
                {configOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Update Model Configuration
              </button>
              {configOpen && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-content-muted mb-1">
                      Model
                    </label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="e.g. gemini-2.5-flash"
                      className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-content-muted mb-1">
                      Temperature
                    </label>
                    <input
                      type="number"
                      value={editTemperature}
                      onChange={(e) =>
                        setEditTemperature(Number(e.target.value))
                      }
                      min={0}
                      max={2}
                      step={0.1}
                      className="w-24 h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-content-muted mb-1">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      value={editMaxTokens}
                      onChange={(e) => setEditMaxTokens(Number(e.target.value))}
                      min={1}
                      className="w-24 h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Save error */}
            {updateMutation.isError && (
              <p className="text-sm text-rose-500">
                Failed to save. Please try again.
              </p>
            )}
          </div>
        ) : (
          <div>
            {prompt.type === 'chat' && prompt.messages ? (
              <ChatMessages messages={prompt.messages} />
            ) : (
              <div className="bg-surface-card border border-border rounded-md p-4 font-mono text-sm whitespace-pre-wrap text-content-primary">
                <HighlightedContent content={prompt.template ?? ''} />
              </div>
            )}

            {/* Token & variable summary */}
            <div className="mt-2 text-xs text-content-muted">
              ~
              {Math.round(
                (prompt.template?.length ??
                  JSON.stringify(prompt.messages ?? []).length) / 4,
              )}{' '}
              tokens (estimate) &middot; {variableContracts.length} variable
              {variableContracts.length !== 1 ? 's' : ''} detected
            </div>
          </div>
        )}
      </div>

      {/* Variables table */}
      <VariablesTable
        variables={editableVariableContracts}
        editable={isEditing}
        onChange={(vars) => {
          setVariableContractsTouched(true)
          setEditableVariableContracts(vars)
        }}
      />

      {/* Variable runtime preview */}
      {variableContracts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-content-primary">
            Runtime Payload & Preview
          </h3>
          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="badge badge-gray text-[10px]">
                {variableContracts.length} vars
              </span>
              <span
                className={clsx(
                  'badge text-[10px]',
                  payloadValidationIssues.length === 0 && parsedPayload.error === null
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                )}
              >
                {payloadValidationIssues.length === 0 && parsedPayload.error === null
                  ? 'payload valid'
                  : `${payloadValidationIssues.length + (parsedPayload.error ? 1 : 0)} issue(s)`}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72">
                <div className="border-b border-border dark:border-slate-700/80 px-3 py-2 text-xs text-content-muted">
                  Runtime JSON Payload
                </div>
                <textarea
                  value={samplePayloadText}
                  onChange={(e) => {
                    setSamplePayloadTouched(true)
                    setSamplePayloadText(e.target.value)
                  }}
                  className="w-full min-h-[220px] p-3 bg-transparent font-mono text-xs text-content-secondary resize-y focus:outline-none"
                />
              </div>

              <div className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72">
                <div className="border-b border-border dark:border-slate-700/80 px-3 py-2 text-xs text-content-muted">
                  Validation
                </div>
                <div className="p-3 text-xs space-y-2">
                  {parsedPayload.error ? (
                    <div className="text-rose-500">{parsedPayload.error}</div>
                  ) : payloadValidationIssues.length === 0 ? (
                    <div className="text-emerald-500">No validation issues.</div>
                  ) : (
                    payloadValidationIssues.map((issue) => (
                      <div key={`${issue.name}-${issue.message}`} className="text-rose-500">
                        <span className="font-mono">{issue.name}</span>: {issue.message}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72">
              <div className="border-b border-border dark:border-slate-700/80 px-3 py-2 text-xs text-content-muted">
                Rendered Prompt Preview
              </div>
              <pre className="max-h-[320px] overflow-auto p-3 text-xs text-content-secondary whitespace-pre-wrap break-words">
                {renderedPreview || '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <h4 className="text-xs text-content-muted uppercase tracking-wider font-medium">
            Prompt Info
          </h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-content-muted">Type</span>
              <span className="text-content-primary">{prompt.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Created</span>
              <span className="text-content-primary">
                {new Date(prompt.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-muted">Updated</span>
              <span className="text-content-primary">
                {formatRelativeTime(prompt.updated_at)}
              </span>
            </div>
            {prompt.tags && prompt.tags.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-content-muted">Tags</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {prompt.tags.map((tag) => (
                    <span key={tag} className="badge badge-gray text-[10px]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {prompt.config && (
          <div className="card p-4 space-y-2">
            <h4 className="text-xs text-content-muted uppercase tracking-wider font-medium">
              Model Config
            </h4>
            <div className="space-y-1.5 text-sm">
              {prompt.config.model && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Model</span>
                  <span className="text-content-primary font-mono">
                    {prompt.config.model}
                  </span>
                </div>
              )}
              {prompt.config.temperature !== undefined && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Temp</span>
                  <span className="text-content-primary">
                    {prompt.config.temperature}
                  </span>
                </div>
              )}
              {prompt.config.maxTokens !== undefined && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Max Tok</span>
                  <span className="text-content-primary">
                    {prompt.config.maxTokens}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-content-muted">
              Suggested config. Agent runtime may override.
            </p>
          </div>
        )}
      </div>

      {/* Version History */}
      {versions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-content-primary">
              Version History
            </h3>
            <span className="inline-flex items-center rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900/72 px-2 py-1 text-xs text-content-secondary">
              {versions.length} versions
            </span>
          </div>
          <div className="card overflow-hidden border border-border dark:border-slate-700/80 dark:bg-slate-900/72 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-slate-700/85 bg-surface-raised/70 dark:bg-slate-900/95">
                  <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">
                    Ver
                  </th>
                  <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">
                    Author
                  </th>
                  <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">
                    Message
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => {
                  const vIsAutoOpt = v.created_by === 'auto-opt'
                  const isCurrentVersion = v.version === prompt.version
                  return (
                    <tr
                      key={v.id}
                      className={clsx(
                        'border-b border-border/50 dark:border-slate-700/75 transition-colors hover:bg-surface-raised/35 dark:hover:bg-slate-800/45',
                        'odd:bg-surface-card even:bg-surface-raised/10 dark:odd:bg-slate-900/72 dark:even:bg-slate-800/35',
                        isCurrentVersion && 'bg-primary-500/10',
                      )}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-content-primary">v{v.version}</span>
                          {isCurrentVersion && (
                            <span className="rounded border border-primary-500/40 bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300">
                              current
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          {vIsAutoOpt ? (
                            <Sparkles className="w-3 h-3 text-amber-500" />
                          ) : (
                            <User className="w-3 h-3 text-content-muted" />
                          )}
                          <span className="text-content-secondary">
                            {vIsAutoOpt
                              ? 'auto-opt'
                              : v.created_by || 'human'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-col leading-tight">
                          <span className="text-content-secondary">{formatRelativeTime(v.created_at)}</span>
                          <span className="text-[11px] text-content-muted">{formatDateTime(v.created_at)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-content-secondary line-clamp-2">
                        {v.commit_message || '\u2014'}
                      </td>
                      <td className="py-2 px-3">
                        <VersionMenu
                          version={v}
                          promptName={prompt.name}
                          currentVariant={selectedVariant}
                          onRefetch={refetch}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-content-primary">Compare Versions</h3>
          <div className="card p-4 space-y-3 dark:bg-slate-900/72 dark:border dark:border-slate-700/80">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-muted uppercase tracking-wide">Left</span>
                <select
                  value={compareLeftVersion ?? ''}
                  onChange={(e) => setCompareLeftVersion(Number(e.target.value))}
                  className="h-8 rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900/72 px-2 text-xs text-content-primary focus:outline-none"
                >
                  {versions.map((v) => (
                    <option key={`left-${v.id}`} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-muted uppercase tracking-wide">Right</span>
                <select
                  value={compareRightVersion ?? ''}
                  onChange={(e) => setCompareRightVersion(Number(e.target.value))}
                  className="h-8 rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900/72 px-2 text-xs text-content-primary focus:outline-none"
                >
                  {versions.map((v) => (
                    <option key={`right-${v.id}`} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="badge text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  +{diffStats.added} lines
                </span>
                <span className="badge text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  -{diffStats.removed} lines
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72">
                <div className="border-b border-border dark:border-slate-700/80 px-3 py-2 text-xs text-content-muted">
                  v{compareLeftVersion ?? '-'}
                </div>
                <pre className="max-h-[360px] overflow-auto p-3 text-xs text-content-secondary whitespace-pre-wrap break-words">
                  {compareLeftText || '(empty)'}
                </pre>
              </div>
              <div className="rounded-md border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72">
                <div className="border-b border-border dark:border-slate-700/80 px-3 py-2 text-xs text-content-muted">
                  v{compareRightVersion ?? '-'}
                </div>
                <pre className="max-h-[360px] overflow-auto p-3 text-xs text-content-secondary whitespace-pre-wrap break-words">
                  {compareRightText || '(empty)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Used in Experiments */}
      <UsedInExperiments experiments={[]} />

      {/* Delete dialog */}
      <DeletePromptDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          const deletedPromptName = prompt.name
          setDeleteOpen(false)
          router.replace('/prompts')

          void (async () => {
            try {
              await deleteMutation.mutateAsync({ id: deletedPromptName })
              addToast(`"${deletedPromptName}" deleted`, 'success')
              void Promise.allSettled([
                utils.prompts.list.invalidate(),
                utils.prompts.getById.invalidate(),
                utils.prompts.listVariants.invalidate(),
              ])
            } catch (error) {
              // If already deleted in a prior click/race, treat as success.
              const message =
                error instanceof Error ? error.message : 'Failed to delete prompt'
              if (/not found/i.test(message)) {
                addToast(`"${deletedPromptName}" deleted`, 'success')
                return
              }
              addToast(message, 'error')
            }
          })()
        }}
        promptName={prompt.name}
        versionCount={prompt.version}
        isProduction={prompt.is_production}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  )
}

// Version row overflow menu
function VersionMenu({
  version,
  promptName,
  currentVariant,
  onRefetch,
}: {
  version: { id: string; version: number }
  promptName: string
  currentVariant: string
  onRefetch: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()
  const updateMutation = trpc.prompts.update.useMutation()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-content-muted hover:text-content-secondary p-1 rounded"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-surface-card border border-border rounded-md shadow-lg py-1 min-w-[160px]">
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              try {
                await updateMutation.mutateAsync({
                  id: promptName,
                  variant: currentVariant,
                  is_production: true,
                  commit_message: `Promoted v${version.version} to production`,
                })
                addToast(
                  `v${version.version} promoted to production`,
                  'success',
                )
                onRefetch()
              } catch {
                addToast('Failed to promote', 'error')
              }
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50"
          >
            Promote to Prod
          </button>
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              try {
                await updateMutation.mutateAsync({
                  id: version.id,
                  variant: currentVariant,
                  commit_message: `Restore v${version.version}`,
                })
                addToast(`Restored v${version.version}`, 'success')
                onRefetch()
              } catch {
                addToast('Failed to restore version', 'error')
              }
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  )
}
