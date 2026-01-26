/**
 * Health Check API
 *
 * GET /api/health - Check API and service health
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getClickHouseClient } from '@/lib/clickhouse'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  timestamp: string
  checks: {
    api: boolean
    clickhouse: boolean
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<HealthStatus>> {
  const checks = {
    api: true, // If we're running, API is working
    clickhouse: false,
  }

  // Check ClickHouse connectivity
  try {
    const client = getClickHouseClient()
    const result = await client.query({
      query: 'SELECT 1',
      format: 'JSON',
    })
    await result.json()
    checks.clickhouse = true
  } catch {
    checks.clickhouse = false
  }

  // Determine overall status
  const allHealthy = checks.api && checks.clickhouse
  const anyHealthy = checks.api || checks.clickhouse

  let status: HealthStatus['status']
  if (allHealthy) {
    status = 'healthy'
  } else if (anyHealthy) {
    status = 'degraded'
  } else {
    status = 'unhealthy'
  }

  const healthStatus: HealthStatus = {
    status,
    version: process.env.npm_package_version || '0.1.0',
    timestamp: new Date().toISOString(),
    checks,
  }

  // Return 503 if unhealthy
  const httpStatus = status === 'unhealthy' ? 503 : 200

  return NextResponse.json(healthStatus, { status: httpStatus })
}
