'use client'

import { clsx } from 'clsx'
import {
  BarChart3,
  CheckCircle,
  Edit3,
  GitCompare,
  MessageSquare,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import {
  CorrectionForm,
  PreferencePicker,
  PreferencePickerSkeleton,
} from '@/components/feedback'
import {
  useFeedback,
  usePreferenceSession,
  useSubmitFeedback,
} from '@/hooks/use-feedback'
import type { ResponseOption } from '@/lib/types'

// =============================================================================
// Tab Types
// =============================================================================

type FeedbackTab = 'compare' | 'correct' | 'history'

const tabs: { id: FeedbackTab; label: string; icon: typeof GitCompare }[] = [
  { id: 'compare', label: 'Compare Responses', icon: GitCompare },
  { id: 'correct', label: 'Provide Corrections', icon: Edit3 },
  { id: 'history', label: 'Feedback History', icon: BarChart3 },
]

// =============================================================================
// Stats Card Component
// =============================================================================

interface StatsCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: { value: number; label: string }
}

function StatsCard({ label, value, icon, trend }: StatsCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-gray-500">{icon}</div>
        {trend && (
          <span
            className={clsx(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              trend.value >= 0
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400',
            )}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </span>
        )}
      </div>
      <div className="mt-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  )
}

// =============================================================================
// Session Complete Component
// =============================================================================

interface SessionCompleteProps {
  completedCount: number
  onStartNew: () => void
}

function SessionComplete({ completedCount, onStartNew }: SessionCompleteProps) {
  return (
    <div className="card p-12 text-center">
      <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
        <Trophy className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Session Complete!
      </h2>
      <p className="text-gray-500 mb-6">
        You've completed {completedCount} comparisons in this session. Thank you
        for your feedback!
      </p>
      <button type="button" onClick={onStartNew} className="btn btn-primary">
        Start New Session
      </button>
    </div>
  )
}

// =============================================================================
// Compare Tab Content
// =============================================================================

function CompareTabContent() {
  const [sessionKey, setSessionKey] = useState(0)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [finalCount, setFinalCount] = useState(0)

  const session = usePreferenceSession({
    limit: 10,
    onComplete: () => {
      setFinalCount(session.completedCount)
      setSessionComplete(true)
    },
  })

  const handleStartNew = () => {
    setSessionKey((k) => k + 1)
    setSessionComplete(false)
    setFinalCount(0)
  }

  if (session.isLoading) {
    return <PreferencePickerSkeleton />
  }

  if (session.error) {
    return (
      <div className="card p-8 text-center">
        <div className="text-rose-500 mb-4">
          <MessageSquare className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Failed to load comparisons
        </h3>
        <p className="text-gray-500">{session.error.message}</p>
      </div>
    )
  }

  if (sessionComplete) {
    return (
      <SessionComplete
        completedCount={finalCount}
        onStartNew={handleStartNew}
      />
    )
  }

  if (!session.currentComparison) {
    return (
      <div className="card p-8 text-center">
        <div className="text-gray-400 mb-4">
          <GitCompare className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No comparisons available
        </h3>
        <p className="text-gray-500">
          Check back later for more responses to compare.
        </p>
      </div>
    )
  }

  return (
    <div key={sessionKey}>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Session Progress</span>
          <span>
            {session.completedCount} of {session.totalComparisons} completed
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${session.progress}%` }}
          />
        </div>
      </div>

      <PreferencePicker
        comparison={session.currentComparison}
        onSubmit={session.submitPreference}
        onSkip={session.skip}
        onPrevious={session.previous}
        onNext={session.next}
        canGoPrevious={session.currentIndex > 0}
        canGoNext={session.currentIndex < session.totalComparisons - 1}
        currentIndex={session.currentIndex}
        totalCount={session.totalComparisons}
        isSubmitting={session.isSubmitting}
        timeSpent={session.timeOnCurrent}
      />
    </div>
  )
}

// =============================================================================
// Correction Tab Content
// =============================================================================

function CorrectionTabContent() {
  const [selectedResponse, setSelectedResponse] = useState<{
    response: ResponseOption
    prompt?: string
  } | null>(null)
  const [correctionComplete, setCorrectionComplete] = useState(false)

  const submitFeedback = useSubmitFeedback({
    onSuccess: () => {
      setCorrectionComplete(true)
    },
  })

  // Demo responses to correct
  const demoResponses: { response: ResponseOption; prompt: string }[] = [
    {
      prompt: 'What is the capital of France?',
      response: {
        id: 'demo-1',
        content:
          "The capital of France is Paris. Paris is also the largest city in France and serves as the country's political, economic, and cultural center. It is located in the north-central part of France along the Seine River.",
        source: 'demo-model',
      },
    },
    {
      prompt: 'Explain how photosynthesis works in simple terms.',
      response: {
        id: 'demo-2',
        content:
          'Photosynthesis is the process plants use to convert sunlight into food. The plant takes in carbon dioxide from the air through its leaves and water from the soil through its roots. Using sunlight as energy, it combines these to create glucose (sugar) and releases oxygen as a byproduct.',
        source: 'demo-model',
      },
    },
  ]

  const handleSubmitCorrection = async (data: {
    correctedContent: string
    changeSummary?: string
    correctionTypes?: string[]
  }) => {
    if (!selectedResponse) return

    await submitFeedback.mutateAsync({
      type: 'correction',
      correction: {
        response_id: selectedResponse.response.id,
        original_content: selectedResponse.response.content,
        corrected_content: data.correctedContent,
        change_summary: data.changeSummary,
        correction_types: data.correctionTypes,
      },
    })
  }

  if (correctionComplete) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Correction Submitted!
        </h2>
        <p className="text-gray-500 mb-6">
          Thank you for improving the response quality.
        </p>
        <button
          type="button"
          onClick={() => {
            setSelectedResponse(null)
            setCorrectionComplete(false)
          }}
          className="btn btn-primary"
        >
          Correct Another Response
        </button>
      </div>
    )
  }

  if (selectedResponse) {
    return (
      <CorrectionForm
        response={selectedResponse.response}
        prompt={selectedResponse.prompt}
        onSubmit={handleSubmitCorrection}
        onCancel={() => setSelectedResponse(null)}
        isSubmitting={submitFeedback.isPending}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-600">Select a response to correct and improve:</p>
      {demoResponses.map((item, index) => (
        <button
          key={item.response.id}
          type="button"
          onClick={() => setSelectedResponse(item)}
          className="w-full text-left card p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Prompt #{index + 1}
              </span>
              <p className="mt-1 font-medium text-gray-900">{item.prompt}</p>
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                {item.response.content}
              </p>
            </div>
            <Edit3 className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
          </div>
        </button>
      ))}
    </div>
  )
}

// =============================================================================
// History Tab Content
// =============================================================================

function HistoryTabContent() {
  const { data, isLoading, error } = useFeedback({ limit: 20 })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <div className="text-rose-500 mb-4">
          <MessageSquare className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Failed to load history
        </h3>
        <p className="text-gray-500">{error.message}</p>
      </div>
    )
  }

  if (!data?.items.length) {
    return (
      <div className="card p-8 text-center">
        <div className="text-gray-400 mb-4">
          <BarChart3 className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No feedback yet
        </h3>
        <p className="text-gray-500">
          Start comparing responses or providing corrections to see your history
          here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.items.map((item) => (
        <div key={item.id} className="card p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  item.type === 'preference'
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
                )}
              >
                {item.type === 'preference' ? (
                  <GitCompare className="w-4 h-4" />
                ) : (
                  <Edit3 className="w-4 h-4" />
                )}
              </div>
              <div>
                <div className="font-medium text-gray-900 capitalize">
                  {item.type} Feedback
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            </div>
            {item.type === 'preference' && item.preference && (
              <span
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium',
                  item.preference.choice === 'A' && 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
                  item.preference.choice === 'B' &&
                    'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
                  item.preference.choice === 'tie' &&
                    'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
                  item.preference.choice === 'both_bad' &&
                    'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400',
                )}
              >
                {item.preference.choice === 'A'
                  ? 'Chose A'
                  : item.preference.choice === 'B'
                    ? 'Chose B'
                    : item.preference.choice === 'tie'
                      ? 'Tie'
                      : 'Both Bad'}
              </span>
            )}
          </div>
          {item.preference?.reason && (
            <p className="mt-2 text-sm text-gray-600 pl-11">
              "{item.preference.reason}"
            </p>
          )}
          {item.correction?.change_summary && (
            <p className="mt-2 text-sm text-gray-600 pl-11">
              Changes: {item.correction.change_summary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Main Feedback Page
// =============================================================================

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState<FeedbackTab>('compare')
  const { data: feedbackData } = useFeedback({ limit: 100 })

  // Calculate stats
  const totalFeedback = feedbackData?.total ?? 0
  const preferenceCount =
    feedbackData?.items.filter((f) => f.type === 'preference').length ?? 0
  const correctionCount =
    feedbackData?.items.filter((f) => f.type === 'correction').length ?? 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Human Feedback</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Help improve AI responses through preference comparisons and
          corrections
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          label="Total Feedback"
          value={totalFeedback}
          icon={<MessageSquare className="w-5 h-5" />}
        />
        <StatsCard
          label="Preferences"
          value={preferenceCount}
          icon={<GitCompare className="w-5 h-5" />}
        />
        <StatsCard
          label="Corrections"
          value={correctionCount}
          icon={<Edit3 className="w-5 h-5" />}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="card p-6">
        {activeTab === 'compare' && <CompareTabContent />}
        {activeTab === 'correct' && <CorrectionTabContent />}
        {activeTab === 'history' && <HistoryTabContent />}
      </div>
    </div>
  )
}
