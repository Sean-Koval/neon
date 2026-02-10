'use client'

/**
 * Approval Dialog Component
 *
 * Modal for human-in-the-loop approval of agent actions.
 */

import {
  AlertTriangle,
  Check,
  MessageSquare,
  Shield,
  Wrench,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Approval request data
 */
interface ApprovalRequest {
  workflowId: string
  toolName: string
  toolInput: Record<string, unknown>
  reason?: string
  riskLevel?: 'low' | 'medium' | 'high'
}

interface ApprovalDialogProps {
  request: ApprovalRequest
  isOpen: boolean
  onApprove: (reason?: string) => void
  onReject: (reason: string) => void
  onClose: () => void
}

/**
 * Get risk level info
 */
function getRiskInfo(level: ApprovalRequest['riskLevel']) {
  switch (level) {
    case 'high':
      return {
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        borderColor: 'border-red-200 dark:border-red-500/25',
        label: 'High Risk',
      }
    case 'medium':
      return {
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-amber-500/10',
        borderColor: 'border-yellow-200 dark:border-amber-500/25',
        label: 'Medium Risk',
      }
    default:
      return {
        color: 'text-blue-500',
        bgColor: 'bg-blue-50 dark:bg-blue-500/10',
        borderColor: 'border-blue-200 dark:border-blue-500/25',
        label: 'Low Risk',
      }
  }
}

/**
 * Approval Dialog Component
 */
export function ApprovalDialog({
  request,
  isOpen,
  onApprove,
  onReject,
  onClose,
}: ApprovalDialogProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  const riskInfo = getRiskInfo(request.riskLevel)

  if (!isOpen) return null

  const handleApprove = () => {
    onApprove()
    onClose()
  }

  const handleReject = () => {
    if (!showRejectForm) {
      setShowRejectForm(true)
      return
    }
    onReject(rejectReason || 'Rejected by user')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-6 py-4 border-b',
            riskInfo.bgColor,
            riskInfo.borderColor,
          )}
        >
          <div className="flex items-center gap-3">
            <Shield className={cn('w-6 h-6', riskInfo.color)} />
            <div>
              <h2 className="font-semibold text-lg">Approval Required</h2>
              <p className={cn('text-sm', riskInfo.color)}>{riskInfo.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/50 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Tool info */}
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="font-medium">{request.toolName}</span>
          </div>

          {/* Description */}
          {request.reason && (
            <div className="flex items-start gap-2 mb-4 p-3 bg-gray-50 dark:bg-dark-900 rounded-lg">
              <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
              <p className="text-sm text-gray-600 dark:text-gray-300">{request.reason}</p>
            </div>
          )}

          {/* Tool input preview */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Tool Input
            </h4>
            <pre className="bg-gray-50 dark:bg-dark-900 rounded-lg p-3 text-sm overflow-x-auto max-h-[200px] overflow-y-auto">
              <code>{JSON.stringify(request.toolInput, null, 2)}</code>
            </pre>
          </div>

          {/* Warning for high risk */}
          {request.riskLevel === 'high' && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-400">
                <p className="font-medium">
                  This action may have significant impact.
                </p>
                <p>Please review carefully before approving.</p>
              </div>
            </div>
          )}

          {/* Reject reason form */}
          {showRejectForm && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rejection Reason
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border dark:border-dark-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-dark-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="Explain why this action should not be taken..."
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-dark-900 border-t dark:border-dark-700">
          <button
            onClick={handleReject}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-800 border dark:border-dark-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 font-medium"
          >
            {showRejectForm ? 'Confirm Reject' : 'Reject'}
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600 font-medium flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApprovalDialog
