"use client";

/**
 * Start Eval Run Dialog
 *
 * Modal dialog for configuring and starting a new eval run.
 */

import { useState } from "react";
import {
  X,
  Play,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { StartEvalRunRequest } from "@/lib/types";

interface StartEvalRunDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (request: StartEvalRunRequest) => void;
  isStarting?: boolean;
  error?: string | null;
}

/**
 * Default scorers available
 */
const DEFAULT_SCORERS = [
  { id: "tool_selection", name: "Tool Selection", description: "Evaluates correct tool usage" },
  { id: "response_quality", name: "Response Quality", description: "LLM judge for output quality" },
  { id: "latency", name: "Latency", description: "Response time within threshold" },
  { id: "token_efficiency", name: "Token Efficiency", description: "Token usage optimization" },
  { id: "contains", name: "Contains Keywords", description: "Output contains expected text" },
];

export function StartEvalRunDialog({
  isOpen,
  onClose,
  onStart,
  isStarting,
  error,
}: StartEvalRunDialogProps) {
  const [projectId, setProjectId] = useState("default");
  const [agentId, setAgentId] = useState("");
  const [agentVersion, setAgentVersion] = useState("latest");
  const [selectedScorers, setSelectedScorers] = useState<string[]>(["tool_selection", "response_quality"]);
  const [parallel, setParallel] = useState(true);
  const [parallelism, setParallelism] = useState(5);

  // Dataset items
  const [datasetItems, setDatasetItems] = useState<
    Array<{ input: string; expected: string }>
  >([{ input: "", expected: "" }]);

  const addDatasetItem = () => {
    setDatasetItems([...datasetItems, { input: "", expected: "" }]);
  };

  const removeDatasetItem = (index: number) => {
    setDatasetItems(datasetItems.filter((_, i) => i !== index));
  };

  const updateDatasetItem = (
    index: number,
    field: "input" | "expected",
    value: string
  ) => {
    setDatasetItems(
      datasetItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const toggleScorer = (scorerId: string) => {
    setSelectedScorers((prev) =>
      prev.includes(scorerId)
        ? prev.filter((s) => s !== scorerId)
        : [...prev, scorerId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build request
    const request: StartEvalRunRequest = {
      projectId,
      agentId,
      agentVersion: agentVersion || "latest",
      dataset: {
        items: datasetItems
          .filter((item) => item.input.trim())
          .map((item) => ({
            input: { query: item.input },
            expected: item.expected ? { output: item.expected } : undefined,
          })),
      },
      scorers: selectedScorers,
      parallel,
      parallelism,
    };

    onStart(request);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Start Eval Run</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-8rem)]">
          <div className="p-6 space-y-6">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            {/* Agent config */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Agent ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="my-agent"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Agent Version
                </label>
                <input
                  type="text"
                  value={agentVersion}
                  onChange={(e) => setAgentVersion(e.target.value)}
                  placeholder="latest"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Dataset */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  Test Cases <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addDatasetItem}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus className="w-4 h-4" />
                  Add Case
                </button>
              </div>
              <div className="space-y-3">
                {datasetItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={item.input}
                        onChange={(e) =>
                          updateDatasetItem(index, "input", e.target.value)
                        }
                        placeholder="Input (e.g., 'What is the weather?')"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={item.expected}
                        onChange={(e) =>
                          updateDatasetItem(index, "expected", e.target.value)
                        }
                        placeholder="Expected output (optional)"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {datasetItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDatasetItem(index)}
                        className="self-start p-2 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Scorers */}
            <div>
              <label className="block text-sm font-medium mb-2">Scorers</label>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_SCORERS.map((scorer) => (
                  <label
                    key={scorer.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedScorers.includes(scorer.id)
                        ? "border-blue-500 bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScorers.includes(scorer.id)}
                      onChange={() => toggleScorer(scorer.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{scorer.name}</p>
                      <p className="text-xs text-gray-500">{scorer.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Execution options */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={parallel}
                  onChange={(e) => setParallel(e.target.checked)}
                />
                <span className="text-sm">Run in parallel</span>
              </label>
              {parallel && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Workers:</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={parallelism}
                    onChange={(e) => setParallelism(Number(e.target.value))}
                    className="w-16 px-2 py-1 border rounded text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isStarting || !agentId || datasetItems.every((d) => !d.input.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Eval Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StartEvalRunDialog;
