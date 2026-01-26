/**
 * Trace Query API
 *
 * GET /api/traces - List traces with filters
 */

import { NextRequest, NextResponse } from "next/server";
import { queryTraces } from "@/lib/clickhouse";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Get project ID from header or query
    const projectId =
      request.headers.get("x-project-id") ||
      searchParams.get("project_id") ||
      "00000000-0000-0000-0000-000000000001";

    const status = searchParams.get("status") as "ok" | "error" | null;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const traces = await queryTraces({
      projectId,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: Math.min(limit, 100),
      offset,
    });

    return NextResponse.json({
      items: traces,
      count: traces.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error querying traces:", error);
    return NextResponse.json(
      { error: "Failed to query traces", details: String(error) },
      { status: 500 }
    );
  }
}
