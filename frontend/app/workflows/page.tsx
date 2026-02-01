'use client'

/**
 * Workflows Page
 *
 * Shows Temporal workflow status and management.
 */

import {
  CheckCircle,
  ChevronRight,
  Clock,
  Filter,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useWorkflows, type WorkflowStatus } from '@/hooks/use-workflows'
import { cn } from '@/lib/utils'

/**
 * Get status info
 */
function getStatusInfo(status: WorkflowStatus) {
  switch (status) {
    case 'RUNNING':
      return { Icon: Play, color: 'text-blue-500', bg: 'bg-blue-50' }
    case 'COMPLETED':
      return { Icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' }
    case 'FAILED':
      return { Icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' }
    case 'CANCELLED':
    case 'TERMINATED':
      return { Icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' }
    case 'TIMED_OUT':
      return { Icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50' }
    default:
      return { Icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50' }
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const time = new Date(timestamp).getTime()
  const diff = now - time

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function WorkflowsPage() {
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | undefined>()
  const {
    data: workflows,
    isLoading,
    refetch,
  } = useWorkflows({ status: statusFilter })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-gray-500">Manage Temporal workflow executions</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={statusFilter || ''}
          onChange={(e) =>
            setStatusFilter((e.target.value as WorkflowStatus) || undefined)
          }
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Filter className="w-4 h-4" />
          More Filters
        </button>
      </div>

      {/* Workflows list */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center bg-gray-50 px-4 py-3 border-b text-sm font-medium text-gray-500">
          <div className="flex-1">Workflow</div>
          <div className="w-32 text-center">Type</div>
          <div className="w-24 text-center">Status</div>
          <div className="w-32 text-right">Started</div>
          <div className="w-8" />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading workflows...
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!workflows || workflows.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Clock className="w-8 h-8 mb-2" />
            <p>No workflows found</p>
            <p className="text-sm">Workflows will appear here when started</p>
          </div>
        )}

        {/* Workflow rows */}
        {workflows?.map((workflow) => {
          const statusInfo = getStatusInfo(workflow.status)

          return (
            <Link
              key={workflow.workflowId}
              href={`/workflows/${workflow.workflowId}`}
              className="flex items-center px-4 py-3 border-b hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {workflow.workflowId}
                </div>
                <div className="text-sm text-gray-500 font-mono truncate">
                  {workflow.runId}
                </div>
              </div>

              <div className="w-32 text-center">
                <span className="text-sm text-gray-600">{workflow.type}</span>
              </div>

              <div className="w-24 flex justify-center">
                <span
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-sm',
                    statusInfo.bg,
                    statusInfo.color,
                  )}
                >
                  <statusInfo.Icon className="w-3 h-3" />
                  {workflow.status}
                </span>
              </div>

              <div className="w-32 text-right text-sm text-gray-500">
                {formatRelativeTime(workflow.startTime)}
              </div>

              <div className="w-8 flex justify-center">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
