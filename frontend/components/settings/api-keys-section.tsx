'use client'

/**
 * API Keys Section Component
 *
 * Manages API keys for authentication.
 * Re-exports and extends the existing ApiKeySettings component.
 */

import { AlertCircle, Key } from 'lucide-react'
import { ApiKeySettings } from '@/components/api-key-settings'

export function ApiKeysSection() {
  return (
    <div className="space-y-6">
      {/* Current API Key */}
      <ApiKeySettings />

      {/* Info Section */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-medium">About API Keys</h3>
        </div>

        <div className="space-y-4 text-sm text-gray-600">
          <p>
            API keys are used to authenticate requests to the Neon evaluation
            platform. They allow your agents and SDK integrations to submit
            traces and scores.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-800 mb-1">Key Format</h4>
                <p className="text-blue-700">
                  API keys follow the format:{' '}
                  <code className="bg-blue-100 px-1 rounded">
                    ae_&lt;env&gt;_&lt;key&gt;
                  </code>
                </p>
                <ul className="mt-2 list-disc list-inside text-blue-700 space-y-1">
                  <li>
                    <code className="bg-blue-100 px-1 rounded">
                      ae_live_...
                    </code>{' '}
                    - Production keys
                  </li>
                  <li>
                    <code className="bg-blue-100 px-1 rounded">
                      ae_test_...
                    </code>{' '}
                    - Test/development keys
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-800 mb-1">
                  Security Notice
                </h4>
                <p className="text-yellow-700">
                  Keep your API keys secure. Never commit them to version
                  control or share them publicly. You can also set keys via the{' '}
                  <code className="bg-yellow-100 px-1 rounded">
                    NEXT_PUBLIC_API_KEY
                  </code>{' '}
                  environment variable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
