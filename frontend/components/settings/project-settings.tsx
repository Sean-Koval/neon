'use client'

/**
 * Project Settings Component
 *
 * Displays read-only project configuration from environment variables.
 */

import { Building2, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useProjectSettings } from '@/hooks/use-settings'

export function ProjectSettings() {
  const { data: settings, isLoading } = useProjectSettings()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (isLoading) {
    return (
      <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
          <div className="h-4 w-full bg-gray-100 dark:bg-dark-800 rounded" />
          <div className="h-4 w-3/4 bg-gray-100 dark:bg-dark-800 rounded" />
        </div>
      </div>
    )
  }

  const projectId =
    settings?.projectId || '00000000-0000-0000-0000-000000000001'
  const projectName = settings?.projectName || 'Default Project'
  const environment = settings?.environment || 'development'

  return (
    <div className="space-y-6">
      <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-medium">Project Information</h3>
        </div>

        <div className="space-y-4">
          {/* Project ID */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project ID
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-900 border border-border dark:border-slate-700/80 rounded-lg text-sm font-mono">
                {projectId}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(projectId, 'projectId')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                {copiedField === 'projectId' ? (
                  <Check className="w-4 h-4 text-green-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Project Name */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name
            </span>
            <div className="px-3 py-2 bg-gray-50 dark:bg-dark-900 border border-border dark:border-slate-700/80 rounded-lg text-sm">
              {projectName}
            </div>
          </div>

          {/* Environment */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Environment
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  environment === 'production'
                    ? 'bg-green-100 dark:bg-emerald-500/20 text-green-800 dark:text-emerald-300'
                    : environment === 'staging'
                      ? 'bg-yellow-100 dark:bg-amber-500/20 text-yellow-800 dark:text-amber-300'
                      : 'bg-gray-100 dark:bg-dark-800 text-gray-800 dark:text-gray-200'
                }`}
              >
                {environment}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Project settings are configured via environment variables. Contact
          your administrator to make changes.
        </p>
      </div>
    </div>
  )
}
