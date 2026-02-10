'use client'

import { AlertTriangle } from 'lucide-react'

interface DeletePromptDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  promptName: string
  versionCount: number
  isProduction?: boolean
  isDeleting: boolean
}

export function DeletePromptDialog({
  open,
  onClose,
  onConfirm,
  promptName,
  versionCount,
  isProduction = false,
  isDeleting,
}: DeletePromptDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-card border border-border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-content-primary">
          Are you sure you want to delete &ldquo;{promptName}&rdquo;?
        </p>
        <p className="text-sm text-content-muted mt-2">
          This will delete all {versionCount} version{versionCount !== 1 ? 's' : ''} of this prompt.
          {isProduction && (
            <>
              <br />
              It is currently marked as production and will be removed immediately.
            </>
          )}
          <br />
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn text-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}
