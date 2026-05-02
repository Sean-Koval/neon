/**
 * LLM Providers API
 *
 * GET /api/settings/llm-providers - Return LLM provider configuration status
 */

import { type NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'

export interface LlmProvidersStatus {
  anthropic: boolean
  openai: boolean
}

export const GET = withAuth(async function GET(_request: NextRequest) {
  // Check if API keys are configured (but don't expose the actual keys)
  const status: LlmProvidersStatus = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  }

  return NextResponse.json(status)
})
