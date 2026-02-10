'use client'

/**
 * Start Eval Run Dialog — Redesigned (neon-oucm)
 *
 * Suite-first tab flow with suite preview card, searchable comboboxes,
 * and execution options. Two tabs: Suite (default) and Custom.
 */

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { StartEvalRunRequest } from '@/lib/types'

interface StartEvalRunDialogProps {
  isOpen: boolean
  onClose: () => void
  onStart: (request: StartEvalRunRequest) => void
  isStarting?: boolean
  error?: string | null
  /** Pre-fill with a specific suite */
  prefilledSuiteId?: string
}

type Tab = 'suite' | 'custom'

export function StartEvalRunDialog({
  isOpen,
  onClose,
  onStart,
  isStarting,
  error,
  prefilledSuiteId,
}: StartEvalRunDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>(prefilledSuiteId ? 'suite' : 'suite')
  const [selectedSuiteId, setSelectedSuiteId] = useState(prefilledSuiteId || '')
  const [suiteSearchQuery, setSuiteSearchQuery] = useState('')
  const [isSuiteDropdownOpen, setIsSuiteDropdownOpen] = useState(false)

  const [agentId, setAgentId] = useState('')
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false)
  const [agentVersion, setAgentVersion] = useState('latest')

  const [parallel, setParallel] = useState(true)
  const [parallelism, setParallelism] = useState(5)

  // Custom tab state
  const [selectedScorers, setSelectedScorers] = useState<string[]>([
    'tool_selection',
    'response_quality',
  ])
  const [datasetItems, setDatasetItems] = useState<
    Array<{ input: string; expected: string }>
  >([{ input: '', expected: '' }])

  const suiteDropdownRef = useRef<HTMLDivElement>(null)
  const agentDropdownRef = useRef<HTMLDivElement>(null)

  // Fetch suites and agents
  const { data: suitesData } = trpc.suites.list.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  })
  const { data: agentsData } = trpc.agents.list.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  })

  const suites = useMemo(() => {
    if (!suitesData) return []
    return Array.isArray(suitesData)
      ? suitesData
      : (suitesData as { items?: unknown[] })?.items ?? []
  }, [suitesData]) as Array<{
    id: string
    name: string
    description?: string
    agent_id?: string
    default_scorers?: string[]
    cases?: unknown[]
  }>

  const agents = useMemo(() => {
    if (!agentsData) return []
    return Array.isArray(agentsData)
      ? agentsData
      : (agentsData as { items?: unknown[] })?.items ?? []
  }, [agentsData]) as Array<{
    id: string
    name: string
    version?: string
  }>

  const selectedSuite = useMemo(
    () => suites.find((s) => s.id === selectedSuiteId),
    [suites, selectedSuiteId],
  )

  // When a suite is selected, auto-fill agent
  const handleSuiteSelect = useCallback(
    (suiteId: string) => {
      setSelectedSuiteId(suiteId)
      setIsSuiteDropdownOpen(false)
      setSuiteSearchQuery('')
      const suite = suites.find((s) => s.id === suiteId)
      if (suite?.agent_id && !agentId) {
        setAgentId(suite.agent_id)
      }
    },
    [suites, agentId],
  )

  const handleAgentSelect = useCallback((id: string) => {
    setAgentId(id)
    setIsAgentDropdownOpen(false)
    setAgentSearchQuery('')
  }, [])

  // Filtered lists
  const filteredSuites = useMemo(
    () =>
      suites.filter(
        (s) =>
          s.name.toLowerCase().includes(suiteSearchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(suiteSearchQuery.toLowerCase()),
      ),
    [suites, suiteSearchQuery],
  )

  const filteredAgents = useMemo(
    () =>
      agents.filter(
        (a) =>
          a.name.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
          a.id.toLowerCase().includes(agentSearchQuery.toLowerCase()),
      ),
    [agents, agentSearchQuery],
  )

  // Dataset helpers
  const addDatasetItem = () => {
    setDatasetItems([...datasetItems, { input: '', expected: '' }])
  }

  const removeDatasetItem = (index: number) => {
    setDatasetItems(datasetItems.filter((_, i) => i !== index))
  }

  const updateDatasetItem = (
    index: number,
    field: 'input' | 'expected',
    value: string,
  ) => {
    setDatasetItems(
      datasetItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  const toggleScorer = (scorerId: string) => {
    setSelectedScorers((prev) =>
      prev.includes(scorerId)
        ? prev.filter((s) => s !== scorerId)
        : [...prev, scorerId],
    )
  }

  const SCORER_OPTIONS = [
    { id: 'tool_selection', name: 'Tool Selection', description: 'Evaluates correct tool usage' },
    { id: 'response_quality', name: 'Response Quality', description: 'LLM judge for output quality' },
    { id: 'latency', name: 'Latency', description: 'Response time within threshold' },
    { id: 'token_efficiency', name: 'Token Efficiency', description: 'Token usage optimization' },
    { id: 'contains', name: 'Contains Keywords', description: 'Output contains expected text' },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (activeTab === 'suite') {
      if (!selectedSuiteId || !agentId) return
      const request: StartEvalRunRequest = {
        projectId: 'default',
        agentId,
        agentVersion: agentVersion || 'latest',
        suiteId: selectedSuiteId,
        scorers: selectedSuite?.default_scorers || [],
        parallel,
        parallelism,
        dataset: { items: [] },
      }
      onStart(request)
    } else {
      if (!agentId || datasetItems.every((d) => !d.input.trim())) return
      const request: StartEvalRunRequest = {
        projectId: 'default',
        agentId,
        agentVersion: agentVersion || 'latest',
        dataset: {
          items: datasetItems
            .filter((item) => item.input.trim())
            .map((item) => ({
              input: { query: item.input },
              expected: item.expected ? { output: item.expected } : undefined,
            })),
        },
        scorers: selectedScorers,
        parallel,
        parallelism,
      }
      onStart(request)
    }
  }

  const isSubmitDisabled = useMemo(() => {
    if (isStarting) return true
    if (!agentId) return true
    if (activeTab === 'suite' && !selectedSuiteId) return true
    if (activeTab === 'custom' && datasetItems.every((d) => !d.input.trim())) return true
    return false
  }, [isStarting, agentId, activeTab, selectedSuiteId, datasetItems])

  if (!isOpen) return null

  const hasSuites = suites.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Start Eval Run
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(85vh-8rem)]">
          <div className="p-6 space-y-5">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-lg text-red-800 dark:text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {error.includes('ECONNREFUSED') ||
                  error.includes('Temporal') ||
                  error.includes('temporal')
                    ? 'Temporal unavailable. Run docker compose up -d to start services.'
                    : error}
                </span>
              </div>
            )}

            {/* Source Tabs */}
            <div className="flex border-b border-gray-200 dark:border-dark-700">
              <button
                type="button"
                onClick={() => setActiveTab('suite')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'suite'
                    ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Suite
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('custom')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'custom'
                    ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Suite Tab */}
            {activeTab === 'suite' && (
              <div className="space-y-4">
                {!hasSuites ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      No suites found. Create a suite in the Suites page for faster eval runs.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('custom')}
                      className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
                    >
                      Use Custom tab instead
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Suite Combobox */}
                    <div ref={suiteDropdownRef} className="relative">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Suite <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsSuiteDropdownOpen(!isSuiteDropdownOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-900 text-sm text-left hover:border-gray-400 dark:hover:border-dark-500"
                      >
                        <span className={selectedSuite ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
                          {selectedSuite?.name || 'Select a suite...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>

                      {isSuiteDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg max-h-60 overflow-hidden">
                          <div className="p-2 border-b border-gray-100 dark:border-dark-700">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <input
                                type="text"
                                value={suiteSearchQuery}
                                onChange={(e) => setSuiteSearchQuery(e.target.value)}
                                placeholder="Search suites..."
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-dark-600 rounded bg-gray-50 dark:bg-dark-900 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="overflow-y-auto max-h-48">
                            {filteredSuites.length === 0 ? (
                              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                                No suites found
                              </div>
                            ) : (
                              filteredSuites.map((suite) => (
                                <button
                                  key={suite.id}
                                  type="button"
                                  onClick={() => handleSuiteSelect(suite.id)}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 ${
                                    suite.id === selectedSuiteId
                                      ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                                      : 'text-gray-900 dark:text-gray-100'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{suite.name}</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      {(suite.cases as unknown[])?.length ?? 0} cases
                                      {suite.default_scorers?.length
                                        ? ` · ${suite.default_scorers.length} scorers`
                                        : ''}
                                    </span>
                                  </div>
                                  {suite.description && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                      {suite.description}
                                    </p>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suite Preview Card */}
                    {selectedSuite && (
                      <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 border border-gray-200 dark:border-dark-700">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {selectedSuite.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {(selectedSuite.cases as unknown[])?.length ?? 0} cases
                          {selectedSuite.default_scorers?.length
                            ? ` · ${selectedSuite.default_scorers.length} scorers`
                            : ''}
                          {' · Est. ~'}
                          {Math.max(1, Math.ceil(((selectedSuite.cases as unknown[])?.length ?? 0) * 0.5 / (parallel ? parallelism : 1)))}
                          {' min'}
                        </p>
                        {selectedSuite.default_scorers && selectedSuite.default_scorers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {selectedSuite.default_scorers.map((scorer) => (
                              <span
                                key={scorer}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-dark-700 text-gray-600 dark:text-gray-400"
                              >
                                {scorer.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Custom Tab */}
            {activeTab === 'custom' && (
              <div className="space-y-4">
                {/* Manual Test Cases */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Test Cases <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addDatasetItem}
                      className="flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700"
                    >
                      <Plus className="w-3 h-3" />
                      Add Case
                    </button>
                  </div>
                  <div className="space-y-2">
                    {datasetItems.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="flex-1 space-y-1.5">
                          <input
                            type="text"
                            value={item.input}
                            onChange={(e) =>
                              updateDatasetItem(index, 'input', e.target.value)
                            }
                            placeholder="Input (e.g., 'What is the weather?')"
                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg text-sm bg-white dark:bg-dark-900 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                          />
                          <input
                            type="text"
                            value={item.expected}
                            onChange={(e) =>
                              updateDatasetItem(index, 'expected', e.target.value)
                            }
                            placeholder="Expected output (optional)"
                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-dark-600 rounded-lg text-sm bg-white dark:bg-dark-900 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                          />
                        </div>
                        {datasetItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDatasetItem(index)}
                            className="self-start p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scorers */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Scorers
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCORER_OPTIONS.map((scorer) => (
                      <label
                        key={scorer.id}
                        className={`flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer transition-colors text-sm ${
                          selectedScorers.includes(scorer.id)
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10'
                            : 'border-gray-200 dark:border-dark-600 hover:bg-gray-50 dark:hover:bg-dark-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedScorers.includes(scorer.id)}
                          onChange={() => toggleScorer(scorer.id)}
                          className="mt-0.5 accent-cyan-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                            {scorer.name}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">
                            {scorer.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Agent Config (shared) */}
            <div className="grid grid-cols-2 gap-4">
              <div ref={agentDropdownRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Agent <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-900 text-sm text-left hover:border-gray-400 dark:hover:border-dark-500"
                >
                  <span className={agentId ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
                    {agents.find((a) => a.id === agentId)?.name || agentId || 'Select agent...'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {isAgentDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg shadow-lg max-h-48 overflow-hidden">
                    <div className="p-2 border-b border-gray-100 dark:border-dark-700">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={agentSearchQuery}
                          onChange={(e) => setAgentSearchQuery(e.target.value)}
                          placeholder="Search agents..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-dark-600 rounded bg-gray-50 dark:bg-dark-900 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-36">
                      {filteredAgents.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                          No agents found
                        </div>
                      ) : (
                        filteredAgents.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => handleAgentSelect(agent.id)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-dark-700 ${
                              agent.id === agentId
                                ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {agent.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Version
                </label>
                <input
                  type="text"
                  value={agentVersion}
                  onChange={(e) => setAgentVersion(e.target.value)}
                  placeholder="latest"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg text-sm bg-white dark:bg-dark-900 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Execution Options */}
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={parallel}
                  onChange={(e) => setParallel(e.target.checked)}
                  className="accent-cyan-500"
                />
                Run in parallel
              </label>
              {parallel && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Workers:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={parallelism}
                    onChange={(e) => setParallelism(Number(e.target.value))}
                    className="w-14 px-2 py-1 border border-gray-300 dark:border-dark-600 rounded text-sm bg-white dark:bg-dark-900"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-900">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Eval Run
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StartEvalRunDialog
