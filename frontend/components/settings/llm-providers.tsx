'use client'

/**
 * LLM Providers Component
 *
 * Displays configured LLM provider status (Anthropic, OpenAI).
 */

import { CheckCircle, Server, XCircle } from 'lucide-react'
import { useLlmProviders } from '@/hooks/use-settings'

interface ProviderCardProps {
  name: string
  configured: boolean
  description: string
  envVar: string
}

function ProviderCard({
  name,
  configured,
  description,
  envVar,
}: ProviderCardProps) {
  return (
    <div className="border border-border dark:border-slate-700/80 rounded-lg p-4 bg-surface-card/70 dark:bg-slate-900/72">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{name}</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        </div>
        {configured ? (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            Configured
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 text-sm">
            <XCircle className="w-4 h-4" />
            Not configured
          </span>
        )}
      </div>
      <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
        Environment variable:{' '}
        <code className="bg-gray-100 dark:bg-dark-800 px-1 rounded">{envVar}</code>
      </div>
    </div>
  )
}

export function LlmProviders() {
  const { data: providers, isLoading } = useLlmProviders()

  if (isLoading) {
    return (
      <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-24 bg-gray-100 dark:bg-dark-800 rounded" />
            <div className="h-24 bg-gray-100 dark:bg-dark-800 rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Server className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-medium">LLM Provider Configuration</h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Configure your LLM provider API keys to enable agent evaluations with
          different models.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProviderCard
            name="Anthropic"
            configured={providers?.anthropic ?? false}
            description="Claude models for agent tasks"
            envVar="ANTHROPIC_API_KEY"
          />
          <ProviderCard
            name="OpenAI"
            configured={providers?.openai ?? false}
            description="GPT models for agent tasks"
            envVar="OPENAI_API_KEY"
          />
        </div>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          LLM provider keys are configured via server-side environment variables
          for security. Contact your administrator to add or update provider
          keys.
        </p>
      </div>
    </div>
  )
}
