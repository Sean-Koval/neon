'use client'

import {
  Activity,
  Brain,
  Check,
  Copy,
  Cpu,
  FlaskConical,
  Plus,
  Rocket,
  TrendingUp,
  Wand2,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Worker {
  id: string
  name: string
  description: string
  status: 'active' | 'on-demand' | 'scheduled' | 'draft'
  icon: typeof Cpu
  metrics: { label: string; value: string }[]
  link: { href: string; label: string }
}

const baseWorkers: Worker[] = [
  {
    id: 'optimization',
    name: 'Optimization Worker',
    description: 'Runs training loops to generate prompt improvements based on eval scores and trace analysis.',
    status: 'active',
    icon: TrendingUp,
    metrics: [
      { label: 'Loops Run', value: '142' },
      { label: 'Improvements', value: '38' },
      { label: 'Last Run', value: '12m ago' },
    ],
    link: { href: '/optimization', label: 'View Optimization' },
  },
  {
    id: 'monitoring',
    name: 'Monitoring Worker',
    description: 'Watches for score regressions, error rate spikes, and latency anomalies across all agents.',
    status: 'active',
    icon: Activity,
    metrics: [
      { label: 'Alerts Sent', value: '23' },
      { label: 'Regressions', value: '5' },
      { label: 'Last Check', value: '2m ago' },
    ],
    link: { href: '/alerts', label: 'View Alerts' },
  },
  {
    id: 'rca',
    name: 'RCA Worker',
    description: 'Performs root cause analysis on failing traces and score regressions using LLM-based synthesis.',
    status: 'on-demand',
    icon: Brain,
    metrics: [
      { label: 'Analyses', value: '67' },
      { label: 'Root Causes', value: '45' },
      { label: 'Last Analysis', value: '1h ago' },
    ],
    link: { href: '/traces', label: 'View Traces' },
  },
  {
    id: 'test-gen',
    name: 'Test Generation Worker',
    description: 'Auto-generates test cases from production traces to expand eval suite coverage.',
    status: 'scheduled',
    icon: FlaskConical,
    metrics: [
      { label: 'Tests Generated', value: '312' },
      { label: 'Coverage', value: '78%' },
      { label: 'Next Run', value: '2h' },
    ],
    link: { href: '/eval-runs', label: 'View Evals' },
  },
]

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  'on-demand': { label: 'On-Demand', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  scheduled: { label: 'Scheduled', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  draft: { label: 'Draft', color: 'text-amber-600 dark:text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30' },
}

const templateOptions = [
  {
    id: 'monitor',
    label: 'Monitoring Agent',
    description: 'Watch traces/scores and trigger alerts or rollbacks.',
  },
  {
    id: 'optimizer',
    label: 'Optimization Agent',
    description: 'Analyze failures and create candidate prompt/system updates.',
  },
  {
    id: 'triage',
    label: 'Triage Agent',
    description: 'Route failing traces into RCA, labeling, and remediation.',
  },
  {
    id: 'custom',
    label: 'Custom Worker',
    description: 'Start from a minimal Temporal workflow shell.',
  },
] as const

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>(baseWorkers)
  const [workerName, setWorkerName] = useState('')
  const [taskQueue, setTaskQueue] = useState('neon-agents')
  const [template, setTemplate] = useState<(typeof templateOptions)[number]['id']>('monitor')
  const [schedule, setSchedule] = useState('*/15 * * * *')
  const [copied, setCopied] = useState(false)

  const generatedWorkflowId = useMemo(() => {
    const slug = workerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return slug ? `agent-${slug}` : 'agent-my-worker'
  }, [workerName])

  const generatedConfig = useMemo(
    () =>
      JSON.stringify(
        {
          workflowId: generatedWorkflowId,
          template,
          taskQueue,
          schedule,
          source: 'neon-worker',
          enabled: true,
        },
        null,
        2,
      ),
    [generatedWorkflowId, schedule, taskQueue, template],
  )

  function createWorkerDraft() {
    const name = workerName.trim()
    if (!name) return

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const selectedTemplate = templateOptions.find((t) => t.id === template)
    const now = new Date().toLocaleTimeString()

    const draft: Worker = {
      id,
      name,
      description:
        selectedTemplate?.description ||
        'Temporal worker for Neon automation workflows.',
      status: 'draft',
      icon: Wand2,
      metrics: [
        { label: 'Template', value: selectedTemplate?.label || 'Custom Worker' },
        { label: 'Task Queue', value: taskQueue },
        { label: 'Created', value: now },
      ],
      link: { href: '/workflows', label: 'Open Workflows' },
    }

    setWorkers((prev) => [draft, ...prev])
    setWorkerName('')
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(generatedConfig)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />

      {/* Page Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 dark:from-surface-card dark:via-surface-card dark:to-surface-raised p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Cpu className="w-7 h-7 text-primary-500 dark:text-primary-400" />
              <h1 className="text-2xl font-bold text-content-primary">Platform Workers</h1>
            </div>
            <p className="text-content-secondary max-w-3xl">
              Create and operate Temporal agents that automate monitoring, optimization, and remediation across Neon data.
              Worker traces are visible in Traces with{' '}
              <code className="text-primary-500 dark:text-primary-400 text-xs bg-surface-card px-1.5 py-0.5 rounded">source: neon-worker</code>.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-border bg-surface-card px-3 py-1 text-xs font-medium text-content-secondary">
            {workers.length} workers
          </span>
        </div>
      </div>

      {/* Create Worker */}
      <div className="rounded-xl border border-border bg-surface-card/95 dark:bg-slate-900/80 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="w-4 h-4 text-primary-500 dark:text-primary-300" />
          <h2 className="text-sm font-semibold text-content-primary">Create Temporal Agent Worker</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1.5">Worker Name</label>
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="e.g. Prompt Regression Guard"
                className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-muted mb-1.5">Template</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as typeof template)}
                className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
              >
                {templateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1.5">Task Queue</label>
                <input
                  type="text"
                  value={taskQueue}
                  onChange={(e) => setTaskQueue(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-muted mb-1.5">Schedule (cron)</label>
                <input
                  type="text"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-surface-card border border-border rounded-md text-content-primary focus:outline-none focus:border-primary-500/50"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={createWorkerDraft}
              disabled={!workerName.trim()}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Create Worker Draft
            </button>
          </div>

          <div className="rounded-lg border border-border dark:border-slate-700/80 bg-surface-card/70 dark:bg-slate-900/72 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-content-muted uppercase tracking-wide">Generated Worker Config</p>
              <button
                type="button"
                onClick={copyConfig}
                className="inline-flex items-center gap-1 text-xs text-primary-500 dark:text-primary-300 hover:text-primary-400"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs text-content-secondary overflow-auto max-h-[220px] whitespace-pre-wrap break-words">
              {generatedConfig}
            </pre>
            <p className="text-[11px] text-content-muted mt-2">
              Next step: wire this config into your Temporal worker process and register the workflow/activity handlers.
            </p>
          </div>
        </div>
      </div>

      {/* Workers List */}
      <div className="space-y-4">
        {workers.map((worker) => {
          const status = statusConfig[worker.status]
          const Icon = worker.icon

          return (
            <div
              key={worker.id}
              className="bg-surface-card border border-border rounded-xl p-6 hover:border-primary-500/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary-500 dark:text-primary-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-content-primary font-semibold">{worker.name}</h3>
                      <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded border ${status.bg} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-content-secondary text-sm mb-4">{worker.description}</p>

                    {/* Metrics */}
                    <div className="flex items-center gap-6">
                      {worker.metrics.map((metric) => (
                        <div key={metric.label}>
                          <p className="text-[10px] text-content-muted uppercase tracking-wider">{metric.label}</p>
                          <p className="text-content-primary font-medium text-sm">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Link */}
                <Link
                  href={worker.link.href}
                  className="text-sm text-primary-500 dark:text-primary-400 hover:text-primary-400 dark:hover:text-primary-300 transition-colors whitespace-nowrap"
                >
                  {worker.link.label}
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
