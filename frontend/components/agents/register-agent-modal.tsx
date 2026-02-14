'use client'

import { clsx } from 'clsx'
import { ChevronDown, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { trpc } from '@/lib/trpc'

interface AgentEditData {
  id: string
  name?: string
  description?: string
  team?: string
  environments?: string[]
  tags?: string[]
  associatedSuites?: string[]
  mcpServers?: string[]
  metadata?: Record<string, unknown>
}

interface RegisterAgentModalProps {
  open: boolean
  onClose: () => void
  mode?: 'create' | 'edit'
  agentData?: AgentEditData
}

const ENVIRONMENT_OPTIONS = ['production', 'staging', 'development'] as const

export function RegisterAgentModal({
  open,
  onClose,
  mode = 'create',
  agentData,
}: RegisterAgentModalProps) {
  const isEdit = mode === 'edit'
  const { addToast } = useToast()
  const utils = trpc.useUtils()
  const upsertMutation = trpc.agents.upsert.useMutation()

  const [agentName, setAgentName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [team, setTeam] = useState('')
  const [environments, setEnvironments] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [associatedSuites, setAssociatedSuites] = useState<string[]>([])
  const [mcpServers, setMcpServers] = useState<string[]>([])
  const [mcpInput, setMcpInput] = useState('')
  const [slaTargets, setSlaTargets] = useState({
    minPassRate: 90,
    maxErrorRate: 5,
    maxLatencyMs: 2000,
    maxCostPerCall: 1.0,
  })
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false)
  const [suitesDropdownOpen, setSuitesDropdownOpen] = useState(false)
  const teamRef = useRef<HTMLDivElement>(null)
  const suitesRef = useRef<HTMLDivElement>(null)

  // Fetch existing agents for team/tag extraction
  const agentsQuery = trpc.agents.list.useQuery(undefined, { enabled: open })
  const suitesQuery = trpc.suites.list.useQuery(undefined, { enabled: open })

  const existingTeams = useMemo(() => {
    if (!agentsQuery.data) return []
    const teams = agentsQuery.data
      .map((a: { team?: string | null }) => a.team)
      .filter((t): t is string => !!t)
    return [...new Set(teams)].sort()
  }, [agentsQuery.data])

  const existingTags = useMemo(() => {
    if (!agentsQuery.data) return []
    const allTags = agentsQuery.data.flatMap(
      (a: { tags?: string[] }) => a.tags || [],
    )
    return [...new Set(allTags)].sort()
  }, [agentsQuery.data])

  const filteredTeams = useMemo(() => {
    if (!team) return existingTeams
    return existingTeams.filter((t) =>
      t.toLowerCase().includes(team.toLowerCase()),
    )
  }, [existingTeams, team])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (teamRef.current && !teamRef.current.contains(e.target as Node)) {
        setTeamDropdownOpen(false)
      }
      if (suitesRef.current && !suitesRef.current.contains(e.target as Node)) {
        setSuitesDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Track initial values for dirty field detection in edit mode
  const initialValues = useMemo(() => {
    if (!isEdit || !agentData) return null
    const sla = (agentData.metadata?.slaTargets ?? {}) as Record<string, number>
    return {
      agentName: agentData.id,
      displayName: agentData.name ?? '',
      description: agentData.description ?? '',
      team: agentData.team ?? '',
      environments: agentData.environments ?? [],
      tags: agentData.tags ?? [],
      associatedSuites: agentData.associatedSuites ?? [],
      mcpServers: agentData.mcpServers ?? [],
      slaTargets: {
        minPassRate: sla.minPassRate ?? 90,
        maxErrorRate: sla.maxErrorRate ?? 5,
        maxLatencyMs: sla.maxLatencyMs ?? 2000,
        maxCostPerCall: sla.maxCostPerCall ?? 1.0,
      },
    }
  }, [isEdit, agentData])

  // Populate form when opening in edit mode
  useEffect(() => {
    if (open && isEdit && initialValues) {
      setAgentName(initialValues.agentName)
      setDisplayName(initialValues.displayName)
      setDescription(initialValues.description)
      setTeam(initialValues.team)
      setEnvironments(initialValues.environments)
      setTags(initialValues.tags)
      setAssociatedSuites(initialValues.associatedSuites)
      setMcpServers(initialValues.mcpServers)
      setSlaTargets(initialValues.slaTargets)
    }
  }, [open, isEdit, initialValues])

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setAgentName('')
        setDisplayName('')
        setDescription('')
        setTeam('')
        setEnvironments([])
        setTags([])
        setTagInput('')
        setAssociatedSuites([])
        setMcpServers([])
        setMcpInput('')
        setSlaTargets({
          minPassRate: 90,
          maxErrorRate: 5,
          maxLatencyMs: 2000,
          maxCostPerCall: 1.0,
        })
        setNameError('')
        setSubmitError('')
        setTeamDropdownOpen(false)
        setSuitesDropdownOpen(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Dirty field detection for edit mode
  function isDirty(field: string): boolean {
    if (!isEdit || !initialValues) return false
    switch (field) {
      case 'displayName':
        return displayName !== initialValues.displayName
      case 'description':
        return description !== initialValues.description
      case 'team':
        return team !== initialValues.team
      case 'environments':
        return (
          JSON.stringify(environments.sort()) !==
          JSON.stringify(initialValues.environments.sort())
        )
      case 'tags':
        return (
          JSON.stringify(tags.sort()) !==
          JSON.stringify(initialValues.tags.sort())
        )
      case 'slaTargets':
        return (
          JSON.stringify(slaTargets) !==
          JSON.stringify(initialValues.slaTargets)
        )
      default:
        return false
    }
  }

  const dirtyBorder = 'border-l-2 border-l-primary-500'

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

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim()
      if (trimmed && !tags.includes(trimmed)) {
        setTags((prev) => [...prev, trimmed])
      }
      setTagInput('')
    },
    [tags],
  )

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const toggleSuite = useCallback((suiteId: string) => {
    setAssociatedSuites((prev) =>
      prev.includes(suiteId)
        ? prev.filter((s) => s !== suiteId)
        : [...prev, suiteId],
    )
  }, [])

  const addMcpServer = useCallback(
    (server: string) => {
      const trimmed = server.trim()
      if (trimmed && !mcpServers.includes(trimmed)) {
        setMcpServers((prev) => [...prev, trimmed])
      }
      setMcpInput('')
    },
    [mcpServers],
  )

  const removeMcpServer = useCallback((server: string) => {
    setMcpServers((prev) => prev.filter((s) => s !== server))
  }, [])

  const canSubmit = useMemo(() => {
    return !!agentName && !nameError && !upsertMutation.isPending
  }, [agentName, nameError, upsertMutation.isPending])

  const handleSubmit = useCallback(async () => {
    setSubmitError('')
    try {
      await upsertMutation.mutateAsync({
        id: agentName,
        displayName: displayName || undefined,
        description: description || undefined,
        team: team || undefined,
        environments: environments.length > 0 ? environments : undefined,
        tags: tags.length > 0 ? tags : undefined,
        associatedSuites:
          associatedSuites.length > 0 ? associatedSuites : undefined,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        metadata: { slaTargets },
      })

      addToast(isEdit ? 'Agent updated' : 'Agent registered', 'success')
      await utils.agents.list.invalidate()
      if (isEdit) await utils.agents.get.invalidate({ id: agentName })
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
    tags,
    associatedSuites,
    mcpServers,
    slaTargets,
    upsertMutation,
    addToast,
    utils,
    onClose,
    isEdit,
  ])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        role="presentation"
      />

      {/* Dialog */}
      <div className="relative bg-surface-card border border-border rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary">
            {isEdit ? 'Edit Agent' : 'Register Agent'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-content-muted hover:text-content-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* === Identity Section === */}
        <div>
          <h3 className="text-sm font-medium text-content-primary mb-3">
            Identity
          </h3>
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
            readOnly={isEdit}
            className={clsx(
              'w-full h-9 px-3 font-mono bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50',
              isEdit && 'opacity-60 cursor-not-allowed',
            )}
          />
          <p className="text-xs text-content-muted mt-1">
            Unique identifier for the agent. Must match the agent_id in traces.
          </p>
          {nameError && (
            <p className="text-xs text-rose-500 mt-1">{nameError}</p>
          )}
        </div>

        {/* Display Name */}
        <div
          className={clsx(
            isDirty('displayName') && dirtyBorder,
            isDirty('displayName') && 'pl-3',
          )}
        >
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
        <div
          className={clsx(
            isDirty('description') && dirtyBorder,
            isDirty('description') && 'pl-3',
          )}
        >
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

        {/* === Organization Section === */}
        <div className="border-t border-border pt-4 mt-2">
          <h3 className="text-sm font-medium text-content-primary mb-3">
            Organization
          </h3>
        </div>

        {/* Team (Combobox) */}
        <div ref={teamRef} className="relative">
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Team
          </label>
          <div className="relative">
            <input
              type="text"
              value={team}
              onChange={(e) => {
                setTeam(e.target.value)
                setTeamDropdownOpen(true)
              }}
              onFocus={() => setTeamDropdownOpen(true)}
              placeholder="e.g. Platform, ML, Product"
              className="w-full h-9 px-3 pr-8 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
            />
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
          </div>
          {teamDropdownOpen && filteredTeams.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-surface-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
              {filteredTeams.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTeam(t)
                    setTeamDropdownOpen(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-content-secondary hover:bg-surface-hover"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Tags
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
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
            </div>
          )}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
            placeholder="Type a tag and press Enter"
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {existingTags
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="px-2 py-0.5 text-xs rounded-full border border-border text-content-muted hover:text-content-secondary hover:border-content-muted"
                  >
                    + {t}
                  </button>
                ))}
            </div>
          )}
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

        {/* === Connections Section === */}
        <div className="border-t border-border pt-4 mt-2">
          <h3 className="text-sm font-medium text-content-primary mb-3">
            Connections
          </h3>
        </div>

        {/* Eval Suites */}
        <div ref={suitesRef} className="relative">
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            Eval Suites
          </label>
          {associatedSuites.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {associatedSuites.map((suiteId) => {
                const suite = (
                  suitesQuery.data as { id: string; name: string }[] | undefined
                )?.find((s) => s.id === suiteId)
                return (
                  <span
                    key={suiteId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-500/10 text-primary-400 text-xs rounded-full"
                  >
                    {suite?.name || suiteId}
                    <button
                      type="button"
                      onClick={() => toggleSuite(suiteId)}
                      className="hover:text-primary-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSuitesDropdownOpen((prev) => !prev)}
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-sm text-content-muted text-left flex items-center justify-between focus:outline-none focus:border-primary-500/50"
          >
            <span>Select suites...</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          {suitesDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-surface-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
              {suitesQuery.isLoading ? (
                <div className="px-3 py-2 text-sm text-content-muted">
                  Loading...
                </div>
              ) : (
                  suitesQuery.data as { id: string; name: string }[] | undefined
                )?.length ? (
                (suitesQuery.data as { id: string; name: string }[]).map(
                  (suite) => (
                    <label
                      key={suite.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={associatedSuites.includes(suite.id)}
                        onChange={() => toggleSuite(suite.id)}
                        className="rounded border-border text-primary-500 focus:ring-primary-500"
                      />
                      <span className="text-sm text-content-secondary">
                        {suite.name}
                      </span>
                    </label>
                  ),
                )
              ) : (
                <div className="px-3 py-2 text-sm text-content-muted">
                  No suites found
                </div>
              )}
            </div>
          )}
        </div>

        {/* MCP Servers */}
        <div>
          <label className="block text-sm font-medium text-content-primary mb-1.5">
            MCP Servers
          </label>
          {mcpServers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {mcpServers.map((server) => (
                <span
                  key={server}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-500/10 text-primary-400 text-xs rounded-full"
                >
                  {server}
                  <button
                    type="button"
                    onClick={() => removeMcpServer(server)}
                    className="hover:text-primary-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={mcpInput}
            onChange={(e) => setMcpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addMcpServer(mcpInput)
              }
            }}
            placeholder="Enter server URL and press Enter"
            className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* === SLA Targets Section === */}
        <div className="border-t border-border pt-4 mt-2">
          <h3 className="text-sm font-medium text-content-primary mb-3">
            SLA Targets
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1.5">
              Min Pass Rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={slaTargets.minPassRate}
              onChange={(e) =>
                setSlaTargets((prev) => ({
                  ...prev,
                  minPassRate: Number(e.target.value),
                }))
              }
              className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm focus:outline-none focus:border-primary-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1.5">
              Max Error Rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={slaTargets.maxErrorRate}
              onChange={(e) =>
                setSlaTargets((prev) => ({
                  ...prev,
                  maxErrorRate: Number(e.target.value),
                }))
              }
              className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm focus:outline-none focus:border-primary-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1.5">
              Max Latency (ms)
            </label>
            <input
              type="number"
              min={0}
              value={slaTargets.maxLatencyMs}
              onChange={(e) =>
                setSlaTargets((prev) => ({
                  ...prev,
                  maxLatencyMs: Number(e.target.value),
                }))
              }
              className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm focus:outline-none focus:border-primary-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-primary mb-1.5">
              Max Cost per Call ($)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={slaTargets.maxCostPerCall}
              onChange={(e) =>
                setSlaTargets((prev) => ({
                  ...prev,
                  maxCostPerCall: Number(e.target.value),
                }))
              }
              className="w-full h-9 px-3 bg-surface-card border border-border rounded-md text-content-primary text-sm focus:outline-none focus:border-primary-500/50"
            />
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
            {upsertMutation.isPending
              ? isEdit
                ? 'Saving...'
                : 'Registering...'
              : isEdit
                ? 'Save Changes'
                : 'Register'}
          </button>
        </div>
      </div>
    </div>
  )
}
