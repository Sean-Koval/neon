'use client'

import { Download, Link as LinkIcon } from 'lucide-react'
import { useCallback } from 'react'
import { useToast } from '@/components/toast'
import type { CompareResponse } from '@/lib/types'

interface ExportDropdownProps {
  comparison: CompareResponse | undefined
  baselineId: string
  candidateId: string
}

/**
 * Export dropdown for downloading comparison results in JSON, CSV, or Markdown.
 * Also includes a copy-link button.
 */
export function ExportDropdown({
  comparison,
  baselineId,
  candidateId,
}: ExportDropdownProps) {
  const { addToast } = useToast()
  const disabled = !comparison

  const download = useCallback(
    (content: string, mimeType: string, ext: string) => {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comparison-${baselineId}-vs-${candidateId}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    },
    [baselineId, candidateId],
  )

  const handleExportJSON = useCallback(() => {
    if (!comparison) return
    download(JSON.stringify(comparison, null, 2), 'application/json', 'json')
  }, [comparison, download])

  const handleExportCSV = useCallback(() => {
    if (!comparison) return
    const rows = ['Case Name,Scorer,Baseline Score,Candidate Score,Delta,Direction']
    for (const item of comparison.regressions) {
      rows.push(
        `"${item.case_name}","${item.scorer}",${item.baseline_score},${item.candidate_score},${item.delta.toFixed(4)},regression`,
      )
    }
    for (const item of comparison.improvements) {
      rows.push(
        `"${item.case_name}","${item.scorer}",${item.baseline_score},${item.candidate_score},${item.delta.toFixed(4)},improvement`,
      )
    }
    download(rows.join('\n'), 'text/csv', 'csv')
  }, [comparison, download])

  const handleExportMarkdown = useCallback(() => {
    if (!comparison) return
    const lines: string[] = [
      '# Comparison Report',
      '',
      `**Baseline:** ${comparison.baseline.id}`,
      `**Candidate:** ${comparison.candidate.id}`,
      `**Overall Delta:** ${comparison.overall_delta >= 0 ? '+' : ''}${(comparison.overall_delta * 100).toFixed(1)}%`,
      `**Result:** ${comparison.passed ? 'PASSED' : 'FAILED'}`,
      `**Threshold:** ${(comparison.threshold * 100).toFixed(0)}%`,
      '',
    ]

    if (comparison.regressions.length > 0) {
      lines.push(`## Regressions (${comparison.regressions.length})`, '')
      lines.push('| Case Name | Scorer | Baseline | Candidate | Delta |')
      lines.push('|-----------|--------|----------|-----------|-------|')
      for (const item of comparison.regressions) {
        lines.push(
          `| ${item.case_name} | ${item.scorer} | ${(item.baseline_score * 100).toFixed(1)}% | ${(item.candidate_score * 100).toFixed(1)}% | ${(item.delta * 100).toFixed(1)}% |`,
        )
      }
      lines.push('')
    }

    if (comparison.improvements.length > 0) {
      lines.push(`## Improvements (${comparison.improvements.length})`, '')
      lines.push('| Case Name | Scorer | Baseline | Candidate | Delta |')
      lines.push('|-----------|--------|----------|-----------|-------|')
      for (const item of comparison.improvements) {
        lines.push(
          `| ${item.case_name} | ${item.scorer} | ${(item.baseline_score * 100).toFixed(1)}% | ${(item.candidate_score * 100).toFixed(1)}% | +${(item.delta * 100).toFixed(1)}% |`,
        )
      }
      lines.push('')
    }

    if (comparison.unchanged > 0) {
      lines.push(`## Unchanged: ${comparison.unchanged} cases`, '')
    }

    download(lines.join('\n'), 'text/markdown', 'md')
  }, [comparison, download])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      addToast('Comparison link copied to clipboard', 'success')
    })
  }, [addToast])

  return (
    <div className="flex items-center gap-2">
      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="btn btn-secondary text-sm"
        title="Copy comparison link"
      >
        <LinkIcon className="w-4 h-4" />
      </button>

      {/* Export dropdown */}
      <div className="relative group">
        <button
          type="button"
          disabled={disabled}
          className="btn btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        {!disabled && (
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
            <div className="bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[140px]">
              <button
                type="button"
                onClick={handleExportJSON}
                className="w-full px-3 py-2 text-sm text-left text-content-secondary hover:bg-surface-raised transition-colors"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="w-full px-3 py-2 text-sm text-left text-content-secondary hover:bg-surface-raised transition-colors"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="w-full px-3 py-2 text-sm text-left text-content-secondary hover:bg-surface-raised transition-colors"
              >
                Markdown
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
