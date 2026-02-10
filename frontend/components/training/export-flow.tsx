'use client'

import { clsx } from 'clsx'
import { Download, Loader2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc'

const EXPORT_FORMATS = [
  { id: 'openai' as const, label: 'OpenAI Fine-Tune', desc: 'SFT format for OpenAI fine-tuning API', ext: '.jsonl' },
  { id: 'huggingface' as const, label: 'HuggingFace TRL', desc: 'SFT / DPO / KTO formats for TRL Trainer classes', ext: '.jsonl' },
  { id: 'dspy' as const, label: 'DSPy', desc: 'Prompt/completion pairs for DSPy optimization', ext: '.json' },
  { id: 'agent-lightning' as const, label: 'Agent Lightning', desc: 'AgentOps training format', ext: '.jsonl' },
  { id: 'custom' as const, label: 'Custom JSON', desc: 'Define your own JSON template', ext: '.json / .jsonl' },
] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]['id']

interface ExportFlowProps {
  preselectedDataset?: string
  onGoToDatasets?: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ExportFlow({ preselectedDataset, onGoToDatasets }: ExportFlowProps) {
  const { data: datasetsData, isLoading: datasetsLoading } = trpc.datasets.list.useQuery({ status: 'ready' })
  const { data: historyData } = trpc.datasets.exportHistory.useQuery()

  const [selectedDataset, setSelectedDataset] = useState(preselectedDataset ?? '')
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('openai')
  const [includeTest, setIncludeTest] = useState(true)
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [shuffleExamples, setShuffleExamples] = useState(false)
  const [customTemplate, setCustomTemplate] = useState('{\n  "instruction": "{{input}}",\n  "response": "{{output}}",\n  "source": "{{source_type}}",\n  "agent": "{{agent_name}}"\n}')

  const datasets = datasetsData?.datasets ?? []
  const exports = historyData?.exports ?? []
  const currentDataset = datasets.find((d) => d.id === selectedDataset)

  const { data: previewData } = trpc.datasets.getPreview.useQuery(
    { datasetId: selectedDataset, format: selectedFormat, customTemplate: selectedFormat === 'custom' ? customTemplate : undefined },
    { enabled: !!selectedDataset },
  )

  const exportMutation = trpc.datasets.export.useMutation()

  const handleExport = useCallback(async () => {
    if (!selectedDataset) return
    await exportMutation.mutateAsync({
      datasetId: selectedDataset,
      format: selectedFormat,
      options: {
        includeTestSplit: includeTest,
        includeMetadataHeader: includeMetadata,
        shuffleExamples,
      },
      customTemplate: selectedFormat === 'custom' ? customTemplate : undefined,
    })
  }, [selectedDataset, selectedFormat, includeTest, includeMetadata, shuffleExamples, customTemplate, exportMutation])

  if (datasetsLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-full bg-surface-overlay rounded-md" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-surface-overlay rounded-lg" />)}
        </div>
        <div className="h-32 bg-surface-overlay rounded-lg" />
      </div>
    )
  }

  if (!datasets.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Download className="w-12 h-12 text-content-muted mb-4" />
        <h3 className="text-lg font-medium text-content-primary">No datasets to export</h3>
        <p className="text-sm text-content-muted mt-2 max-w-sm">
          Create a dataset first to prepare data for export. Go to the Datasets tab to get started.
        </p>
        {onGoToDatasets && (
          <button type="button" onClick={onGoToDatasets} className="btn btn-primary mt-4">
            Go to Datasets
          </button>
        )}
      </div>
    )
  }

  const isStepsEnabled = !!selectedDataset

  return (
    <div className="space-y-8">
      {/* Step 1: Select Dataset */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-content-primary">Step 1: Select Dataset</h3>
        <select
          value={selectedDataset}
          onChange={(e) => setSelectedDataset(e.target.value)}
          className="w-full h-9 text-sm border border-border rounded-md px-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
        >
          <option value="">Select a dataset...</option>
          {datasets.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.name} · {(ds.trainCount + ds.testCount).toLocaleString()} examples · {ds.format.toUpperCase()}
            </option>
          ))}
        </select>
        {currentDataset && (
          <div className="bg-surface-overlay/20 rounded-md p-3 text-sm text-content-muted">
            {(currentDataset.trainCount + currentDataset.testCount).toLocaleString()} examples · {currentDataset.trainTestRatio}/{100 - currentDataset.trainTestRatio} split · {currentDataset.agentId}
          </div>
        )}
      </div>

      {/* Step 2: Choose Format */}
      <div className={clsx('space-y-3 transition-opacity', !isStepsEnabled && 'opacity-40 pointer-events-none')}>
        <h3 className="text-sm font-medium text-content-primary">Step 2: Choose Format</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              onClick={() => setSelectedFormat(fmt.id)}
              className={clsx(
                'text-left rounded-lg border p-3 transition-all',
                selectedFormat === fmt.id
                  ? 'border-primary-500 ring-1 ring-primary-500/30'
                  : 'border-border hover:border-content-muted',
              )}
            >
              <div className="flex items-start gap-2">
                <div className={clsx(
                  'w-3 h-3 rounded-full border-2 mt-0.5 flex-shrink-0',
                  selectedFormat === fmt.id ? 'border-primary-500 bg-primary-500' : 'border-content-muted',
                )} />
                <div>
                  <p className="text-sm font-semibold text-content-primary">{fmt.label}</p>
                  <p className="text-xs text-content-muted mt-0.5">{fmt.desc}</p>
                  <p className="text-[10px] text-content-muted mt-2">{fmt.ext}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Custom template editor */}
        {selectedFormat === 'custom' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-content-primary block">Template *</label>
            <textarea
              value={customTemplate}
              onChange={(e) => setCustomTemplate(e.target.value)}
              className="w-full font-mono text-xs min-h-[120px] resize-y rounded-lg border border-border p-3 bg-surface-card text-content-primary focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-content-muted">
              Available variables:{' '}
              {['{{input}}', '{{output}}', '{{source_type}}', '{{agent_name}}', '{{score}}', '{{trace_id}}', '{{created_at}}'].map((v) => (
                <code key={v} className="bg-surface-overlay/30 px-1 rounded font-mono text-[10px] mr-1">{v}</code>
              ))}
            </p>
          </div>
        )}
      </div>

      {/* Step 3: Preview & Export */}
      <div className={clsx('space-y-4 transition-opacity', !isStepsEnabled && 'opacity-40 pointer-events-none')}>
        <h3 className="text-sm font-medium text-content-primary">Step 3: Preview & Export</h3>

        {/* Preview */}
        {previewData && (
          <div className="bg-surface-overlay/20 rounded-lg p-4 overflow-x-auto">
            <pre className="font-mono text-xs text-content-secondary">
              {previewData.preview.map((item, i) => (
                <div key={i} className="mb-2">
                  <span className="text-content-muted/50 select-none mr-3">{i + 1}</span>
                  {JSON.stringify(item, null, 2)}
                </div>
              ))}
            </pre>
          </div>
        )}

        {/* Export options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} className="accent-primary-500" />
            <span className="text-content-primary">Include test split as separate file</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={includeMetadata} onChange={(e) => setIncludeMetadata(e.target.checked)} className="accent-primary-500" />
            <span className="text-content-primary">Add metadata header (format, date, dataset name)</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={shuffleExamples} onChange={(e) => setShuffleExamples(e.target.checked)} className="accent-primary-500" />
            <span className="text-content-primary">Shuffle examples before export</span>
          </label>
        </div>

        {/* Download button */}
        <button
          type="button"
          onClick={handleExport}
          disabled={!selectedDataset || exportMutation.isPending}
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {exportMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
          ) : exportMutation.isSuccess ? (
            <><Download className="w-4 h-4" /> Export Ready - Download</>
          ) : (
            <><Download className="w-4 h-4" /> Download Export</>
          )}
        </button>
      </div>

      {/* Export History */}
      {exports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-content-primary">Recent Exports</h3>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-raised/50">
                  <th className="text-left py-2.5 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Dataset</th>
                  <th className="text-left py-2.5 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Format</th>
                  <th className="text-left py-2.5 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Size</th>
                  <th className="text-left py-2.5 px-4 text-content-muted font-medium text-xs uppercase tracking-wider">Date</th>
                  <th className="py-2.5 px-4" />
                </tr>
              </thead>
              <tbody>
                {exports.slice(0, 10).map((exp) => (
                  <tr key={exp.id} className="border-b border-border/50 last:border-0 hover:bg-surface-overlay/50">
                    <td className="py-2.5 px-4 text-content-primary font-medium">{exp.datasetName}</td>
                    <td className="py-2.5 px-4 text-content-secondary">{exp.format}</td>
                    <td className="py-2.5 px-4 text-content-muted">{formatBytes(exp.fileSize)}</td>
                    <td className="py-2.5 px-4 text-content-muted">
                      {new Date(exp.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-2.5 px-4">
                      <button type="button" className="btn btn-ghost text-xs p-1">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-content-muted">Exports cached for 30 days.</p>
        </div>
      )}
    </div>
  )
}
