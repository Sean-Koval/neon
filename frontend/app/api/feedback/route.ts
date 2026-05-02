/**
 * Feedback API
 *
 * POST /api/feedback - Submit human feedback (preference or correction)
 * GET /api/feedback - List feedback items with optional filters
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/logger'
import { withAuth } from '@/lib/middleware/auth'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { READ_LIMIT, WRITE_LIMIT } from '@/lib/rate-limit'
import type { FeedbackCreate, FeedbackFilter, FeedbackItem } from '@/lib/types'
import { validateBody } from '@/lib/validation/middleware'
import { createFeedbackSchema } from '@/lib/validation/schemas'

// In-memory store for feedback (will be replaced with ClickHouse)
// Using a Map for easy lookup and filtering
const feedbackStore = new Map<string, FeedbackItem>()

export const POST = withAuth(withRateLimit(async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()

    // Validate request body
    const validation = validateBody(createFeedbackSchema, rawBody)
    if (!validation.success) return validation.response
    const body = validation.data

    const feedbackId = uuidv4()
    const timestamp = new Date().toISOString()

    const feedbackItem: FeedbackItem = {
      id: feedbackId,
      type: body.type,
      preference: body.preference,
      correction: body.correction,
      user_id: body.user_id,
      session_id: body.session_id || uuidv4(),
      metadata: body.metadata,
      created_at: timestamp,
    }

    // Store feedback
    feedbackStore.set(feedbackId, feedbackItem)

    return NextResponse.json({
      message: 'Feedback submitted successfully',
      id: feedbackId,
      item: feedbackItem,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error submitting feedback')
    return NextResponse.json(
      { error: 'Failed to submit feedback', details: String(error) },
      { status: 500 },
    )
  }
}, WRITE_LIMIT))

export const GET = withAuth(withRateLimit(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    const filter: FeedbackFilter = {
      type: searchParams.get('type') as FeedbackFilter['type'] | undefined,
      user_id: searchParams.get('user_id') || undefined,
      session_id: searchParams.get('session_id') || undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    }

    // Get all feedback items
    let items = Array.from(feedbackStore.values())

    // Apply filters
    if (filter.type) {
      items = items.filter((item) => item.type === filter.type)
    }
    if (filter.user_id) {
      items = items.filter((item) => item.user_id === filter.user_id)
    }
    if (filter.session_id) {
      items = items.filter((item) => item.session_id === filter.session_id)
    }

    // Sort by created_at descending (most recent first)
    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    const total = items.length

    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || 50
    items = items.slice(offset, offset + limit)

    return NextResponse.json({
      items,
      total,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error fetching feedback')
    return NextResponse.json(
      { error: 'Failed to fetch feedback', details: String(error) },
      { status: 500 },
    )
  }
}, READ_LIMIT))
