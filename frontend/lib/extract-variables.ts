/**
 * Extract template variables from prompt content.
 * Scans for {{variable_name}} patterns and infers types.
 */

export interface ExtractedVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'messages'
  required: boolean
  default: string
}

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)\s*\}\}/g

/**
 * Extract and deduplicate variables from a template string.
 */
export function extractVariables(content: string): ExtractedVariable[] {
  const names = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = VARIABLE_REGEX.exec(content)) !== null) {
    names.add(match[1].split('.')[0])
  }

  return Array.from(names)
    .sort()
    .map((name) => ({
      name,
      type: inferType(name),
      required: true,
      default: '',
    }))
}

/**
 * Extract variables from chat messages (array of role/content).
 */
export function extractVariablesFromMessages(
  messages: Array<{ role: string; content: string }>,
): ExtractedVariable[] {
  const combined = messages.map((m) => m.content).join('\n')
  return extractVariables(combined)
}

/**
 * Infer variable type from its name using heuristics.
 */
function inferType(
  name: string,
): 'string' | 'number' | 'boolean' | 'object' | 'messages' {
  const lower = name.toLowerCase()
  if (/(^|_)(messages|history|conversation|transcript)(_|$)/.test(lower)) {
    return 'messages'
  }
  if (/count|num|total|max|min|limit|size|length|amount|quantity|age|year/.test(lower)) {
    return 'number'
  }
  if (/(^|_)(is_|has_|should_|enabled|flag)(_|$)/.test(lower)) {
    return 'boolean'
  }
  if (/config|options|data|params|settings|metadata|context|schema|result|payload|json/.test(lower)) {
    return 'object'
  }
  return 'string'
}

/**
 * Highlight {{variables}} in content by wrapping them in spans.
 * Returns an array of React-renderable segments.
 */
export function highlightVariables(content: string): Array<{ text: string; isVariable: boolean }> {
  const segments: Array<{ text: string; isVariable: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const regex = /\{\{\s*([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)\s*\}\}/g

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index), isVariable: false })
    }
    segments.push({ text: match[0], isVariable: true })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), isVariable: false })
  }

  return segments
}
