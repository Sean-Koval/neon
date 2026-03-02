/**
 * Settings API
 *
 * GET /api/settings - Return project configuration from env vars
 */

import { type NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/auth'

export interface ProjectSettings {
  projectId: string
  projectName: string
  environment: string
}

export const GET = withAuth(async function GET(_request: NextRequest) {
  const settings: ProjectSettings = {
    projectId: process.env.PROJECT_ID || '00000000-0000-0000-0000-000000000001',
    projectName: process.env.PROJECT_NAME || 'Default Project',
    environment: process.env.NODE_ENV || 'development',
  }

  return NextResponse.json(settings)
})
