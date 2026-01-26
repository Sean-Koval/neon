/**
 * Trace Detail API
 *
 * GET /api/traces/:id - Get single trace with all spans and scores
 */

import { NextRequest, NextResponse } from "next/server";
import { getTraceWithSpans, getScoresForTrace, type SpanRecord } from "@/lib/clickhouse";

/**
 * Build span tree from flat list
 */
function buildSpanTree(spans: SpanRecord[]): SpanRecord[] {
  const spanMap = new Map<string, SpanRecord & { children?: SpanRecord[] }>();

  // Create map of all spans
  for (const span of spans) {
    spanMap.set(span.span_id, { ...span, children: [] });
  }

  // Build tree
  const roots: SpanRecord[] = [];
  for (const span of spans) {
    const node = spanMap.get(span.span_id)!;
    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      const parent = spanMap.get(span.parent_span_id)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: traceId } = await params;

    // Get project ID from header or query
    const projectId =
      request.headers.get("x-project-id") ||
      request.nextUrl.searchParams.get("project_id") ||
      "00000000-0000-0000-0000-000000000001";

    // Get trace with spans
    const result = await getTraceWithSpans(projectId, traceId);

    if (!result) {
      return NextResponse.json(
        { error: "Trace not found" },
        { status: 404 }
      );
    }

    // Get scores for trace
    const scores = await getScoresForTrace(projectId, traceId);

    // Build span tree
    const spanTree = buildSpanTree(result.spans);

    return NextResponse.json({
      trace: result.trace,
      spans: spanTree,
      flatSpans: result.spans,
      scores,
    });
  } catch (error) {
    console.error("Error getting trace:", error);
    return NextResponse.json(
      { error: "Failed to get trace", details: String(error) },
      { status: 500 }
    );
  }
}
