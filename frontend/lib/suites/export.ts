import type { EvalCase, EvalSuite } from '@/lib/types'

export type SuiteExportFormat = 'typescript' | 'python'

function serializeJson(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent)
}

function quote(value: string | null | undefined): string {
  return JSON.stringify(value ?? '')
}

function indentLines(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function toFileStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildTsScorerRegistry(suite: EvalSuite): {
  imports: string[]
  scorers: Array<[string, string]>
} {
  const imports = new Set<string>(['defineSuite', 'defineTest'])
  const scorers = new Map<string, string>()

  const ensure = (name: string, expr: string, imported?: string) => {
    if (!scorers.has(name)) {
      scorers.set(name, expr)
    }
    if (imported) {
      imports.add(imported)
    }
  }

  const registerScorerName = (name: string) => {
    switch (name) {
      case 'tool_selection':
        ensure(name, 'toolSelectionScorer()', 'toolSelectionScorer')
        break
      case 'reasoning':
        ensure(
          name,
          'llmJudge({ prompt: "Score reasoning quality from 0-1 based on coherence, decomposition, and completeness." })',
          'llmJudge',
        )
        break
      case 'grounding':
        ensure(
          name,
          'llmJudge({ prompt: "Score factual grounding from 0-1 based on evidence support and hallucination resistance." })',
          'llmJudge',
        )
        break
      case 'efficiency':
        ensure(name, 'tokenEfficiencyScorer()', 'tokenEfficiencyScorer')
        break
      case 'custom':
        ensure(
          name,
          'llmJudge({ prompt: "Score this response from 0-1 using the custom scorer rubric for the suite." })',
          'llmJudge',
        )
        break
      default:
        break
    }
  }

  for (const scorer of suite.default_scorers) {
    registerScorerName(scorer)
  }

  for (const testCase of suite.cases) {
    for (const scorer of testCase.scorers) {
      registerScorerName(scorer)
    }
    if (testCase.expected_output_contains?.length) {
      ensure(
        `${testCase.id}_contains`,
        `contains(${serializeJson(testCase.expected_output_contains)})`,
        'contains',
      )
    }
    if (testCase.expected_output_pattern) {
      ensure(
        `${testCase.id}_pattern`,
        `regex(new RegExp(${quote(testCase.expected_output_pattern)}))`,
        'regex',
      )
    }
  }

  return {
    imports: Array.from(imports).sort(),
    scorers: Array.from(scorers.entries()),
  }
}

function renderTypeScriptTest(testCase: EvalCase): string {
  const lines: string[] = [
    'defineTest({',
    `  name: ${quote(testCase.name)},`,
  ]

  if (testCase.description) {
    lines.push(`  description: ${quote(testCase.description)},`)
  }

  lines.push(`  input: ${indentLines(serializeJson(testCase.input), 2).trimStart()},`)

  const expectedLines: string[] = []
  if (testCase.expected_tools) {
    expectedLines.push(`toolCalls: ${serializeJson(testCase.expected_tools)}`)
  }
  if (testCase.expected_output_contains?.length) {
    expectedLines.push(
      `outputContains: ${serializeJson(testCase.expected_output_contains)}`,
    )
  }
  if (testCase.expected_output_pattern) {
    expectedLines.push(
      `pattern: new RegExp(${quote(testCase.expected_output_pattern)})`,
    )
  }
  if (expectedLines.length > 0) {
    lines.push('  expected: {')
    for (const line of expectedLines) {
      lines.push(`    ${line},`)
    }
    lines.push('  },')
  }

  if (testCase.expected_tool_sequence?.length) {
    lines.push(
      `  // Expected tool sequence: ${serializeJson(testCase.expected_tool_sequence)},`,
    )
  }

  const scorerRefs = [
    ...testCase.scorers,
    ...(testCase.expected_output_contains?.length
      ? [`${testCase.id}_contains`]
      : []),
    ...(testCase.expected_output_pattern ? [`${testCase.id}_pattern`] : []),
  ]
  if (scorerRefs.length > 0) {
    lines.push(`  scorers: ${serializeJson(scorerRefs)},`)
  }

  lines.push(`  timeout: ${testCase.timeout_seconds * 1000},`)
  lines.push('})')
  return lines.join('\n')
}

export function renderTypeScriptSuiteExport(suite: EvalSuite): string {
  const { imports, scorers } = buildTsScorerRegistry(suite)
  const testDefinitions = suite.cases.map((testCase, index) => {
    const constName = `test${index + 1}`
    return `const ${constName} = ${renderTypeScriptTest(testCase)}`
  })

  const scorerObject =
    scorers.length > 0
      ? `const scorers = {\n${scorers
          .map(([name, expr]) => `  ${JSON.stringify(name)}: ${expr},`)
          .join('\n')}\n}\n`
      : ''

  return `import { ${imports.join(', ')} } from '@neon/sdk'

${testDefinitions.join('\n\n')}

${scorerObject}export const suite = defineSuite({
  name: ${quote(suite.name)},
  description: ${suite.description ? quote(suite.description) : 'undefined'},
  tests: [${testDefinitions.map((_, index) => `test${index + 1}`).join(', ')}],
${scorers.length > 0 ? '  scorers,\n' : ''}  config: {
    agentId: ${quote(suite.agent_id)},
    timeout: ${suite.default_timeout_seconds * 1000},
${suite.parallel ? '    parallel: 4,\n' : ''}  },
})
`
}

function renderPythonScorerList(testCase: EvalCase): {
  imports: string[]
  entries: string[]
} {
  const imports = new Set<string>()
  const entries: string[] = []

  for (const scorer of testCase.scorers) {
    switch (scorer) {
      case 'tool_selection':
        imports.add('tool_selection_scorer')
        entries.push(
          testCase.expected_tools?.length
            ? `tool_selection_scorer(${serializeJson(testCase.expected_tools)})`
            : 'tool_selection_scorer()',
        )
        break
      case 'reasoning':
        imports.add('LLMJudgeConfig')
        imports.add('llm_judge')
        entries.push(
          'llm_judge(LLMJudgeConfig(prompt="Score reasoning quality from 0-1 based on coherence, decomposition, and completeness.", model="claude-3-5-sonnet"))',
        )
        break
      case 'grounding':
        imports.add('LLMJudgeConfig')
        imports.add('llm_judge')
        entries.push(
          'llm_judge(LLMJudgeConfig(prompt="Score factual grounding from 0-1 based on evidence support and hallucination resistance.", model="claude-3-5-sonnet"))',
        )
        break
      case 'efficiency':
        imports.add('token_efficiency_scorer')
        entries.push('token_efficiency_scorer()')
        break
      case 'custom':
        imports.add('LLMJudgeConfig')
        imports.add('llm_judge')
        entries.push(
          'llm_judge(LLMJudgeConfig(prompt="Score this response from 0-1 using the custom scorer rubric for the suite.", model="claude-3-5-sonnet"))',
        )
        break
      default:
        break
    }
  }

  return { imports: Array.from(imports).sort(), entries }
}

function renderPythonTest(testCase: EvalCase): {
  imports: string[]
  body: string
} {
  const { imports, entries } = renderPythonScorerList(testCase)
  const lines: string[] = ['define_test(']
  lines.push('    suite,')
  lines.push(`    name=${quote(testCase.name)},`)
  if (testCase.description) {
    lines.push(`    description=${quote(testCase.description)},`)
  }
  lines.push(`    input=${indentLines(serializeJson(testCase.input), 4).trimStart()},`)
  if (testCase.expected_tools) {
    lines.push(`    expected_tools=${serializeJson(testCase.expected_tools)},`)
  }
  if (testCase.expected_tool_sequence?.length) {
    lines.push(
      `    expected_tool_sequence=${serializeJson(testCase.expected_tool_sequence)},`,
    )
  }
  if (testCase.expected_output_contains?.length) {
    lines.push(
      `    expected_output_contains=${serializeJson(testCase.expected_output_contains)},`,
    )
  }
  if (testCase.expected_output_pattern) {
    lines.push(
      `    expected_output_pattern=${quote(testCase.expected_output_pattern)},`,
    )
  }
  if (entries.length > 0) {
    lines.push('    scorers=[')
    for (const entry of entries) {
      lines.push(`        ${entry},`)
    }
    lines.push('    ],')
  }
  lines.push(`    min_score=${testCase.min_score},`)
  lines.push(`    timeout_seconds=${testCase.timeout_seconds},`)
  if (testCase.tags.length > 0) {
    lines.push(`    tags=${serializeJson(testCase.tags)},`)
  }
  lines.push(')')
  return { imports, body: lines.join('\n') }
}

export function renderPythonSuiteExport(suite: EvalSuite): string {
  const testBlocks = suite.cases.map((testCase) => renderPythonTest(testCase))
  const scorerImports = Array.from(
    new Set(testBlocks.flatMap((block) => block.imports)),
  ).sort()

  return `# Generated by Neon suite export.

from neon_sdk import define_suite, define_test
${scorerImports.length > 0 ? `from neon_sdk.scorers import ${scorerImports.join(', ')}\n` : ''}
suite = define_suite(
    name=${quote(suite.name)},
    description=${quote(suite.description ?? '')},
    agent_id=${quote(suite.agent_id)},
    default_scorers=${serializeJson(suite.default_scorers)},
    default_min_score=${suite.default_min_score},
    default_timeout_seconds=${suite.default_timeout_seconds},
    parallel=${suite.parallel ? 'True' : 'False'},
    stop_on_failure=${suite.stop_on_failure ? 'True' : 'False'},
)

${testBlocks.map((block) => block.body).join('\n\n')}
`
}

export function renderSuiteExport(
  suite: EvalSuite,
  format: SuiteExportFormat,
): string {
  return format === 'python'
    ? renderPythonSuiteExport(suite)
    : renderTypeScriptSuiteExport(suite)
}

export function getSuiteExportMetadata(
  suite: EvalSuite,
  format: SuiteExportFormat,
): { filename: string; contentType: string } {
  const stem = toFileStem(suite.name || 'suite')
  return format === 'python'
    ? {
        filename: `${stem}.eval.py`,
        contentType: 'text/x-python',
      }
    : {
        filename: `${stem}.eval.ts`,
        contentType: 'application/typescript',
      }
}
