'use client'

/**
 * Settings Page
 *
 * Central configuration page with tabs for project, API keys, LLM providers, and infrastructure.
 */

import { clsx } from 'clsx'
import { Building2, Database, Key, Server } from 'lucide-react'
import { useState } from 'react'
import { ApiKeysSection } from '@/components/settings/api-keys-section'
import { InfrastructureStatus } from '@/components/settings/infrastructure'
import { LlmProviders } from '@/components/settings/llm-providers'
import { ProjectSettings } from '@/components/settings/project-settings'

type TabId = 'project' | 'api-keys' | 'llm' | 'infrastructure'

const tabs = [
  { id: 'project' as const, name: 'Project', icon: Building2 },
  { id: 'api-keys' as const, name: 'API Keys', icon: Key },
  { id: 'llm' as const, name: 'LLM Providers', icon: Server },
  { id: 'infrastructure' as const, name: 'Infrastructure', icon: Database },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('project')

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500">
          Configure your project, API keys, and infrastructure connections
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b mb-6">
        <nav className="flex gap-6" aria-label="Settings tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 pb-3 border-b-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
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
