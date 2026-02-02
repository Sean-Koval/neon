/**
 * LLM Providers API
 *
 * GET /api/settings/llm-providers - Return LLM provider configuration status
 */

import { NextResponse } from 'next/server'

export interface LlmProvidersStatus {
  anthropic: boolean
  openai: boolean
}

export async function GET(): Promise<NextResponse<LlmProvidersStatus>> {
  // Check if API keys are configured (but don't expose the actual keys)
  const status: LlmProvidersStatus = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  }

  return NextResponse.json(status)
}
