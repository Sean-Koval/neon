"use client";

/**
 * Eval Runs Page
 *
 * Lists all Temporal-based eval runs with real-time status updates.
 */

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  ChevronRight,
  Filter,
  Square,
} from "lucide-react";
import {
  useWorkflowRuns,
  useStartWorkflowRun,
} from "@/hooks/use-workflow-runs";
import { StartEvalRunDialog } from "@/components/eval-runs";
import type { WorkflowStatus, WorkflowStatusResponse } from "@/lib/types";

/**
 * Get status display info
 */
function getStatusInfo(status: WorkflowStatus) {
  switch (status) {
    case "RUNNING":
      return {
        Icon: Loader2,
        color: "text-blue-600",
        bg: "bg-blue-50",
        label: "Running",
        animate: true,
      };
    case "COMPLETED":
      return {
        Icon: CheckCircle,
        color: "text-green-600",
        bg: "bg-green-50",
        label: "Completed",
        animate: false,
      };
    case "FAILED":
      return {
        Icon: XCircle,
        color: "text-red-600",
        bg: "bg-red-50",
        label: "Failed",
        animate: false,
      };
    case "CANCELLED":
      return {
        Icon: Square,
        color: "text-gray-600",
        bg: "bg-gray-100",
        label: "Cancelled",
        animate: false,
      };
    case "TERMINATED":
      return {
        Icon: XCircle,
        color: "text-gray-600",
        bg: "bg-gray-100",
        label: "Terminated",
        animate: false,
      };
    case "TIMED_OUT":
      return {
        Icon: Clock,
        color: "text-orange-600",
        bg: "bg-orange-50",
        label: "Timed Out",
        animate: false,
      };
    default:
      return {
        Icon: Clock,
        color: "text-gray-600",
        bg: "bg-gray-100",
        label: "Unknown",
        animate: false,
      };
  }
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: WorkflowStatus }) {
  const info = getStatusInfo(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${info.bg} ${info.color}`}
    >
      <info.Icon className={`w-3.5 h-3.5 ${info.animate ? "animate-spin" : ""}`} />
      {info.label}
    </span>
  );
}

/**
 * Progress indicator
 */
function ProgressIndicator({ run }: { run: WorkflowStatusResponse }) {
  if (!run.progress) return null;

  const { completed, total, passed, failed } = run.progress;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-32">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">
          {completed}/{total}
        </span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex gap-2 text-xs mt-1">
        <span className="text-green-600">{passed} pass</span>
        <span className="text-red-600">{failed} fail</span>
      </div>
    </div>
  );
}

/**
 * Run row component
 */
function RunRow({ run }: { run: WorkflowStatusResponse }) {
  return (
    <Link
      href={`/eval-runs/${run.id}`}
      className="flex items-center px-4 py-4 border-b hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{run.id}</span>
        </div>
        <div className="text-sm text-gray-500 font-mono truncate">
          {run.workflowId}
        </div>
      </div>

      <div className="w-28">
        <StatusBadge status={run.status} />
      </div>

      <div className="w-36">
        <ProgressIndicator run={run} />
      </div>

      <div className="w-32 text-right text-sm text-gray-500">
        {formatDistanceToNow(new Date(run.startTime), { addSuffix: true })}
      </div>

      <div className="w-8 flex justify-center">
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </Link>
  );
}

export default function EvalRunsPage() {
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "">("");
  const [showStartDialog, setShowStartDialog] = useState(false);

  const {
    data: runs,
    isLoading,
    refetch,
  } = useWorkflowRuns(
    statusFilter ? { status: statusFilter as WorkflowStatus } : undefined
  );

  const startMutation = useStartWorkflowRun({
    onSuccess: () => {
      setShowStartDialog(false);
      refetch();
    },
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Eval Runs</h1>
          <p className="text-gray-500">
            Temporal-orchestrated evaluation runs
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setShowStartDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Play className="w-4 h-4" />
            New Eval Run
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkflowStatus | "")}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Runs list */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center px-4 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="flex-1">Run</div>
          <div className="w-28">Status</div>
          <div className="w-36">Progress</div>
          <div className="w-32 text-right">Started</div>
          <div className="w-8" />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading runs...</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!runs || runs.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No eval runs found</p>
            <p className="text-sm text-gray-400">
              Start a new eval run to begin evaluating your agents
            </p>
            <button
              onClick={() => setShowStartDialog(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Play className="w-4 h-4" />
              Start First Run
            </button>
          </div>
        )}

        {/* Runs */}
        {runs && runs.length > 0 && (
          <div>
            {runs.map((run) => (
              <RunRow key={run.workflowId} run={run} />
            ))}
          </div>
        )}
      </div>

      {/* Start dialog */}
      <StartEvalRunDialog
        isOpen={showStartDialog}
        onClose={() => setShowStartDialog(false)}
        onStart={(request) => startMutation.mutate(request)}
        isStarting={startMutation.isPending}
        error={startMutation.error?.message}
      />
    </div>
  );
}
