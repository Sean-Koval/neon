'use client'

import { clsx } from 'clsx'
import { Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { trpc } from '@/lib/trpc'

interface AgentContextRowProps {
  agentId: string
  environments?: string[]
  model?: string
  team?: string
  tags?: string[]
  lastSeen?: string | Date
}

const envColors: Record<string, string> = {
  production:
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  prod: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  staging:
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  development:
    'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  dev: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function AgentContextRow({
  agentId,
  environments = [],
  model,
  team,
  tags: initialTags = [],
  lastSeen,
}: AgentContextRowProps) {
  const { addToast } = useToast()
  const utils = trpc.useUtils()
  const upsertMutation = trpc.agents.upsert.useMutation()

  const [tags, setTags] = useState<string[]>(initialTags)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagValue, setTagValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTags(initialTags)
  }, [initialTags])

  useEffect(() => {
    if (showTagInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showTagInput])

  const saveTags = useCallback(
    async (newTags: string[]) => {
      try {
        await upsertMutation.mutateAsync({
          id: agentId,
          tags: newTags,
        })
        await utils.agents.get.invalidate({ id: agentId })
      } catch {
        addToast('Failed to update tags', 'error')
        setTags(initialTags)
      }
    },
    [agentId, initialTags, upsertMutation, utils, addToast],
  )

  const addTag = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed || tags.includes(trimmed)) {
        setTagValue('')
        setShowTagInput(false)
        return
      }
      const newTags = [...tags, trimmed]
      setTags(newTags)
      setTagValue('')
      setShowTagInput(false)
      saveTags(newTags)
    },
    [tags, saveTags],
  )

  const removeTag = useCallback(
    (tag: string) => {
      const newTags = tags.filter((t) => t !== tag)
      setTags(newTags)
      saveTags(newTags)
    },
    [tags, saveTags],
  )

  const sections: React.ReactNode[] = []

  // Environments
  if (environments.length > 0) {
    sections.push(
      <div key="envs" className="flex items-center gap-1.5">
        {environments.map((env) => (
          <span
            key={env}
            className={clsx(
              'text-xs font-medium uppercase px-2 py-0.5 rounded border',
              envColors[env.toLowerCase()] ||
                'bg-surface-overlay/50 text-content-muted border-border',
            )}
          >
            {env}
          </span>
        ))}
      </div>,
    )
  }

  // Model
  if (model) {
    sections.push(
      <div key="model" className="flex items-center gap-1.5">
        <span className="text-xs text-content-muted">Model</span>
        <span className="text-sm text-content-primary font-medium">
          {model}
        </span>
      </div>,
    )
  }

  // Team
  if (team) {
    sections.push(
      <div key="team" className="flex items-center gap-1.5">
        <span className="text-xs text-content-muted">Team</span>
        <span className="text-sm text-content-primary font-medium">{team}</span>
      </div>,
    )
  }

  // Tags
  sections.push(
    <div key="tags" className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-content-muted">Tags</span>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-500/10 text-primary-400 text-xs rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-primary-300"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {showTagInput ? (
        <input
          ref={inputRef}
          type="text"
          value={tagValue}
          onChange={(e) => setTagValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag(tagValue)
            }
            if (e.key === 'Escape') {
              setShowTagInput(false)
              setTagValue('')
            }
          }}
          onBlur={() => {
            if (tagValue.trim()) addTag(tagValue)
            else {
              setShowTagInput(false)
              setTagValue('')
            }
          }}
          placeholder="add tag..."
          className="h-6 w-24 px-2 bg-surface-card border border-border rounded text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowTagInput(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-content-muted hover:text-content-secondary border border-dashed border-border rounded-full hover:border-content-muted"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      )}
    </div>,
  )

  // Last seen
  if (lastSeen) {
    const date = lastSeen instanceof Date ? lastSeen : new Date(lastSeen)
    sections.push(
      <div key="lastseen" className="flex items-center gap-1.5">
        <span className="text-xs text-content-muted">Last seen</span>
        <span className="text-sm text-content-secondary">
          {formatRelativeTime(date)}
        </span>
      </div>,
    )
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {sections.map((section, i) => (
        <div key={i} className="flex items-center gap-4">
          {i > 0 && <div className="border-r border-border h-5" />}
          {section}
        </div>
      ))}
    </div>
  )
}
