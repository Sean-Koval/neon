"use client";

/**
 * Span Detail Component
 *
 * Shows detailed information about a selected span.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Clock,
  MessageSquare,
  Wrench,
  Database,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

/**
 * Span data structure
 */
interface Span {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  span_type: "span" | "generation" | "tool" | "retrieval" | "event";
  timestamp: string;
  end_time: string | null;
  duration_ms: number;
  status: "unset" | "ok" | "error";
  status_message?: string;
  // LLM fields
  model?: string;
  input?: string;
  output?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  // Tool fields
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  // Attributes
  attributes?: Record<string, string>;
}

interface SpanDetailProps {
  span: Span;
  onClose?: () => void;
}

/**
 * Get status icon and color
 */
function getStatusInfo(status: Span["status"]) {
  switch (status) {
    case "ok":
      return { Icon: CheckCircle, color: "text-green-500", label: "Success" };
    case "error":
      return { Icon: XCircle, color: "text-red-500", label: "Error" };
    default:
      return { Icon: AlertCircle, color: "text-gray-400", label: "Unset" };
  }
}

/**
 * Get span type icon
 */
function getTypeIcon(type: Span["span_type"]) {
  switch (type) {
    case "generation":
      return MessageSquare;
    case "tool":
      return Wrench;
    case "retrieval":
      return Database;
    case "event":
      return Zap;
    default:
      return Clock;
  }
}

/**
 * Collapsible section
 */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span className="font-medium text-sm">{title}</span>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/**
 * Copyable code block
 */
function CodeBlock({ content, language = "json" }: { content: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Try to format JSON
  let formatted = content;
  if (language === "json") {
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // Keep original if not valid JSON
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 hover:bg-gray-200 rounded"
        title="Copy"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4 text-gray-400" />
        )}
      </button>
      <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto max-h-[300px] overflow-y-auto">
        <code>{formatted}</code>
      </pre>
    </div>
  );
}

/**
 * Key-value pair row
 */
function KVRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined) return null;

  return (
    <div className="flex py-1.5 text-sm">
      <div className="w-32 text-gray-500 flex-shrink-0">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}

/**
 * Span Detail Component
 */
export function SpanDetail({ span, onClose }: SpanDetailProps) {
  const statusInfo = getStatusInfo(span.status);
  const TypeIcon = getTypeIcon(span.span_type);

  return (
    <div className="h-full flex flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <TypeIcon className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium truncate" title={span.name}>
            {span.name}
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded text-gray-500"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Status banner */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-2",
            span.status === "error" ? "bg-red-50" : "bg-gray-50"
          )}
        >
          <statusInfo.Icon className={cn("w-4 h-4", statusInfo.color)} />
          <span className="text-sm">{statusInfo.label}</span>
          {span.status_message && (
            <span className="text-sm text-gray-500 truncate">
              - {span.status_message}
            </span>
          )}
        </div>

        {/* Overview */}
        <Section title="Overview">
          <div className="space-y-1">
            <KVRow label="Span ID" value={span.span_id} />
            <KVRow label="Type" value={span.span_type} />
            <KVRow label="Duration" value={`${span.duration_ms}ms`} />
            <KVRow
              label="Started"
              value={new Date(span.timestamp).toLocaleString()}
            />
            {span.end_time && (
              <KVRow
                label="Ended"
                value={new Date(span.end_time).toLocaleString()}
              />
            )}
          </div>
        </Section>

        {/* LLM Generation Details */}
        {span.span_type === "generation" && (
          <>
            <Section title="Model">
              <div className="space-y-1">
                <KVRow label="Model" value={span.model} />
                <KVRow label="Input Tokens" value={span.input_tokens} />
                <KVRow label="Output Tokens" value={span.output_tokens} />
                <KVRow label="Total Tokens" value={span.total_tokens} />
                {span.cost_usd && (
                  <KVRow label="Cost" value={`$${span.cost_usd.toFixed(4)}`} />
                )}
              </div>
            </Section>

            {span.input && (
              <Section title="Input">
                <CodeBlock content={span.input} />
              </Section>
            )}

            {span.output && (
              <Section title="Output">
                <CodeBlock content={span.output} />
              </Section>
            )}
          </>
        )}

        {/* Tool Call Details */}
        {span.span_type === "tool" && (
          <>
            <Section title="Tool">
              <KVRow label="Tool Name" value={span.tool_name} />
            </Section>

            {span.tool_input && (
              <Section title="Input">
                <CodeBlock content={span.tool_input} />
              </Section>
            )}

            {span.tool_output && (
              <Section title="Output">
                <CodeBlock content={span.tool_output} />
              </Section>
            )}
          </>
        )}

        {/* Attributes */}
        {span.attributes && Object.keys(span.attributes).length > 0 && (
          <Section title="Attributes" defaultOpen={false}>
            <div className="space-y-1">
              {Object.entries(span.attributes).map(([key, value]) => (
                <KVRow key={key} label={key} value={value} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

export default SpanDetail;
