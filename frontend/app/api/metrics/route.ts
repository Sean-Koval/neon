/**
 * Prometheus Metrics Endpoint
 *
 * GET /api/metrics - Returns Prometheus-formatted metrics for scraping.
 * No authentication required (standard for Prometheus scraping in internal networks).
 *
 * Self-hosters configure their Prometheus to scrape this endpoint.
 */

import { NextResponse } from 'next/server'
import { register } from '@/lib/metrics'

export async function GET(): Promise<Response> {
  const metrics = await register.metrics()
  return new Response(metrics, {
    headers: {
      'Content-Type': register.contentType,
      'Cache-Control': 'no-store',
    },
  })
}
