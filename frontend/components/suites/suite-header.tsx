'use client'

import { clsx } from 'clsx'
import {
  ChevronRight,
  Edit,
  Loader2,
  MoreVertical,
  Play,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTriggerRun } from '@/hooks/use-runs'
import { useDeleteSuite } from '@/hooks/use-suites'
import type { EvalSuite } from '@/lib/types'

interface SuiteHeaderProps {
  suite: EvalSuite
}

export function SuiteHeader({ suite }: SuiteHeaderProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const deleteMutation = useDeleteSuite({
    onSuccess: () => {
      router.push('/suites')
    },
  })

  const triggerRunMutation = useTriggerRun({
    onSuccess: (run) => {
      router.push(`/runs/${run.id}`)
    },
  })

  const handleDelete = () => {
    deleteMutation.mutate(suite.id)
    setShowDeleteConfirm(false)
  }

  const handleTriggerRun = () => {
    triggerRunMutation.mutate({ suiteId: suite.id })
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm text-gray-500">
        <Link
          href="/suites"
          className="hover:text-primary-600 transition-colors"
        >
          Suites
        </Link>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]">
          {suite.name}
        </span>
      </nav>

      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {suite.name}
          </h1>
          {suite.description && (
            <p className="mt-2 text-gray-600 max-w-2xl">{suite.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleTriggerRun}
            disabled={triggerRunMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {triggerRunMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>Run</span>
          </button>

          <Link
            href={`/suites/${suite.id}/edit`}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </Link>

          {/* More Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="btn btn-ghost p-2"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMenu && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setShowMenu(false)}
                  aria-label="Close menu"
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      setShowDeleteConfirm(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Suite
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 cursor-default"
            onClick={() => setShowDeleteConfirm(false)}
            aria-label="Close dialog"
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Delete Suite
            </h3>
            <p className="mt-2 text-gray-600">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-900">{suite.name}</span>?
              This action cannot be undone and will delete all associated test
              cases.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className={clsx(
                  'btn flex items-center gap-2',
                  'bg-rose-600 text-white hover:bg-rose-700',
                )}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SuiteHeaderSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-200 rounded" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-20 bg-gray-200 rounded-lg" />
          <div className="h-10 w-20 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
