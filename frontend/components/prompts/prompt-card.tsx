'use client'

import { clsx } from 'clsx'
import { MoreVertical, Sparkles, User, Check } from 'lucide-react'
import Link from 'next/link'
import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { extractVariables, extractVariablesFromMessages } from '@/lib/extract-variables'
import type { Prompt } from '@/lib/types'

interface PromptCardProps {
  prompt: Prompt
  onDuplicate: (prompt: Prompt) => void
  onSetProduction: (prompt: Prompt) => void
  onDelete: (prompt: Prompt) => void
}

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

function getScoreColor(score: number): string {
  if (score >= 0.85) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getVariableCount(prompt: Prompt): number {
  if (prompt.type === 'chat' && prompt.messages) {
    return extractVariablesFromMessages(prompt.messages).length
  }
  if (prompt.template) {
    return extractVariables(prompt.template).length
  }
  return 0
}

function estimateTokens(prompt: Prompt): number {
  let text = ''
  if (prompt.type === 'chat' && prompt.messages) {
    text = prompt.messages.map((m) => m.content).join('\n')
  } else if (prompt.template) {
    text = prompt.template
  }
  // Rough estimate: ~4 chars per token for English text
  return Math.round(text.length / 4)
}

function PromptCardComponent({ prompt, onDuplicate, onSetProduction, onDelete }: PromptCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleMenuToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuOpen((prev) => !prev)
    },
    [],
  )

  const handleAction = useCallback(
    (action: () => void) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuOpen(false)
      action()
    },
    [],
  )

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const varCount = getVariableCount(prompt)
  const tokenEstimate = estimateTokens(prompt)
  const isAutoOpt = prompt.created_by === 'auto-opt'

  const promptHref =
    prompt.variant && prompt.variant !== 'control'
      ? `/prompts/${prompt.name}?variant=${encodeURIComponent(prompt.variant)}`
      : `/prompts/${prompt.name}`

  return (
    <Link href={promptHref} className="block">
      <div className="group relative card p-4 cursor-pointer hover:border-[var(--card-hover-border)] transition-colors">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold font-mono text-content-primary truncate">
            {prompt.name}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {prompt.variant && prompt.variant !== 'control' && (
              <span className="badge text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                {prompt.variant}
              </span>
            )}
            <span
              className={clsx(
                'badge text-[10px]',
                prompt.type === 'chat' ? 'badge-primary' : 'badge-gray',
              )}
            >
              {prompt.type}
            </span>
            {prompt.is_production && (
              <span className="badge badge-green text-[10px]">
                <Check className="w-2.5 h-2.5" />
                production
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {prompt.description && (
          <p className="mt-1.5 text-sm text-content-secondary line-clamp-1">
            {prompt.description}
          </p>
        )}

        {/* Attribution line */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-content-muted">
          <span>v{prompt.version} (latest)</span>
          <span>·</span>
          {isAutoOpt ? (
            <Sparkles className="w-3 h-3 text-amber-500" />
          ) : (
            <User className="w-3 h-3 text-content-muted" />
          )}
          <span>{isAutoOpt ? 'auto-opt' : prompt.created_by || 'human'}</span>
          <span>·</span>
          <span>{formatRelativeTime(prompt.updated_at)}</span>
        </div>

        {/* Metrics row */}
        <div className="mt-2 flex items-center gap-2 text-xs text-content-muted">
          <span className={prompt.config ? getScoreColor(0) : ''}>
            Score: <span className="text-content-muted">&mdash;</span>
          </span>
          <span>·</span>
          <span>Tokens: ~{tokenEstimate}</span>
          <span>·</span>
          <span>{varCount} variable{varCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Tags */}
        {prompt.tags && prompt.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {prompt.tags.map((tag) => (
              <span key={tag} className="badge badge-gray text-[10px] px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Overflow menu trigger */}
        <div ref={menuRef} className="absolute top-3 right-3">
          <button
            type="button"
            onClick={handleMenuToggle}
            className="btn btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 bg-surface-card border border-border rounded-md shadow-lg py-1 min-w-[160px]">
              <button
                type="button"
                onClick={handleAction(() => onDuplicate(prompt))}
                className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50"
              >
                Duplicate
              </button>
              {!prompt.is_production && (
                <button
                  type="button"
                  onClick={handleAction(() => onSetProduction(prompt))}
                  className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50"
                >
                  Set as Production
                </button>
              )}
              <div className="border-t border-border my-1" />
              <button
                type="button"
                onClick={handleAction(() => onDelete(prompt))}
                className="w-full text-left px-3 py-1.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-surface-raised/50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export const PromptCard = memo(PromptCardComponent)
