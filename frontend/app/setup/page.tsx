'use client'

import { ArrowRight, Check, Code2, Play, Telescope } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { trpc } from '@/lib/trpc'

type Step = 'welcome' | 'install' | 'suite' | 'done'

export default function SetupPage() {
  const [step, setStep] = useState<Step>('welcome')
  const { user } = useAuth()
  const router = useRouter()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-2xl">
        {step === 'welcome' && (
          <WelcomeStep
            name={user?.name || user?.email || 'there'}
            onNext={() => setStep('install')}
          />
        )}
        {step === 'install' && (
          <InstallStep onNext={() => setStep('suite')} onBack={() => setStep('welcome')} />
        )}
        {step === 'suite' && (
          <CreateSuiteStep onNext={() => setStep('done')} onBack={() => setStep('install')} />
        )}
        {step === 'done' && <DoneStep onFinish={() => router.push('/')} />}
      </div>
    </div>
  )
}

function WelcomeStep({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Welcome to Neon, {name}
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Your agent evaluation platform is ready. Let's set up your first eval in 3 steps.
        </p>
      </div>

      <div className="grid gap-4 text-left">
        <StepPreview
          number={1}
          icon={<Code2 className="h-5 w-5" />}
          title="Install the SDK"
          description="Add the Neon SDK to your agent project"
        />
        <StepPreview
          number={2}
          icon={<Telescope className="h-5 w-5" />}
          title="Create an eval suite"
          description="Define test cases and scorers for your agent"
        />
        <StepPreview
          number={3}
          icon={<Play className="h-5 w-5" />}
          title="Run your first eval"
          description="Execute the suite and see results in the dashboard"
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
      >
        Get Started <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function StepPreview({
  number,
  icon,
  title,
  description,
}: {
  number: number
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        {number}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <h3 className="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  )
}

function InstallStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [copied, setCopied] = useState<'ts' | 'py' | null>(null)

  const copy = useCallback((text: string, lang: 'ts' | 'py') => {
    navigator.clipboard.writeText(text)
    setCopied(lang)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Step 1: Install the SDK
        </h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Add the Neon SDK to your agent project.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">TypeScript</span>
            <button
              type="button"
              onClick={() => copy('npm install @neon/sdk', 'ts')}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              {copied === 'ts' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="rounded-md bg-gray-900 p-3 text-sm text-gray-100">
            <code>npm install @neon/sdk</code>
          </pre>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Python</span>
            <button
              type="button"
              onClick={() => copy('pip install neon-sdk', 'py')}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              {copied === 'py' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="rounded-md bg-gray-900 p-3 text-sm text-gray-100">
            <code>pip install neon-sdk</code>
          </pre>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function CreateSuiteStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [name, setName] = useState('My First Suite')
  const [isCreating, setIsCreating] = useState(false)
  const createSuite = trpc.suites.create.useMutation()

  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    try {
      await createSuite.mutateAsync({
        name,
        description: 'Getting started eval suite',
        agentId: 'my-agent',
        defaultScorers: ['tool_selection'],
      })
      onNext()
    } catch {
      // If suite creation fails (e.g., tRPC not connected), still allow proceeding
      onNext()
    } finally {
      setIsCreating(false)
    }
  }, [name, createSuite, onNext])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Step 2: Create your first eval suite
        </h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          An eval suite contains test cases that measure your agent's performance.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="suite-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Suite name
          </label>
          <input
            id="suite-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            placeholder="e.g., Customer Support Agent Evals"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What's next?
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            After creating the suite, you can add test cases from the Suites page or define them
            programmatically using the SDK. Then trigger eval runs from the dashboard or your CI pipeline.
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Suite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  // Mark setup as complete so dashboard doesn't redirect again
  if (typeof window !== 'undefined') {
    localStorage.setItem('neon-setup-complete', 'true')
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          You're all set!
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Your workspace is configured. Head to the dashboard to start evaluating your agents.
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onFinish}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Go to Dashboard <ArrowRight className="h-4 w-4" />
        </button>
        <div className="flex justify-center gap-4 text-sm">
          <Link href="/suites" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            View Suites
          </Link>
          <Link href="/traces" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            View Traces
          </Link>
        </div>
      </div>
    </div>
  )
}
