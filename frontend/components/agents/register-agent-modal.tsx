'use client'

import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/toast'
import { trpc } from '@/lib/trpc'

interface RegisterAgentModalProps {
  open: boolean
  onClose: () => void
}

const ENVIRONMENT_OPTIONS = ['production', 'staging', 'development'] as const

export function RegisterAgentModal({ open, onClose }: RegisterAgentModalProps) {
  const { addToast } = useToast()
  const utils = trpc.useUtils()
  const upsertMutation = trpc.agents.upsert.useMutation()

  const [agentName, setAgentName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [team, setTeam] = useState('')
  const [environments, setEnvironments] = useState<string[]>([])
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setAgentName('')
        setDisplayName('')
        setDescription('')
        setTeam('')
        setEnvironments([])
        setNameError('')
        setSubmitError('')
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  const validateName = useCallback((value: string) => {
    if (!value) {
      setNameError('')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
      setNameError(
        'Must start with letter/number, only lowercase letters, numbers, and hyphens',
      )
      return
    }
    if (value.length > 64) {
      setNameError('Maximum 64 characters')
      return
    }
    setNameError('')
  }, [])

  const handleNameChange = useCallback(
    (value: string) => {
      setAgentName(value)
      validateName(value)
    },
    [validateName],
  )

  const toggleEnvironment = useCallback((env: string) => {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env],
    )
  }, [])

  const canSubmit = useMemo(() => {
    return !!agentName && !nameError && !upsertMutation.isPending
  }, [agentName, nameError, upsertMutation.isPending])

  const handleSubmit = useCallback(async () => {
    setSubmitError('')
    try {
      const workspaceId =
        (typeof window !== 'undefined' &&
          localStorage.getItem('neon-workspace-id')) ||
        'default'

      await upsertMutation.mutateAsync({
        id: agentName,
        displayName: displayName || undefined,
        description: description || undefined,
        team: team || undefined,
        environments: environments.length > 0 ? environments : undefined,
        workspaceId,
      })

      addToast('Agent registered', 'success')
      await utils.agents.list.invalidate()
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to register agent'
      setSubmitError(msg)
    }
  }, [
    agentName,
    displayName,
    description,
    team,
    environments,
    upsertMutation,
    addToast,
    utils,
    onClose,
  ])

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
            Register Agent
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-content-muted hover:text-content-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Agent Name (ID) */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Agent Name *
          </label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. booking-agent"
            className="w-full h-9 px-3 font-mono bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
          <p className="text-xs text-content-muted mt-1">
            Unique identifier for the agent. Must match the agent_id in traces.
          </p>
          {nameError && (
            <p className="text-xs text-rose-500 mt-1">{nameError}</p>
          )}
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Booking Agent"
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="Describe what this agent does..."
            rows={3}
            className="w-full p-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted resize-y focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Team */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Team
          </label>
          <input
            type="text"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="e.g. Platform, ML, Product"
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Environments */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Environments
          </label>
          <div className="flex flex-wrap gap-3">
            {ENVIRONMENT_OPTIONS.map((env) => (
              <label
                key={env}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={environments.includes(env)}
                  onChange={() => toggleEnvironment(env)}
                  className="rounded border-border text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-content-secondary capitalize">
                  {env}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {submitError && <p className="text-sm text-rose-500">{submitError}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {upsertMutation.isPending ? 'Registering...' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  )
}
