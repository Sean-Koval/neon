/**
 * Infrastructure Health API
 *
 * GET /api/settings/health - Check ClickHouse and Temporal connection status
 */

import { NextResponse } from 'next/server'
import { healthCheck } from '@/lib/db/clickhouse'

export interface InfrastructureHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  clickhouse: boolean
  temporal: boolean
  clickhouseUrl?: string
  temporalAddress?: string
  timestamp: string
}

export async function GET(): Promise<NextResponse<InfrastructureHealth>> {
  const health: InfrastructureHealth = {
    status: 'unhealthy',
    clickhouse: false,
    temporal: false,
    timestamp: new Date().toISOString(),
  }

  // Check ClickHouse connectivity via abstraction layer
  health.clickhouse = await healthCheck()
  if (health.clickhouse) {
    health.clickhouseUrl = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
  }

  // Check Temporal connectivity
  // We use a dynamic import and timeout to avoid blocking
  try {
    const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233'
    health.temporalAddress = temporalAddress

    // Simple TCP connection check with timeout
    const checkTemporalConnection = async (): Promise<boolean> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000)

        // Try to import and connect
        import('@/lib/temporal')
          .then(({ getTemporalClient }) => getTemporalClient())
          .then(() => {
            clearTimeout(timeout)
            resolve(true)
          })
          .catch(() => {
            clearTimeout(timeout)
            resolve(false)
          })
      })
    }

    health.temporal = await checkTemporalConnection()
  } catch {
    health.temporal = false
  }

  // Determine overall status
  if (health.clickhouse && health.temporal) {
    health.status = 'healthy'
  } else if (health.clickhouse || health.temporal) {
    health.status = 'degraded'
  } else {
    health.status = 'unhealthy'
  }

  return NextResponse.json(health)
}
