'use client'

import {
  Activity,
  Brain,
  CheckCircle,
  Clock,
  Cpu,
  FlaskConical,
  Search,
  TrendingUp,
  Zap,
} from 'lucide-react'
import Link from 'next/link'

interface Worker {
  id: string
  name: string
  description: string
  status: 'active' | 'on-demand' | 'scheduled'
  icon: typeof Cpu
  metrics: { label: string; value: string }[]
  link: { href: string; label: string }
}

const workers: Worker[] = [
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
  active: { label: 'Active', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  'on-demand': { label: 'On-Demand', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  scheduled: { label: 'Scheduled', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
}

export default function WorkersPage() {
  return (
    <div className="p-8 space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Cpu className="w-7 h-7 text-primary-400" />
          <h1 className="text-2xl font-bold text-white">Platform Workers</h1>
        </div>
        <p className="text-dark-400">
          Neon system agents that handle optimization, monitoring, analysis, and test generation.
          Worker traces are visible in the trace explorer with <code className="text-primary-400 text-xs bg-dark-800 px-1.5 py-0.5 rounded">source: neon-worker</code> filter.
        </p>
      </div>

      {/* Workers List */}
      <div className="space-y-4">
        {workers.map((worker) => {
          const status = statusConfig[worker.status]
          const Icon = worker.icon

          return (
            <div
              key={worker.id}
              className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-6 hover:border-primary-500/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-white font-semibold">{worker.name}</h3>
                      <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded border ${status.bg} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-dark-400 text-sm mb-4">{worker.description}</p>

                    {/* Metrics */}
                    <div className="flex items-center gap-6">
                      {worker.metrics.map((metric) => (
                        <div key={metric.label}>
                          <p className="text-[10px] text-dark-500 uppercase tracking-wider">{metric.label}</p>
                          <p className="text-white font-medium text-sm">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Link */}
                <Link
                  href={worker.link.href}
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors whitespace-nowrap"
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
