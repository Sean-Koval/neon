/**
 * Feedback API
 *
 * POST /api/feedback - Submit human feedback (preference or correction)
 * GET /api/feedback - List feedback items with optional filters
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import type { FeedbackCreate, FeedbackFilter, FeedbackItem } from '@/lib/types'
import { logger } from '@/lib/logger'

// In-memory store for feedback (will be replaced with ClickHouse)
// Using a Map for easy lookup and filtering
const feedbackStore = new Map<string, FeedbackItem>()

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackCreate = await request.json()

    // Validate feedback type
    if (!body.type) {
      return NextResponse.json(
        { error: 'Feedback type is required' },
        { status: 400 },
      )
    }

    // Validate type-specific data
    if (body.type === 'preference' && !body.preference) {
      return NextResponse.json(
        { error: 'Preference data is required for preference feedback' },
        { status: 400 },
      )
    }

    if (body.type === 'correction' && !body.correction) {
      return NextResponse.json(
        { error: 'Correction data is required for correction feedback' },
        { status: 400 },
      )
    }

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
}

export async function GET(request: NextRequest) {
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
}
