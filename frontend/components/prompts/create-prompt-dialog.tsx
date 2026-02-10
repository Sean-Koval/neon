'use client'

import { X, Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { extractVariables, extractVariablesFromMessages } from '@/lib/extract-variables'
import { trpc } from '@/lib/trpc'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface CreatePromptDialogProps {
  open: boolean
  onClose: () => void
  existingTags: string[]
  /** Pre-fill for duplicate mode */
  duplicate?: {
    name: string
    description: string
    type: 'text' | 'chat'
    template: string
    messages: ChatMessage[]
    tags: string[]
    variant?: string
    config?: { model?: string; temperature?: number; maxTokens?: number }
  }
}

export function CreatePromptDialog({ open, onClose, existingTags, duplicate }: CreatePromptDialogProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const createMutation = trpc.prompts.create.useMutation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'text' | 'chat'>('text')
  const [template, setTemplate] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', content: '' },
  ])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [variant, setVariant] = useState('control')

  const nameDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Pre-fill for duplicate mode
  useEffect(() => {
    if (duplicate) {
      setName(`${duplicate.name}-copy`)
      setDescription(duplicate.description)
      setType(duplicate.type)
      setTemplate(duplicate.template)
      if (duplicate.messages.length > 0) {
        setMessages(duplicate.messages)
      }
      setTags(duplicate.tags)
      setVariant(duplicate.variant || 'control')
      if (duplicate.config) {
        setModel(duplicate.config.model || '')
        setTemperature(duplicate.config.temperature ?? 0.7)
        setMaxTokens(duplicate.config.maxTokens ?? 2048)
      }
    }
  }, [duplicate])

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        if (!duplicate) {
          setName('')
          setDescription('')
          setType('text')
          setTemplate('')
          setMessages([{ role: 'system', content: '' }])
          setTags([])
          setTagInput('')
          setNameError('')
          setSubmitError('')
          setConfigOpen(false)
          setModel('')
          setTemperature(0.7)
          setMaxTokens(2048)
          setVariant('control')
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open, duplicate])

  // Name validation
  const validateName = useCallback((value: string) => {
    if (!value) {
      setNameError('')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
      setNameError('Must start with letter/number, only lowercase letters, numbers, and hyphens')
      return
    }
    if (value.length > 64) {
      setNameError('Maximum 64 characters')
      return
    }
    setNameError('')
  }, [])

  useEffect(() => {
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    nameDebounceRef.current = setTimeout(() => validateName(name), 300)
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    }
  }, [name, validateName])

  // Detected variables
  const detectedVars = useMemo(() => {
    if (type === 'chat') {
      return extractVariablesFromMessages(messages)
    }
    return extractVariables(template)
  }, [type, template, messages])

  // Add tag
  const addTag = useCallback((tag: string) => {
    const normalizedTags = tag
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    if (normalizedTags.length === 0) {
      setTagInput('')
      return
    }

    setTags((prev) => {
      const next = [...prev]
      for (const normalized of normalizedTags) {
        if (!next.includes(normalized)) {
          next.push(normalized)
        }
      }
      return next
    })
    setTagInput('')
  }, [])

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  // Message management
  const addMessage = useCallback(() => {
    setMessages((prev) => [...prev, { role: 'user', content: '' }])
  }, [])

  const removeMessage = useCallback((index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateMessage = useCallback((index: number, field: 'role' | 'content', value: string) => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === index ? { ...msg, [field]: value } : msg,
      ),
    )
  }, [])

  // Check if form is valid
  const canSubmit = useMemo(() => {
    if (!name || nameError) return false
    if (type === 'text' && !template.trim()) return false
    if (type === 'chat' && messages.every((m) => !m.content.trim())) return false
    return !createMutation.isPending
  }, [name, nameError, type, template, messages, createMutation.isPending])

  const handleSubmit = useCallback(async () => {
    setSubmitError('')
    try {
      const pendingTag = tagInput.trim().toLowerCase()
      const normalizedTags = pendingTag
        ? Array.from(new Set([...tags, ...pendingTag.split(',').map((t) => t.trim()).filter(Boolean)]))
        : tags

      const config: Record<string, unknown> = {}
      if (model) config.model = model
      config.temperature = temperature
      config.maxTokens = maxTokens

      const result = await createMutation.mutateAsync({
        name,
        description: description || undefined,
        type,
        template: type === 'text' ? template : undefined,
        messages: type === 'chat' ? messages : undefined,
        tags: normalizedTags.length > 0 ? normalizedTags : undefined,
        variant,
        config: Object.keys(config).length > 0 ? config : undefined,
        commit_message: 'Initial version',
      })

      addToast('Prompt created', 'success')
      onClose()
      router.push(`/prompts/${result.name}?variant=${result.variant || 'control'}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create prompt'
      setSubmitError(msg)
    }
  }, [name, description, type, template, messages, tags, tagInput, model, temperature, maxTokens, variant, createMutation, addToast, onClose, router])

  // Tag suggestions filtered
  const tagSuggestions = existingTags.filter(
    (t) => !tags.includes(t) && t.includes(tagInput.toLowerCase()),
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-surface-card border border-border rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">
            {duplicate ? 'Duplicate Prompt' : 'Create Prompt'}
          </h2>
          <button type="button" onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. booking-system"
            className="w-full h-9 px-3 font-mono bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
          {nameError && <p className="text-xs text-rose-500 mt-1">{nameError}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="e.g. System prompt for the booking agent"
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">Type *</label>
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="promptType"
                checked={type === 'text'}
                onChange={() => setType('text')}
                className="mt-0.5 text-primary-500 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-content-primary">Text</span>
                <p className="text-xs text-content-muted">Single template string with {'{{variable}}'} syntax</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="promptType"
                checked={type === 'chat'}
                onChange={() => setType('chat')}
                className="mt-0.5 text-primary-500 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-content-primary">Chat</span>
                <p className="text-xs text-content-muted">Structured message array (role + content pairs)</p>
              </div>
            </label>
          </div>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            {type === 'text' ? 'Template *' : 'Messages *'}
          </label>

          {type === 'text' ? (
            <>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Enter your prompt template... Use {{variable_name}} for dynamic values."
                className="w-full min-h-[200px] p-3 font-mono text-sm bg-surface-card border border-border rounded-md text-content-primary placeholder:text-content-muted resize-y focus:outline-none focus:border-primary-500/50"
              />
              <div className="mt-1.5 text-xs text-content-muted">
                Variables detected:{' '}
                {detectedVars.length === 0
                  ? '(none yet)'
                  : detectedVars.map((v) => (
                      <span key={v.name} className="badge badge-gray text-[10px] mx-0.5">
                        {v.name}
                      </span>
                    ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-content-muted cursor-grab" />
                      <span className="text-xs text-content-muted">Message {i + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={msg.role}
                        onChange={(e) => updateMessage(i, 'role', e.target.value)}
                        className="h-7 text-xs bg-surface-card border border-border rounded px-2 text-content-secondary focus:outline-none"
                      >
                        <option value="system">system</option>
                        <option value="user">user</option>
                        <option value="assistant">assistant</option>
                      </select>
                      {messages.length > 1 && (
                        <button type="button" onClick={() => removeMessage(i)} className="text-content-muted hover:text-rose-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={msg.content}
                    onChange={(e) => updateMessage(i, 'content', e.target.value)}
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
              <div className="text-xs text-content-muted">
                Variables detected:{' '}
                {detectedVars.length === 0
                  ? '(none yet)'
                  : detectedVars.map((v) => (
                      <span key={v.name} className="badge badge-gray text-[10px] mx-0.5">
                        {v.name}
                      </span>
                    ))}
              </div>
            </div>
          )}
        </div>

        {/* Model Configuration (collapsible) */}
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
            Model Configuration
          </button>

          {configOpen && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-content-muted mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gemini-2.5-flash"
                  className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
                />
                <p className="text-xs text-content-muted mt-0.5">Suggested model. Agent runtime may override.</p>
              </div>
              <div>
                <label className="block text-xs text-content-muted mb-1">Temperature</label>
                <input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-24 h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-content-muted mb-1">Max Tokens</label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  min={1}
                  className="w-24 h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="badge badge-gray text-[10px] flex items-center gap-1 cursor-pointer"
                onClick={() => removeTag(tag)}
              >
                {tag} <X className="w-3 h-3" />
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput)
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && tagInput.trim()) {
                  e.preventDefault()
                  addTag(tagInput)
                }
              }}
              placeholder="Type to add tags..."
              className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              disabled={!tagInput.trim()}
              className="absolute right-1 top-1 h-7 px-2 rounded-md text-xs btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            {tagInput && tagSuggestions.length > 0 && (
              <div className="absolute left-0 top-10 z-10 bg-surface-card border border-border rounded-md shadow-lg py-1 w-full max-h-[120px] overflow-y-auto">
                {tagSuggestions.slice(0, 5).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-raised/50"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <p className="text-sm text-rose-500">{submitError}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
