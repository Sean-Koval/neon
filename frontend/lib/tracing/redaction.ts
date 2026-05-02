const DEFAULT_REDACTION_RULES = [
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED:email]',
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED:ssn]',
  },
  {
    pattern: /\b(?:sk|pk)_(?:live|test|proj)?[_-]?[A-Za-z0-9_-]{16,}\b/g,
    replacement: '[REDACTED:api_key]',
  },
]

const DEFAULT_REDACTED_KEYS = new Set([
  'gen_ai.prompt',
  'gen_ai.completion',
  'tool.input',
  'tool.output',
  'gen_ai.input.messages',
  'gen_ai.output.messages',
  'neon.state_snapshots',
  'neon.artifacts',
  'retrieval.chunks',
])

export function isTraceMaskingEnabled(): boolean {
  const value = process.env.NEON_TRACE_MASKING_ENABLED
  return value === '1' || value === 'true'
}

export function redactString(value: string): string {
  return DEFAULT_REDACTION_RULES.reduce(
    (maskedValue, rule) => maskedValue.replace(rule.pattern, rule.replacement),
    value,
  )
}

export function redactTraceAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  if (!isTraceMaskingEnabled()) return attributes

  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      DEFAULT_REDACTED_KEYS.has(key) ? redactString(value) : value,
    ]),
  )
}
