'use client'

import type { SuiteFormData } from './types'

interface StepInfoProps {
  data: SuiteFormData
  onChange: (updates: Partial<SuiteFormData>) => void
}

export function StepInfo({ data, onChange }: StepInfoProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-zinc-100">Suite Information</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Define the basic details for your evaluation suite.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="suite-name"
            className="block text-sm font-medium text-zinc-300"
          >
            Suite Name <span className="text-red-400">*</span>
          </label>
          <input
            id="suite-name"
            type="text"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g., Customer Support Agent v2"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="suite-agent"
            className="block text-sm font-medium text-zinc-300"
          >
            Agent ID <span className="text-red-400">*</span>
          </label>
          <input
            id="suite-agent"
            type="text"
            value={data.agent_id}
            onChange={(e) => onChange({ agent_id: e.target.value })}
            placeholder="e.g., support-agent or agent-uuid"
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="suite-description"
            className="block text-sm font-medium text-zinc-300"
          >
            Description
          </label>
          <textarea
            id="suite-description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            placeholder="Describe the purpose and scope of this test suite..."
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  )
}
