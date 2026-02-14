'use client'

import { Check, Copy, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'

interface AgentInfoSectionProps {
  agentId: string
}

export function AgentInfoSection({ agentId }: AgentInfoSectionProps) {
  const { data: agent } = trpc.agents.get.useQuery({ id: agentId })
  const { data: promptData } = trpc.agents.getSystemPrompt.useQuery({ agentId })
  const [copied, setCopied] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)

  const copyId = async () => {
    await navigator.clipboard.writeText(agentId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const metadata = agent?.metadata as Record<string, unknown> | undefined
  const slaTargets = metadata?.slaTargets as
    | {
        minPassRate?: number
        maxErrorRate?: number
        maxLatencyMs?: number
        maxCostPerCall?: number
      }
    | undefined

  const systemPrompt = promptData?.systemPrompt || null
  const promptLines = systemPrompt?.split('\n') || []
  const truncated = promptLines.length > 10 && !promptExpanded
  const displayPrompt = truncated
    ? promptLines.slice(0, 10).join('\n')
    : systemPrompt

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left - Details Card */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">Details</h3>
        <div className="space-y-4">
          {/* Agent ID */}
          <div>
            <label className="text-xs text-content-muted uppercase tracking-wide">
              Agent ID
            </label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm text-content-primary font-mono bg-gray-50 dark:bg-dark-900 rounded px-2 py-1 flex-1 truncate">
                {agentId}
              </code>
              <button
                type="button"
                onClick={copyId}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors text-content-muted hover:text-content-primary"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Created */}
          <div>
            <label className="text-xs text-content-muted uppercase tracking-wide">
              Created
            </label>
            <p className="text-sm text-content-secondary mt-1">
              {agent?.metadata &&
              (agent.metadata as Record<string, unknown>).createdAt
                ? new Date(
                    (agent.metadata as Record<string, unknown>)
                      .createdAt as string,
                  ).toLocaleDateString()
                : 'Auto-discovered'}
            </p>
          </div>

          {/* Description */}
          {agent?.description && (
            <div>
              <label className="text-xs text-content-muted uppercase tracking-wide">
                Description
              </label>
              <p className="text-sm text-content-secondary mt-1">
                {agent.description}
              </p>
            </div>
          )}

          {/* SLA Targets */}
          {slaTargets && (
            <div>
              <label className="text-xs text-content-muted uppercase tracking-wide">
                SLA Targets
              </label>
              <ul className="mt-1 space-y-1">
                {slaTargets.minPassRate != null && (
                  <li className="text-sm text-content-secondary">
                    Min Pass Rate:{' '}
                    <span className="font-medium text-content-primary">
                      {slaTargets.minPassRate}%
                    </span>
                  </li>
                )}
                {slaTargets.maxErrorRate != null && (
                  <li className="text-sm text-content-secondary">
                    Max Error Rate:{' '}
                    <span className="font-medium text-content-primary">
                      {slaTargets.maxErrorRate}%
                    </span>
                  </li>
                )}
                {slaTargets.maxLatencyMs != null && (
                  <li className="text-sm text-content-secondary">
                    Max Latency:{' '}
                    <span className="font-medium text-content-primary">
                      {slaTargets.maxLatencyMs}ms
                    </span>
                  </li>
                )}
                {slaTargets.maxCostPerCall != null && (
                  <li className="text-sm text-content-secondary">
                    Max Cost/Call:{' '}
                    <span className="font-medium text-content-primary">
                      ${slaTargets.maxCostPerCall}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Associated Suites */}
          {agent?.associatedSuites && agent.associatedSuites.length > 0 && (
            <div>
              <label className="text-xs text-content-muted uppercase tracking-wide">
                Associated Suites
              </label>
              <ul className="mt-1 space-y-1">
                {agent.associatedSuites.map((suiteId) => (
                  <li key={suiteId}>
                    <Link
                      href={`/suites/${suiteId}`}
                      className="text-sm text-primary-500 dark:text-primary-400 hover:text-primary-400 dark:hover:text-primary-300 transition-colors inline-flex items-center gap-1"
                    >
                      {suiteId}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right - System Prompt Preview */}
      <div className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="text-content-primary font-semibold mb-4">
          System Prompt
        </h3>
        {systemPrompt ? (
          <div>
            <pre className="text-sm font-mono text-content-secondary bg-gray-50 dark:bg-dark-900 rounded p-4 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
              {displayPrompt}
            </pre>
            {promptLines.length > 10 && (
              <button
                type="button"
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="mt-2 text-sm text-primary-500 dark:text-primary-400 hover:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                {promptExpanded ? 'Show Less' : 'View Full Prompt'}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-dark-900 rounded p-4">
            <p className="text-sm text-content-muted italic">
              No system prompt detected
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
