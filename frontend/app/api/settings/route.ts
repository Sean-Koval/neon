/**
 * Settings API
 *
 * GET /api/settings - Return project configuration from env vars
 */

import { NextResponse } from 'next/server'

export interface ProjectSettings {
  projectId: string
  projectName: string
  environment: string
}

export async function GET(): Promise<NextResponse<ProjectSettings>> {
  const settings: ProjectSettings = {
    projectId: process.env.PROJECT_ID || '00000000-0000-0000-0000-000000000001',
    projectName: process.env.PROJECT_NAME || 'Default Project',
    environment: process.env.NODE_ENV || 'development',
  }

  return NextResponse.json(settings)
}
