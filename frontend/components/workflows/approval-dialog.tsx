"use client";

/**
 * Approval Dialog Component
 *
 * Modal for human-in-the-loop approval of agent actions.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  X,
  Check,
  Wrench,
  MessageSquare,
  Shield,
} from "lucide-react";

/**
 * Approval request data
 */
interface ApprovalRequest {
  workflowId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason?: string;
  riskLevel?: "low" | "medium" | "high";
}

interface ApprovalDialogProps {
  request: ApprovalRequest;
  isOpen: boolean;
  onApprove: (reason?: string) => void;
  onReject: (reason: string) => void;
  onClose: () => void;
}

/**
 * Get risk level info
 */
function getRiskInfo(level: ApprovalRequest["riskLevel"]) {
  switch (level) {
    case "high":
      return {
        color: "text-red-500",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        label: "High Risk",
      };
    case "medium":
      return {
        color: "text-yellow-500",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-200",
        label: "Medium Risk",
      };
    default:
      return {
        color: "text-blue-500",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        label: "Low Risk",
      };
  }
}

/**
 * Approval Dialog Component
 */
export function ApprovalDialog({
  request,
  isOpen,
  onApprove,
  onReject,
  onClose,
}: ApprovalDialogProps) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const riskInfo = getRiskInfo(request.riskLevel);

  if (!isOpen) return null;

  const handleApprove = () => {
    onApprove();
    onClose();
  };

  const handleReject = () => {
    if (!showRejectForm) {
      setShowRejectForm(true);
      return;
    }
    onReject(rejectReason || "Rejected by user");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-6 py-4 border-b",
            riskInfo.bgColor,
            riskInfo.borderColor
          )}
        >
          <div className="flex items-center gap-3">
            <Shield className={cn("w-6 h-6", riskInfo.color)} />
            <div>
              <h2 className="font-semibold text-lg">Approval Required</h2>
              <p className={cn("text-sm", riskInfo.color)}>{riskInfo.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/50 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Tool info */}
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-gray-500" />
            <span className="font-medium">{request.toolName}</span>
          </div>

          {/* Description */}
          {request.reason && (
            <div className="flex items-start gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
              <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5" />
              <p className="text-sm text-gray-600">{request.reason}</p>
            </div>
          )}

          {/* Tool input preview */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">
              Tool Input
            </h4>
            <pre className="bg-gray-50 rounded-lg p-3 text-sm overflow-x-auto max-h-[200px] overflow-y-auto">
              <code>{JSON.stringify(request.toolInput, null, 2)}</code>
            </pre>
          </div>

          {/* Warning for high risk */}
          {request.riskLevel === "high" && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium">This action may have significant impact.</p>
                <p>Please review carefully before approving.</p>
              </div>
            </div>
          )}

          {/* Reject reason form */}
          {showRejectForm && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection Reason
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Explain why this action should not be taken..."
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t">
          <button
            onClick={handleReject}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50 font-medium"
          >
            {showRejectForm ? "Confirm Reject" : "Reject"}
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600 font-medium flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalDialog;
