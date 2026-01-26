"use client";

/**
 * Trace Detail Page
 *
 * Shows full trace details with span tree and scores.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTrace } from "@/hooks/use-traces";
import { TraceTimeline } from "@/components/traces/trace-timeline";
import { SpanDetail } from "@/components/traces/span-detail";
import {
  ArrowLeft,
  Clock,
  MessageSquare,
  Wrench,
  CheckCircle,
  XCircle,
  DollarSign,
  Hash,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export default function TraceDetailPage() {
  const params = useParams();
  const traceId = params.id as string;

  const { data, isLoading, refetch } = useTrace(traceId);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const selectedSpan = selectedSpanId
    ? findSpan(data?.spans || [], selectedSpanId)
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <XCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-medium">Trace not found</h2>
        <Link href="/traces" className="text-blue-500 hover:underline mt-2">
          Back to traces
        </Link>
      </div>
    );
  }

  const { trace, spans, scores } = data;

  // Calculate stats
  const totalTokens = spans.reduce(
    (sum, s) => sum + (s.total_tokens || 0),
    0
  );
  const llmCalls = spans.filter((s) => s.span_type === "generation").length;
  const toolCalls = spans.filter((s) => s.span_type === "tool").length;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/traces"
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{trace.name}</h1>
            <p className="text-sm text-gray-500 font-mono">{trace.trace_id}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            {trace.status === "ok" ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <span className={cn(
              "font-medium",
              trace.status === "ok" ? "text-green-600" : "text-red-600"
            )}>
              {trace.status === "ok" ? "Success" : "Error"}
            </span>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(trace.duration_ms)}</span>
          </div>

          {/* LLM Calls */}
          <div className="flex items-center gap-2 text-gray-600">
            <MessageSquare className="w-4 h-4" />
            <span>{llmCalls} LLM calls</span>
          </div>

          {/* Tool Calls */}
          <div className="flex items-center gap-2 text-gray-600">
            <Wrench className="w-4 h-4" />
            <span>{toolCalls} tool calls</span>
          </div>

          {/* Tokens */}
          <div className="flex items-center gap-2 text-gray-600">
            <Hash className="w-4 h-4" />
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>

          {/* Timestamp */}
          <div className="text-gray-500 text-sm ml-auto">
            {new Date(trace.timestamp).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline */}
        <div className={cn(
          "flex-1 overflow-auto p-6",
          selectedSpan && "border-r"
        )}>
          {/* Scores summary */}
          {scores && scores.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium mb-3">Scores</h3>
              <div className="flex gap-3">
                {scores.map((score) => (
                  <div
                    key={score.score_id}
                    className="px-4 py-2 bg-gray-50 rounded-lg"
                  >
                    <div className="text-sm text-gray-500">{score.name}</div>
                    <div className="text-lg font-medium">
                      {(score.value * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Span timeline */}
          <div>
            <h3 className="font-medium mb-3">Span Timeline</h3>
            <TraceTimeline
              spans={spans}
              selectedSpanId={selectedSpanId || undefined}
              onSpanSelect={(span) => setSelectedSpanId(span.span_id)}
            />
          </div>
        </div>

        {/* Span detail panel */}
        {selectedSpan && (
          <div className="w-[400px] flex-shrink-0">
            <SpanDetail
              span={selectedSpan}
              onClose={() => setSelectedSpanId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Find a span by ID in the tree
 */
function findSpan(spans: any[], spanId: string): any | null {
  for (const span of spans) {
    if (span.span_id === spanId) return span;
    if (span.children) {
      const found = findSpan(span.children, spanId);
      if (found) return found;
    }
  }
  return null;
}
