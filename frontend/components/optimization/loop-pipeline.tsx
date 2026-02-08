'use client'

import {
  ArrowRight,
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
} from 'lucide-react'

interface PipelineStage {
  name: string
  status: 'completed' | 'running' | 'pending' | 'failed'
  metric?: string
  duration?: string
}

interface LoopPipelineProps {
  stages: PipelineStage[]
}

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500/20',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    ring: 'ring-blue-500/30',
  },
  pending: {
    icon: Circle,
    color: 'text-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    ring: 'ring-gray-500/10',
  },
  failed: {
    icon: XCircle,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    ring: 'ring-rose-500/20',
  },
}

function StageNode({ stage }: { stage: PipelineStage }) {
  const config = STATUS_CONFIG[stage.status]
  const Icon = config.icon
  const isAnimated = stage.status === 'running'

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div
        className={`w-10 h-10 rounded-xl border ${config.border} ${config.bg} flex items-center justify-center ring-2 ${config.ring} transition-all`}
      >
        <Icon
          className={`w-5 h-5 ${config.color} ${isAnimated ? 'animate-spin' : ''}`}
        />
      </div>
      <span className="text-xs font-medium text-gray-700">{stage.name}</span>
      {stage.metric && (
        <span className="text-[10px] text-gray-500 text-center leading-tight">
          {stage.metric}
        </span>
      )}
      {stage.duration && (
        <span className="text-[10px] text-gray-400">{stage.duration}</span>
      )}
    </div>
  )
}

function ConnectorArrow({ completed }: { completed: boolean }) {
  return (
    <div className="flex items-center px-1 -mt-4">
      <ArrowRight
        className={`w-4 h-4 ${completed ? 'text-emerald-400' : 'text-gray-300'}`}
      />
    </div>
  )
}

export function LoopPipeline({ stages }: LoopPipelineProps) {
  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <h2 className="text-lg font-semibold text-gray-900">
          Optimization Pipeline
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Current loop stage progression
        </p>
      </div>
      <div className="p-6">
        <div className="flex items-start justify-center gap-1 overflow-x-auto">
          {stages.map((stage, i) => (
            <div key={stage.name} className="flex items-start">
              <StageNode stage={stage} />
              {i < stages.length - 1 && (
                <ConnectorArrow completed={stage.status === 'completed'} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
