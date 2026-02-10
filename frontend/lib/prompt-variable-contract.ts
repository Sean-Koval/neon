import type { PromptMessage, PromptVariable } from '@/lib/types'

export interface VariableValidationIssue {
  name: string
  message: string
}

const VARIABLE_PATH_REGEX = /\{\{\s*([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)\s*\}\}/g

export function extractVariablePaths(content: string): string[] {
  const paths = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = VARIABLE_PATH_REGEX.exec(content)) !== null) {
    paths.add(match[1])
  }
  return Array.from(paths).sort()
}

export function extractRootVariableNames(content: string): string[] {
  const roots = new Set<string>()
  for (const path of extractVariablePaths(content)) {
    roots.add(path.split('.')[0])
  }
  return Array.from(roots).sort()
}

export function inferVariableType(name: string): NonNullable<PromptVariable['type']> {
  const lower = name.toLowerCase()
  if (/(^|_)(messages|history|conversation|transcript)(_|$)/.test(lower)) {
    return 'messages'
  }
  if (/(^|_)(count|num|total|max|min|limit|size|length|amount|qty|age|year)(_|$)/.test(lower)) {
    return 'number'
  }
  if (/(^|_)(is_|has_|should_|enabled|flag)(_|$)/.test(lower)) {
    return 'boolean'
  }
  if (/(^|_)(tool|result|response|payload|context|metadata|config|json|object)(_|$)/.test(lower)) {
    return 'object'
  }
  return 'string'
}

function inferVariableSource(name: string): NonNullable<PromptVariable['source']> {
  const lower = name.toLowerCase()
  if (/(^|_)(messages|history|conversation|transcript|context|metadata)(_|$)/.test(lower)) {
    return 'runtime'
  }
  if (lower.includes('tool')) return 'tool'
  if (lower.includes('agent')) return 'agent'
  if (lower.includes('context') || lower.includes('metadata')) return 'runtime'
  return 'input'
}

function inferRendering(type: PromptVariable['type']): NonNullable<PromptVariable['rendering']> {
  switch (type) {
    case 'messages':
      return 'messages'
    case 'object':
    case 'tool_result':
    case 'agent_output':
    case 'context':
      return 'json'
    case 'string_array':
    case 'array':
      return 'join_lines'
    default:
      return 'text'
  }
}

export function buildVariableContracts(input: {
  detectedNames: string[]
  persisted?: PromptVariable[]
}): PromptVariable[] {
  const persisted = input.persisted || []
  const persistedMap = new Map(persisted.map((v) => [v.name, v]))

  const contracts = input.detectedNames.map((name) => {
    const existing = persistedMap.get(name)
    const type = existing?.type || inferVariableType(name)
    return {
      name,
      description: existing?.description,
      type,
      source: existing?.source || inferVariableSource(name),
      rendering: existing?.rendering || inferRendering(type),
      enum_values: existing?.enum_values,
      schema: existing?.schema,
      required: existing?.required ?? true,
      default: existing?.default,
    } as PromptVariable
  })

  for (const extra of persisted) {
    if (!contracts.some((c) => c.name === extra.name)) {
      contracts.push({
        ...extra,
        type: extra.type || inferVariableType(extra.name),
        source: extra.source || inferVariableSource(extra.name),
        rendering: extra.rendering || inferRendering(extra.type || inferVariableType(extra.name)),
      })
    }
  }

  return contracts.sort((a, b) => a.name.localeCompare(b.name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateVariablePayload(
  contracts: PromptVariable[],
  payload: Record<string, unknown>,
): VariableValidationIssue[] {
  const issues: VariableValidationIssue[] = []

  for (const contract of contracts) {
    const value = payload[contract.name]
    const hasValue = value !== undefined && value !== null && value !== ''

    if ((contract.required ?? true) && !hasValue) {
      issues.push({
        name: contract.name,
        message: 'Required value is missing',
      })
      continue
    }

    if (!hasValue) continue

    switch (contract.type) {
      case 'string':
        if (typeof value !== 'string') {
          issues.push({ name: contract.name, message: 'Expected string' })
        }
        break
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          issues.push({ name: contract.name, message: 'Expected number' })
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') {
          issues.push({ name: contract.name, message: 'Expected boolean' })
        }
        break
      case 'object':
      case 'tool_result':
      case 'agent_output':
      case 'context':
        if (!isRecord(value)) {
          issues.push({ name: contract.name, message: 'Expected object' })
        }
        break
      case 'array':
        if (!Array.isArray(value)) {
          issues.push({ name: contract.name, message: 'Expected array' })
        }
        break
      case 'string_array':
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          issues.push({ name: contract.name, message: 'Expected string[]' })
        }
        break
      case 'enum':
        if (typeof value !== 'string') {
          issues.push({ name: contract.name, message: 'Expected enum string' })
        } else if (contract.enum_values && contract.enum_values.length > 0 && !contract.enum_values.includes(value)) {
          issues.push({
            name: contract.name,
            message: `Expected one of: ${contract.enum_values.join(', ')}`,
          })
        }
        break
      case 'messages':
        if (
          !Array.isArray(value) ||
          value.some(
            (item) =>
              !isRecord(item) ||
              typeof item.role !== 'string' ||
              typeof item.content !== 'string',
          )
        ) {
          issues.push({ name: contract.name, message: 'Expected messages[] with role/content' })
        }
        break
      default:
        break
    }
  }

  return issues
}

function formatMessages(value: unknown): string {
  if (!Array.isArray(value)) return String(value ?? '')
  const messages = value as PromptMessage[]
  return messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n')
}

function formatForRender(value: unknown, contract?: PromptVariable): string {
  if (value === undefined || value === null) return ''

  const rendering = contract?.rendering || inferRendering(contract?.type)

  if (rendering === 'messages') return formatMessages(value)
  if (rendering === 'join_lines' && Array.isArray(value)) {
    return value.map((item) => String(item)).join('\n')
  }
  if (rendering === 'json' || typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function getPathValue(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!isRecord(acc)) return undefined
    return acc[key]
  }, payload)
}

export function renderPromptTextWithPayload(
  content: string,
  payload: Record<string, unknown>,
  contracts: PromptVariable[],
): string {
  const contractMap = new Map(contracts.map((c) => [c.name, c]))
  return content.replace(VARIABLE_PATH_REGEX, (_, path: string) => {
    const value = getPathValue(payload, path)
    if (value === undefined || value === null) return `{{${path}}}`
    const root = path.split('.')[0]
    return formatForRender(value, contractMap.get(root))
  })
}

export function renderChatMessagesWithPayload(
  messages: PromptMessage[],
  payload: Record<string, unknown>,
  contracts: PromptVariable[],
): PromptMessage[] {
  return messages.map((msg) => ({
    ...msg,
    content: renderPromptTextWithPayload(msg.content, payload, contracts),
  }))
}

export function parseJsonPayload(input: string): {
  value: Record<string, unknown> | null
  error: string | null
} {
  if (!input.trim()) return { value: {}, error: null }
  try {
    const parsed = JSON.parse(input)
    if (!isRecord(parsed)) {
      return { value: null, error: 'Payload must be a JSON object at the top level.' }
    }
    return { value: parsed, error: null }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : 'Invalid JSON payload',
    }
  }
}

export function buildSamplePayload(contracts: PromptVariable[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const contract of contracts) {
    if (contract.default !== undefined) {
      result[contract.name] = contract.default
      continue
    }
    switch (contract.type) {
      case 'number':
        result[contract.name] = 0
        break
      case 'boolean':
        result[contract.name] = false
        break
      case 'string_array':
      case 'array':
        result[contract.name] = []
        break
      case 'object':
      case 'tool_result':
      case 'agent_output':
      case 'context':
        result[contract.name] = {}
        break
      case 'messages':
        result[contract.name] = [{ role: 'user', content: 'Example message' }]
        break
      case 'enum':
        result[contract.name] = contract.enum_values?.[0] || ''
        break
      default:
        result[contract.name] = ''
        break
    }
  }
  return result
}
