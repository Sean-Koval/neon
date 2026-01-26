"use client";

/**
 * Workflow Detail Page
 *
 * Shows detailed status and controls for a Temporal workflow.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useWorkflow,
  useWorkflowProgress,
  useApproveWorkflow,
  useCancelWorkflow,
} from "@/hooks/use-workflows";
import { WorkflowStatus } from "@/components/workflows/workflow-status";
import { ApprovalDialog } from "@/components/workflows/approval-dialog";
import { ArrowLeft, RefreshCw, XCircle } from "lucide-react";

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = params.id as string;

  const { data: workflow, isLoading, refetch } = useWorkflow(workflowId);
  const { data: progress } = useWorkflowProgress(workflowId);
  const approveMutation = useApproveWorkflow();
  const cancelMutation = useCancelWorkflow();

  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <XCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-medium">Workflow not found</h2>
        <Link href="/workflows" className="text-blue-500 hover:underline mt-2">
          Back to workflows
        </Link>
      </div>
    );
  }

  const handleApprove = () => {
    approveMutation.mutate({
      workflowId,
      approved: true,
    });
  };

  const handleReject = (reason: string) => {
    approveMutation.mutate({
      workflowId,
      approved: false,
      reason,
    });
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this workflow?")) {
      cancelMutation.mutate(workflowId);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/workflows" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Workflow Details</h1>
          <p className="text-sm text-gray-500 font-mono">{workflowId}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Status card */}
      <WorkflowStatus
        workflowId={workflow.workflowId}
        status={workflow.status as any}
        progress={progress}
        startTime={workflow.startTime}
        closeTime={workflow.closeTime}
        workflowType={workflow.type}
        onRefresh={() => refetch()}
        onApprove={
          workflow.status === "awaiting_approval"
            ? () => setShowApprovalDialog(true)
            : undefined
        }
        onCancel={
          workflow.status === "RUNNING" || workflow.status === "awaiting_approval"
            ? handleCancel
            : undefined
        }
      />

      {/* Timeline would go here */}
      <div className="mt-6">
        <h3 className="font-medium mb-3">Execution Timeline</h3>
        <div className="border rounded-lg p-4 text-gray-500 text-center">
          Timeline visualization coming soon
        </div>
      </div>

      {/* Approval dialog */}
      <ApprovalDialog
        request={{
          workflowId,
          toolName: "example_tool",
          toolInput: { example: "data" },
          reason: "This action requires human approval",
          riskLevel: "medium",
        }}
        isOpen={showApprovalDialog}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => setShowApprovalDialog(false)}
      />
    </div>
  );
}
