import { describe, expect, it } from 'vitest'
import {
  diffSuiteCases,
  formDataToCreatePayload,
  suiteToFormData,
} from '@/components/suite-editor/form-utils'
import type { EvalCase, EvalSuite } from '@/lib/types'

function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: 'case-1',
    suite_id: 'suite-1',
    name: 'Handles refund escalation',
    description: 'Original description',
    input: { message: 'Customer needs a refund' },
    expected_tools: ['lookup_order'],
    expected_tool_sequence: ['lookup_order', 'process_refund'],
    expected_output_contains: ['refund'],
    expected_output_pattern: 'refund.*processed',
    scorers: ['tool_selection', 'reasoning'],
    scorer_config: { reasoning: { weight: 0.5 } },
    min_score: 0.8,
    tags: ['refund'],
    timeout_seconds: 90,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSuite(overrides: Partial<EvalSuite> = {}): EvalSuite {
  return {
    id: 'suite-1',
    project_id: 'project-1',
    name: 'Support Agent',
    description: null,
    agent_id: 'support-agent',
    default_scorers: ['tool_selection'],
    default_min_score: 0.7,
    default_timeout_seconds: 120,
    parallel: true,
    stop_on_failure: false,
    cases: [makeCase()],
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('suite editor form utils', () => {
  it('maps a persisted suite into editable form data', () => {
    const formData = suiteToFormData(
      makeSuite({
        description: null,
        cases: [
          makeCase({
            description: null,
            expected_tools: null,
            expected_tool_sequence: null,
            expected_output_contains: null,
            expected_output_pattern: null,
            scorer_config: null,
            tags: [],
          }),
        ],
      }),
    )

    expect(formData.description).toBe('')
    expect(formData.cases[0]).toMatchObject({
      id: 'case-1',
      description: '',
      expected_tools: [],
      expected_tool_sequence: [],
      expected_output_contains: [],
      expected_output_pattern: null,
      scorer_config: null,
      tags: [],
    })
  })

  it('converts form data into suite create payloads with nullable expectations', () => {
    const payload = formDataToCreatePayload({
      name: 'Support Agent',
      description: '',
      agent_id: 'support-agent',
      default_scorers: ['tool_selection'],
      default_min_score: 0.7,
      default_timeout_seconds: 120,
      parallel: true,
      stop_on_failure: false,
      cases: [
        {
          name: 'Fresh case',
          description: '',
          input: { prompt: 'help' },
          expected_tools: [],
          expected_tool_sequence: [],
          expected_output_contains: [],
          expected_output_pattern: null,
          scorers: ['tool_selection'],
          scorer_config: null,
          min_score: 0.7,
          tags: [],
          timeout_seconds: 60,
        },
      ],
    })

    expect(payload.description).toBeNull()
    expect(payload.cases?.[0]).toMatchObject({
      description: null,
      expected_tools: null,
      expected_tool_sequence: null,
      expected_output_contains: null,
      expected_output_pattern: null,
      scorer_config: null,
    })
  })

  it('diffs edited cases into create, update, and delete operations', () => {
    const initialCases = [
      makeCase(),
      makeCase({
        id: 'case-2',
        name: 'Keep me deleted',
      }),
    ]

    const diff = diffSuiteCases(initialCases, [
      {
        ...suiteToFormData(makeSuite()).cases[0],
        name: 'Handles refund escalation better',
      },
      {
        name: 'Brand new case',
        description: '',
        input: { prompt: 'new' },
        expected_tools: ['tool_a'],
        expected_tool_sequence: [],
        expected_output_contains: [],
        expected_output_pattern: null,
        scorers: ['tool_selection'],
        scorer_config: null,
        min_score: 0.75,
        tags: ['new'],
        timeout_seconds: 45,
      },
    ])

    expect(diff.update).toHaveLength(1)
    expect(diff.update[0]).toMatchObject({
      caseId: 'case-1',
      data: { name: 'Handles refund escalation better' },
    })
    expect(diff.create).toHaveLength(1)
    expect(diff.create[0]).toMatchObject({
      name: 'Brand new case',
      expected_tools: ['tool_a'],
    })
    expect(diff.delete).toEqual(['case-2'])
  })
})
