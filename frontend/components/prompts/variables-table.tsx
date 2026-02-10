'use client'

import { Check } from 'lucide-react'
import { memo } from 'react'
import type { PromptVariable } from '@/lib/types'

interface VariablesTableProps {
  variables: PromptVariable[]
  editable?: boolean
  onChange?: (variables: PromptVariable[]) => void
}

function VariablesTableComponent({
  variables,
  editable = false,
  onChange,
}: VariablesTableProps) {
  if (variables.length === 0) return null

  const updateVariable = (
    name: string,
    updates: Partial<PromptVariable>,
  ) => {
    if (!onChange) return
    onChange(
      variables.map((v) => (v.name === name ? { ...v, ...updates } : v)),
    )
  }

  const variableTypes: Array<NonNullable<PromptVariable['type']>> = [
    'string',
    'number',
    'boolean',
    'object',
    'array',
    'string_array',
    'enum',
    'messages',
    'tool_result',
    'agent_output',
    'context',
  ]

  const variableSources: Array<NonNullable<PromptVariable['source']>> = [
    'input',
    'runtime',
    'tool',
    'agent',
    'system',
    'memory',
    'unknown',
  ]

  const renderingModes: Array<NonNullable<PromptVariable['rendering']>> = [
    'text',
    'json',
    'join_lines',
    'messages',
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold text-content-primary mb-3">
        Variable Contract ({variables.length})
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900/72">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border dark:border-slate-700/80 bg-surface-raised/60 dark:bg-slate-900/95">
              <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Name</th>
              <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Type</th>
              <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Source</th>
              <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Render</th>
              <th className="text-center py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Required</th>
              <th className="text-left py-2 px-3 text-xs text-content-muted font-medium uppercase tracking-wider">Default</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((v) => (
              <tr key={v.name} className="border-b border-border/50 dark:border-slate-700/70 odd:bg-surface-card even:bg-surface-raised/10 dark:odd:bg-slate-900/72 dark:even:bg-slate-800/35">
                <td className="py-2 px-3 font-mono text-content-primary">{v.name}</td>
                <td className="py-2 px-3 text-content-muted">
                  {editable ? (
                    <select
                      value={v.type || 'string'}
                      onChange={(e) =>
                        updateVariable(v.name, {
                          type: e.target.value as PromptVariable['type'],
                        })
                      }
                      className="h-8 rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900 px-2 text-xs text-content-secondary focus:outline-none"
                    >
                      {variableTypes.map((t) => (
                        <option key={`${v.name}-type-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (v.type || 'string')
                  )}
                </td>
                <td className="py-2 px-3 text-content-muted">
                  {editable ? (
                    <select
                      value={v.source || 'input'}
                      onChange={(e) =>
                        updateVariable(v.name, {
                          source: e.target.value as PromptVariable['source'],
                        })
                      }
                      className="h-8 rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900 px-2 text-xs text-content-secondary focus:outline-none"
                    >
                      {variableSources.map((s) => (
                        <option key={`${v.name}-source-${s}`} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (v.source || 'input')
                  )}
                </td>
                <td className="py-2 px-3 text-content-muted">
                  {editable ? (
                    <select
                      value={v.rendering || 'text'}
                      onChange={(e) =>
                        updateVariable(v.name, {
                          rendering: e.target.value as PromptVariable['rendering'],
                        })
                      }
                      className="h-8 rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900 px-2 text-xs text-content-secondary focus:outline-none"
                    >
                      {renderingModes.map((r) => (
                        <option key={`${v.name}-render-${r}`} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (v.rendering || 'text')
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={v.required ?? true}
                      onChange={(e) =>
                        updateVariable(v.name, { required: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border dark:border-slate-700/80 bg-surface-card"
                    />
                  ) : (
                    v.required && (
                      <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                    )
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-content-muted">
                  {editable ? (
                    <input
                      type="text"
                      value={v.default === undefined ? '' : String(v.default)}
                      onChange={(e) =>
                        updateVariable(v.name, {
                          default: e.target.value,
                        })
                      }
                      placeholder="default"
                      className="h-8 w-full rounded-md border border-border dark:border-slate-700/80 bg-surface-card dark:bg-slate-900 px-2 text-xs text-content-secondary focus:outline-none"
                    />
                  ) : (
                    v.default === undefined || v.default === '' ? '\u2014' : String(v.default)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const VariablesTable = memo(VariablesTableComponent)
