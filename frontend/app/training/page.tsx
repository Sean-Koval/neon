'use client'

import { clsx } from 'clsx'
import {
  ArrowRight,
  Database,
  Download,
  GraduationCap,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Zap,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { ApprovalBanner } from '@/components/training/approval-banner'
import { ConfigureLoopDialog } from '@/components/training/configure-loop-dialog'
import { CreateDatasetWizard } from '@/components/training/create-dataset-wizard'
import { DatasetCards } from '@/components/training/dataset-cards'
import { DatasetDetailPanel } from '@/components/training/dataset-detail-panel'
import { ExportFlow } from '@/components/training/export-flow'
import { FeedbackCorrections } from '@/components/training/feedback-corrections'
import { FeedbackHistory } from '@/components/training/feedback-history'
import { FeedbackPreferences } from '@/components/training/feedback-preferences'
import { IterationHistory } from '@/components/training/iteration-history'
import { PipelineVisualization } from '@/components/training/pipeline-visualization'
import { StageDetailAccordion } from '@/components/training/stage-detail-accordion'
import { trpc } from '@/lib/trpc'

// =============================================================================
// Types
// =============================================================================

type MainTab = 'feedback' | 'datasets' | 'export' | 'auto-improve'
type FeedbackMode = 'preferences' | 'corrections' | 'history'

const MAIN_TABS: { id: MainTab; label: string; icon: typeof MessageSquare }[] =
  [
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
    { id: 'datasets', label: 'Datasets', icon: Database },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'auto-improve', label: 'Auto-Improve', icon: Zap },
  ]

const FEEDBACK_MODES: { id: FeedbackMode; label: string }[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'corrections', label: 'Corrections' },
  { id: 'history', label: 'History' },
]

// =============================================================================
// Page
// =============================================================================

function TrainingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL-synced state
  const activeTab = (searchParams.get('tab') as MainTab) || 'feedback'
  const feedbackMode =
    (searchParams.get('mode') as FeedbackMode) || 'preferences'
  const agentFilter = searchParams.get('agent') || ''
  const preselectedDataset = searchParams.get('dataset') || ''

  // Local state
  const [detailDatasetId, setDetailDatasetId] = useState<string | null>(null)
  const [showCreateDataset, setShowCreateDataset] = useState(false)
  const [showConfigureLoop, setShowConfigureLoop] = useState(false)
  const [activeStageDetail, setActiveStageDetail] = useState<string | null>(
    null,
  )
  const [abortConfirm, setAbortConfirm] = useState<string | null>(null)

  // Data queries
  const { data: feedbackStats } = trpc.feedback.stats.useQuery()
  const { data: datasetsData } = trpc.datasets.list.useQuery({
    agentId: agentFilter || undefined,
  })
  const { data: loopsData, refetch: refetchLoops } =
    trpc.trainingLoops.list.useQuery({ agentId: agentFilter || undefined })
  const { data: pendingApprovals } =
    trpc.trainingLoops.pendingApprovals.useQuery(undefined, {
      refetchInterval: 30000,
    })
  const { data: agentsData } = trpc.agents.list.useQuery()
  const { data: iterationData } = trpc.trainingLoops.iterationHistory.useQuery({
    agentId: agentFilter || undefined,
    limit: 5,
  })

  const signalMutation = trpc.trainingLoops.signal.useMutation({
    onSuccess: () => refetchLoops(),
  })

  const agents = agentsData ?? []
  const loops = loopsData?.loops ?? []
  const pendingCount = pendingApprovals?.count ?? 0
  const datasets = datasetsData?.datasets ?? []

  // Compute best improvement from iteration history
  const bestImprovement = useMemo(() => {
    const iterations = iterationData?.iterations ?? []
    if (!iterations.length) return null
    const best = iterations.reduce(
      (acc, iter) =>
        iter.scoreDelta > (acc?.scoreDelta ?? -Infinity) ? iter : acc,
      iterations[0],
    )
    return best && best.scoreDelta > 0 ? best : null
  }, [iterationData])

  // URL helpers
  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.replace(`/training?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const setTab = useCallback(
    (tab: MainTab) => {
      const params = new URLSearchParams()
      params.set('tab', tab)
      if (agentFilter) params.set('agent', agentFilter)
      router.replace(`/training?${params.toString()}`, { scroll: false })
    },
    [router, agentFilter],
  )

  const setMode = useCallback(
    (mode: FeedbackMode) => {
      setParam('mode', mode)
    },
    [setParam],
  )

  const handleExportDataset = useCallback(
    (datasetId: string) => {
      const params = new URLSearchParams()
      params.set('tab', 'export')
      params.set('dataset', datasetId)
      if (agentFilter) params.set('agent', agentFilter)
      router.replace(`/training?${params.toString()}`, { scroll: false })
    },
    [router, agentFilter],
  )

  const handleGoToDatasets = useCallback(() => setTab('datasets'), [setTab])

  const recommendedStep = useMemo(() => {
    if ((feedbackStats?.totalFeedback ?? 0) === 0) return 'Collect feedback'
    if (datasets.length === 0) return 'Create dataset'
    if (loops.length === 0) return 'Start optimization loop'
    if (pendingCount > 0) return 'Review pending approval'
    return 'Monitor live performance'
  }, [
    feedbackStats?.totalFeedback,
    datasets.length,
    loops.length,
    pendingCount,
  ])

  return (
    <div className="relative p-6 space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
      {/* Header */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-3">
              <GraduationCap className="h-7 w-7 text-primary-500 dark:text-primary-400" />
              <h1 className="text-2xl font-bold text-content-primary">
                Training
              </h1>
            </div>
            <p className="text-sm text-content-secondary">
              Collect feedback, curate datasets, and improve your agents
            </p>
          </div>
          <select
            value={agentFilter}
            onChange={(e) => setParam('agent', e.target.value)}
            className="h-9 rounded-md border border-border bg-surface-card px-3 text-sm text-content-primary focus:border-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Agents</option>
            {agents.map((a: { id: string; name: string }) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Feedback Collected</p>
          <p className="text-2xl font-bold text-content-primary">
            {feedbackStats?.totalFeedback ?? 0}
          </p>
          <p className="text-xs text-content-muted">
            {feedbackStats?.totalComparisons ?? 0} comparisons
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Curated Datasets</p>
          <p className="text-2xl font-bold text-content-primary">
            {datasets.length}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Active Loops</p>
          <p
            className={clsx(
              'text-2xl font-bold',
              loops.filter((l) => l.status === 'running').length > 0
                ? 'text-emerald-500'
                : 'text-content-muted',
            )}
          >
            {
              loops.filter(
                (l) =>
                  l.status === 'running' || l.status === 'awaiting_approval',
              ).length
            }
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-content-muted mb-1">Best Improvement</p>
          {bestImprovement ? (
            <>
              <p className="text-2xl font-bold text-emerald-500">
                +{bestImprovement.scoreDelta.toFixed(1)}%
              </p>
              <p className="text-xs text-content-muted">
                {bestImprovement.agentName}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-content-muted">&mdash;</p>
          )}
        </div>
      </div>

      {/* Workflow Guide */}
      <div className="rounded-xl border border-border bg-surface-card/95 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-content-primary">
            How To Optimize Your Agent
          </h2>
          <span className="rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
            Recommended: {recommendedStep}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => setTab('feedback')}
            className="group rounded-lg border border-border bg-surface-card p-3 text-left transition-colors hover:border-primary-500/35 hover:bg-surface-raised/70"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Step 1
            </p>
            <p className="mt-1 text-sm font-medium text-content-primary">
              Collect Feedback
            </p>
            <p className="mt-1 text-xs text-content-muted">
              Capture preferences and corrections from real interactions.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab('datasets')}
            className="group rounded-lg border border-border bg-surface-card p-3 text-left transition-colors hover:border-primary-500/35 hover:bg-surface-raised/70"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Step 2
            </p>
            <p className="mt-1 text-sm font-medium text-content-primary">
              Build Datasets
            </p>
            <p className="mt-1 text-xs text-content-muted">
              Curate strong examples and quality-check before training.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab('export')}
            className="group rounded-lg border border-border bg-surface-card p-3 text-left transition-colors hover:border-primary-500/35 hover:bg-surface-raised/70"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Step 3
            </p>
            <p className="mt-1 text-sm font-medium text-content-primary">
              Export & Evaluate
            </p>
            <p className="mt-1 text-xs text-content-muted">
              Export to your trainer/eval stack and validate candidate quality.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab('auto-improve')}
            className="group rounded-lg border border-border bg-surface-card p-3 text-left transition-colors hover:border-primary-500/35 hover:bg-surface-raised/70"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Step 4
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <p className="text-sm font-medium text-content-primary">
                Run Loop
              </p>
              <ArrowRight className="h-3.5 w-3.5 text-content-muted transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-content-muted">
              Launch loops, review approvals, and deploy improvements safely.
            </p>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border bg-surface-card/90 px-2 pt-2 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/75">
        <div className="flex gap-1">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={clsx(
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2',
                  isActive
                    ? 'text-content-primary font-semibold border-primary-500'
                    : 'text-content-muted border-transparent hover:text-content-secondary',
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'auto-improve' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/20 text-amber-500">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Feedback Tab ──────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* Feedback stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-xs text-content-muted mb-1">Total Feedback</p>
              <p className="text-2xl font-bold text-content-primary">
                {feedbackStats?.totalFeedback ?? 0}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-content-muted mb-1">Preferences</p>
              <p className="text-2xl font-bold text-content-primary">
                {feedbackStats?.preferenceCount ?? 0}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-content-muted mb-1">Corrections</p>
              <p className="text-2xl font-bold text-content-primary">
                {feedbackStats?.correctionCount ?? 0}
              </p>
            </div>
          </div>

          {/* Segmented control */}
          <div className="bg-surface-overlay/30 rounded-lg p-1 inline-flex gap-1">
            {FEEDBACK_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setMode(mode.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-sm transition-all',
                  feedbackMode === mode.id
                    ? 'bg-surface-card shadow-sm text-content-primary font-medium'
                    : 'text-content-muted hover:text-content-secondary cursor-pointer',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Mode content */}
          {feedbackMode === 'preferences' && (
            <FeedbackPreferences agentId={agentFilter || undefined} />
          )}
          {feedbackMode === 'corrections' && (
            <FeedbackCorrections agentId={agentFilter || undefined} />
          )}
          {feedbackMode === 'history' && <FeedbackHistory />}
        </div>
      )}

      {/* ─── Datasets Tab ──────────────────────────────────────────────── */}
      {activeTab === 'datasets' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreateDataset(true)}
              className="btn btn-primary h-9 text-sm"
            >
              <Plus className="w-4 h-4" /> Create Dataset
            </button>
          </div>

          <DatasetCards
            agentId={agentFilter || undefined}
            onSelectDataset={(id) => setDetailDatasetId(id)}
            onExportDataset={handleExportDataset}
          />

          {/* Detail panel */}
          {detailDatasetId && (
            <DatasetDetailPanel
              datasetId={detailDatasetId}
              onClose={() => setDetailDatasetId(null)}
              onExport={handleExportDataset}
            />
          )}

          {/* Create wizard */}
          {showCreateDataset && (
            <CreateDatasetWizard
              onClose={() => setShowCreateDataset(false)}
              defaultAgentId={agentFilter || undefined}
            />
          )}
        </div>
      )}

      {/* ─── Export Tab ────────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <ExportFlow
          preselectedDataset={preselectedDataset || undefined}
          onGoToDatasets={handleGoToDatasets}
        />
      )}

      {/* ─── Auto-Improve Tab ─────────────────────────────────────────── */}
      {activeTab === 'auto-improve' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface-card/90 p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/70">
            <h3 className="text-sm font-semibold text-content-primary">
              Auto-Improve Workflow
            </h3>
            <p className="mt-1 text-sm text-content-secondary">
              Start a loop, follow stage progress in the pipeline, click stages
              to inspect metrics, then approve or reject deployments.
            </p>
          </div>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-content-primary">
              Active Loops
            </h2>
            <button
              type="button"
              onClick={() => setShowConfigureLoop(true)}
              className="btn btn-primary h-9 text-sm"
            >
              <Plus className="w-4 h-4" /> New Loop
            </button>
          </div>

          {/* Active loops */}
          {loops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Zap className="w-12 h-12 text-content-muted mb-4" />
              <h3 className="text-lg font-medium text-content-primary">
                No optimization loops yet
              </h3>
              <p className="text-sm text-content-muted mt-2 max-w-sm">
                Set up an autonomous optimization loop to automatically collect
                feedback, optimize prompts, and deploy improvements.
              </p>
              <button
                type="button"
                onClick={() => setShowConfigureLoop(true)}
                className="btn btn-primary mt-4"
              >
                <Plus className="w-4 h-4" /> New Loop
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {loops.map((loop) => {
                const isRunning = loop.status === 'running'
                const isPaused = loop.status === 'paused'
                const hasApproval =
                  loop.status === 'awaiting_approval' && loop.approvalData

                return (
                  <div key={loop.id} className="card p-5 space-y-4">
                    {/* Loop header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-content-primary">
                          {loop.agentName} optimization
                        </h3>
                        <p className="text-xs text-content-muted mt-0.5">
                          Strategy: {loop.strategy.replace('_', ' ')} · Trigger:{' '}
                          {loop.trigger}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5',
                            loop.status === 'running' &&
                              'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
                            loop.status === 'paused' &&
                              'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
                            loop.status === 'awaiting_approval' &&
                              'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
                            loop.status === 'completed' &&
                              'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
                            loop.status === 'failed' &&
                              'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400',
                            loop.status === 'aborted' &&
                              'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400',
                          )}
                        >
                          {(loop.status === 'running' ||
                            loop.status === 'awaiting_approval') && (
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          )}
                          {loop.status === 'awaiting_approval'
                            ? 'Awaiting Approval'
                            : loop.status.charAt(0).toUpperCase() +
                              loop.status.slice(1)}
                        </span>
                        <span className="text-xs text-content-muted">
                          Iter {loop.currentIteration}/{loop.maxIterations}
                        </span>
                      </div>
                    </div>

                    {/* Pipeline */}
                    <PipelineVisualization
                      stages={loop.stages}
                      activeStage={activeStageDetail}
                      onStageClick={(stage) =>
                        setActiveStageDetail(
                          activeStageDetail === stage ? null : stage,
                        )
                      }
                    />

                    {/* Approval banner */}
                    {hasApproval && loop.approvalData && (
                      <ApprovalBanner
                        loopId={loop.id}
                        agentName={loop.agentName}
                        scoreBefore={loop.approvalData.scoreBefore}
                        scoreAfter={loop.approvalData.scoreAfter}
                        improvementDelta={loop.approvalData.improvementDelta}
                        threshold={loop.approvalData.threshold}
                        changes={loop.approvalData.changes}
                        stageRequiringApproval={
                          loop.approvalData.stageRequiringApproval
                        }
                        onResolved={() => refetchLoops()}
                      />
                    )}

                    {/* Stage detail accordion */}
                    {activeStageDetail &&
                      (() => {
                        const stage = loop.stages.find(
                          (s) => s.stage === activeStageDetail,
                        )
                        if (!stage || stage.status === 'pending') return null
                        return <StageDetailAccordion stage={stage} />
                      })()}

                    {/* Score info */}
                    {loop.currentScore > 0 && (
                      <div className="text-sm text-content-secondary">
                        Score: {loop.baselineScore.toFixed(2)} &rarr;{' '}
                        <span
                          className={
                            loop.currentScore >= loop.baselineScore
                              ? 'text-emerald-500 font-medium'
                              : 'text-rose-500 font-medium'
                          }
                        >
                          {loop.currentScore.toFixed(2)}
                        </span>{' '}
                        ({loop.currentScore >= loop.baselineScore ? '+' : ''}
                        {(
                          (loop.currentScore - loop.baselineScore) *
                          100
                        ).toFixed(1)}
                        %)
                      </div>
                    )}

                    {/* Controls */}
                    {(isRunning || isPaused) && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        {isRunning && (
                          <button
                            type="button"
                            onClick={() =>
                              signalMutation.mutate({
                                workflowId: loop.id,
                                signal: 'pause',
                              })
                            }
                            disabled={signalMutation.isPending}
                            className="btn btn-secondary text-sm flex items-center gap-1.5"
                          >
                            <Pause className="w-3.5 h-3.5" /> Pause
                          </button>
                        )}
                        {isPaused && (
                          <button
                            type="button"
                            onClick={() =>
                              signalMutation.mutate({
                                workflowId: loop.id,
                                signal: 'resume',
                              })
                            }
                            disabled={signalMutation.isPending}
                            className="btn btn-primary text-sm flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5" /> Resume
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAbortConfirm(loop.id)}
                          className="btn bg-rose-500 hover:bg-rose-600 text-white text-sm"
                        >
                          Abort
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Iteration History */}
          {loops.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-content-primary">
                Past Iterations
              </h2>
              <IterationHistory agentId={agentFilter || undefined} />
            </div>
          )}

          {/* Configure Loop Dialog */}
          {showConfigureLoop && (
            <ConfigureLoopDialog
              onClose={() => setShowConfigureLoop(false)}
              onCreated={() => refetchLoops()}
              defaultAgentId={agentFilter || undefined}
            />
          )}

          {/* Abort confirmation */}
          {abortConfirm && (
            <dialog
              open
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setAbortConfirm(null)
                }
              }}
            >
              <div className="bg-surface-card rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
                <h3 className="text-lg font-semibold text-content-primary">
                  Abort Optimization Loop
                </h3>
                <p className="text-sm text-content-muted">
                  Are you sure you want to abort this optimization loop? This
                  will terminate the workflow. Any changes made during this
                  iteration will not be deployed.
                </p>
                <p className="text-xs text-content-muted">
                  If a deployment already occurred in a previous iteration, it
                  will remain active.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAbortConfirm(null)}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await signalMutation.mutateAsync({
                        workflowId: abortConfirm,
                        signal: 'abort',
                      })
                      setAbortConfirm(null)
                    }}
                    disabled={signalMutation.isPending}
                    className="btn bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    {signalMutation.isPending ? 'Aborting...' : 'Abort Loop'}
                  </button>
                </div>
              </div>
            </dialog>
          )}
        </div>
      )}
    </div>
  )
}

export default function TrainingPage() {
  return (
    <Suspense
      fallback={
        <div className="relative p-6 space-y-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary-100/60 via-accent-100/20 to-transparent dark:hidden" />
          <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-sm dark:from-surface-card dark:via-surface-card dark:to-surface-raised">
            <div className="h-8 w-48 bg-surface-overlay rounded animate-pulse" />
            <div className="mt-2 h-4 w-80 bg-surface-overlay rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 bg-surface-overlay rounded-lg animate-pulse"
              />
            ))}
          </div>
          <div className="h-10 w-96 bg-surface-overlay rounded animate-pulse" />
          <div className="h-64 bg-surface-overlay rounded-lg animate-pulse" />
        </div>
      }
    >
      <TrainingPageInner />
    </Suspense>
  )
}
