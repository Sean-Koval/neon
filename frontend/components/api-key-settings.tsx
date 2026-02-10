'use client'

import { AlertCircle, Check, Key } from 'lucide-react'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { CONFIG } from '@/lib/config'

/**
 * Component for setting/updating the API key at runtime.
 * Can be used in a settings page or as a modal.
 */
export function ApiKeySettings() {
  const { isAuthenticated, setApiKey, clearApiKey } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSuccess(false)

      const trimmedKey = inputValue.trim()
      if (!trimmedKey) {
        setError('Please enter an API key')
        return
      }

      // Basic format validation
      const parts = trimmedKey.split('_')
      if (parts.length !== 3 || parts[0] !== 'ae') {
        setError('Invalid format. Expected: ae_<env>_<key>')
        return
      }

      // Set the key first so we can test it
      setApiKey(trimmedKey)
      setIsValidating(true)

      try {
        // Validate by making a simple API call
        await api.getSuites()
        setSuccess(true)
        setInputValue('')
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), CONFIG.SUCCESS_FEEDBACK_MS)
      } catch {
        // Key didn't work - clear it
        clearApiKey()
        setError('API key validation failed. Please check your key.')
      } finally {
        setIsValidating(false)
      }
    },
    [inputValue, setApiKey, clearApiKey],
  )

  const handleClear = useCallback(() => {
    clearApiKey()
    setInputValue('')
    setError(null)
    setSuccess(false)
  }, [clearApiKey])

  return (
    <div className="card p-6 dark:border dark:border-slate-700/80 dark:bg-slate-900/72">
      <div className="flex items-center space-x-3 mb-4">
        <Key className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">API Key</h3>
      </div>

      {isAuthenticated ? (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-green-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            <span className="text-sm">API key configured</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            Clear API key
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="api-key"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Enter your API key
            </label>
            <input
              id="api-key"
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="ae_live_..."
              className="w-full border border-gray-300 dark:border-slate-700/80 rounded-md px-3 py-2 text-sm dark:bg-dark-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Format: ae_&lt;environment&gt;_&lt;key&gt;
            </p>
          </div>

          {error && (
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center space-x-2 text-green-600 dark:text-emerald-400 text-sm">
              <Check className="w-4 h-4" />
              <span>API key saved successfully</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isValidating || !inputValue.trim()}
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Validating...' : 'Save API Key'}
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * Minimal inline prompt shown when no API key is configured.
 * Can be displayed at the top of pages that require authentication.
 */
export function ApiKeyPrompt() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return null
  }

  return (
    <div className="bg-yellow-50 dark:bg-amber-500/10 border border-yellow-200 dark:border-amber-500/25 rounded-lg p-4 mb-6">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-amber-400 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-yellow-800 dark:text-amber-300">
            API Key Required
          </h4>
          <p className="mt-1 text-sm text-yellow-700 dark:text-amber-400">
            Configure your API key to access evaluation data. You can set it in
            the environment variable{' '}
            <code className="text-xs bg-yellow-100 dark:bg-amber-500/20 px-1 py-0.5 rounded">
              NEXT_PUBLIC_API_KEY
            </code>{' '}
            or use the settings page.
          </p>
        </div>
      </div>
    </div>
  )
}
