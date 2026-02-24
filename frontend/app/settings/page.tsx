'use client'

/**
 * Settings Page
 *
 * Central configuration page with tabs for project, API keys, LLM providers, and infrastructure.
 */

import { clsx } from 'clsx'
import { Building2, Database, Key, Server } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ApiKeysSection } from '@/components/settings/api-keys-section'
import { InfrastructureStatus } from '@/components/settings/infrastructure'
import { LlmProviders } from '@/components/settings/llm-providers'
import { ProjectSettings } from '@/components/settings/project-settings'

type TabId = 'project' | 'api-keys' | 'llm' | 'infrastructure'

const validTabs: TabId[] = ['project', 'api-keys', 'llm', 'infrastructure']

const tabs = [
  { id: 'project' as const, name: 'Project', icon: Building2 },
  { id: 'api-keys' as const, name: 'API Keys', icon: Key },
  { id: 'llm' as const, name: 'LLM Providers', icon: Server },
  { id: 'infrastructure' as const, name: 'Infrastructure', icon: Database },
]

function isValidTab(tab: string | null): tab is TabId {
  return tab !== null && validTabs.includes(tab as TabId)
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const activeTab: TabId = isValidTab(tabParam) ? tabParam : 'project'

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`/settings?${params.toString()}`)
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Configure your project, API keys, and infrastructure connections
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border dark:border-slate-700/80 mb-6">
        <nav className="flex gap-6" aria-label="Settings tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 pb-3 border-b-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-dark-600',
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'project' && <ProjectSettings />}
        {activeTab === 'api-keys' && <ApiKeysSection />}
        {activeTab === 'llm' && <LlmProviders />}
        {activeTab === 'infrastructure' && <InfrastructureStatus />}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
