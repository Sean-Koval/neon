'use client'

import { clsx } from 'clsx'
import { Eye, MoreVertical, Pause, Play, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import {
  useAbortExperiment,
  usePauseExperiment,
  useResumeExperiment,
} from '@/hooks/use-experiments'
import type { ExperimentStatus } from '@/hooks/use-experiments'

interface ExperimentCardMenuProps {
  experimentId: string
  status: ExperimentStatus
}

/**
 * Three-dot overflow menu for experiment cards.
 * Shows context-aware actions based on experiment status.
 */
export function ExperimentCardMenu({
  experimentId,
  status,
}: ExperimentCardMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { addToast } = useToast()

  const pauseMutation = usePauseExperiment()
  const resumeMutation = useResumeExperiment()
  const abortMutation = useAbortExperiment()

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setConfirmAbort(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePause = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await pauseMutation.mutateAsync(experimentId)
      addToast('Experiment paused', 'success')
    } catch {
      addToast('Failed to pause experiment', 'error')
    }
    setIsOpen(false)
  }

  const handleResume = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await resumeMutation.mutateAsync(experimentId)
      addToast('Experiment resumed', 'success')
    } catch {
      addToast('Failed to resume experiment', 'error')
    }
    setIsOpen(false)
  }

  const handleAbort = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirmAbort) {
      setConfirmAbort(true)
      return
    }
    try {
      await abortMutation.mutateAsync(experimentId)
      addToast('Experiment aborted', 'success')
    } catch {
      addToast('Failed to abort experiment', 'error')
    }
    setIsOpen(false)
    setConfirmAbort(false)
  }

  const handleViewDetails = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/experiments/${experimentId}`)
    setIsOpen(false)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
          setConfirmAbort(false)
        }}
        className="p-1.5 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-raised transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {/* View Details - always */}
          <button
            type="button"
            onClick={handleViewDetails}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:bg-surface-raised transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Details
          </button>

          {/* Pause - when running */}
          {status === 'RUNNING' && (
            <button
              type="button"
              onClick={handlePause}
              disabled={pauseMutation.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
            >
              <Pause className="w-4 h-4" />
              {pauseMutation.isPending ? 'Pausing...' : 'Pause'}
            </button>
          )}

          {/* Resume - when paused */}
          {status === 'PAUSED' && (
            <button
              type="button"
              onClick={handleResume}
              disabled={resumeMutation.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
            </button>
          )}

          {/* Abort - when running or paused */}
          {(status === 'RUNNING' || status === 'PAUSED') && (
            <button
              type="button"
              onClick={handleAbort}
              disabled={abortMutation.isPending}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors disabled:opacity-50',
                confirmAbort
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-surface-raised',
              )}
            >
              <X className="w-4 h-4" />
              {abortMutation.isPending
                ? 'Aborting...'
                : confirmAbort
                  ? 'Confirm Abort'
                  : 'Abort'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
