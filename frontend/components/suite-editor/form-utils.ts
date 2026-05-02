import { CONFIG } from '@/lib/config'
import type {
  EvalCase,
  EvalCaseCreate,
  EvalSuite,
  EvalSuiteCreate,
  EvalSuiteUpdate,
} from '@/lib/types'
import type { SuiteCaseFormData, SuiteFormData } from './types'

function normalizeCase(caseData: Partial<SuiteCaseFormData>): SuiteCaseFormData {
  return {
    id: caseData.id,
    name: caseData.name ?? '',
    description: caseData.description ?? '',
    input: caseData.input ?? {},
    expected_tools: caseData.expected_tools ?? [],
    expected_tool_sequence: caseData.expected_tool_sequence ?? [],
    expected_output_contains: caseData.expected_output_contains ?? [],
    expected_output_pattern: caseData.expected_output_pattern ?? null,
    scorers:
      caseData.scorers && caseData.scorers.length > 0
        ? caseData.scorers
        : ['tool_selection'],
    scorer_config: caseData.scorer_config ?? null,
    min_score: caseData.min_score ?? CONFIG.DEFAULT_MIN_SCORE,
    tags: caseData.tags ?? [],
    timeout_seconds: caseData.timeout_seconds ?? 60,
  }
}

export function suiteToFormData(suite: EvalSuite): SuiteFormData {
  return {
    name: suite.name,
    description: suite.description ?? '',
    agent_id: suite.agent_id,
    default_scorers: suite.default_scorers,
    default_min_score: suite.default_min_score,
    default_timeout_seconds: suite.default_timeout_seconds,
    parallel: suite.parallel,
    stop_on_failure: suite.stop_on_failure,
    cases: (suite.cases ?? []).map((caseData) => normalizeCase(caseData)),
  }
}

export function formCaseToCreatePayload(
  caseData: SuiteCaseFormData,
): EvalCaseCreate {
  return {
    name: caseData.name,
    description: caseData.description || null,
    input: caseData.input,
    expected_tools: caseData.expected_tools?.length
      ? caseData.expected_tools
      : null,
    expected_tool_sequence: caseData.expected_tool_sequence?.length
      ? caseData.expected_tool_sequence
      : null,
    expected_output_contains: caseData.expected_output_contains?.length
      ? caseData.expected_output_contains
      : null,
    expected_output_pattern: caseData.expected_output_pattern || null,
    scorers: caseData.scorers,
    scorer_config: caseData.scorer_config || null,
    min_score: caseData.min_score,
    tags: caseData.tags,
    timeout_seconds: caseData.timeout_seconds,
  }
}

export function formDataToCreatePayload(data: SuiteFormData): EvalSuiteCreate {
  return {
    name: data.name,
    description: data.description || null,
    agent_id: data.agent_id,
    default_scorers: data.default_scorers,
    default_min_score: data.default_min_score,
    default_timeout_seconds: data.default_timeout_seconds,
    parallel: data.parallel,
    stop_on_failure: data.stop_on_failure,
    cases: data.cases.map((caseData) => formCaseToCreatePayload(caseData)),
  }
}

export function formDataToUpdatePayload(data: SuiteFormData): EvalSuiteUpdate {
  return {
    name: data.name,
    description: data.description || null,
    agent_id: data.agent_id,
    default_scorers: data.default_scorers,
    default_min_score: data.default_min_score,
    default_timeout_seconds: data.default_timeout_seconds,
    parallel: data.parallel,
    stop_on_failure: data.stop_on_failure,
  }
}

export function diffSuiteCases(
  initialCases: EvalCase[],
  nextCases: SuiteCaseFormData[],
): {
  create: EvalCaseCreate[]
  update: Array<{ caseId: string; data: EvalCaseCreate }>
  delete: string[]
} {
  const initialById = new Map(initialCases.map((caseData) => [caseData.id, caseData]))
  const seenIds = new Set<string>()
  const create: EvalCaseCreate[] = []
  const update: Array<{ caseId: string; data: EvalCaseCreate }> = []

  for (const caseData of nextCases) {
    const payload = formCaseToCreatePayload(caseData)

    if (!caseData.id) {
      create.push(payload)
      continue
    }

    seenIds.add(caseData.id)
    const original = initialById.get(caseData.id)
    if (!original) {
      create.push(payload)
      continue
    }

    if (
      JSON.stringify(formCaseToCreatePayload(normalizeCase(original))) !==
      JSON.stringify(payload)
    ) {
      update.push({ caseId: caseData.id, data: payload })
    }
  }

  const deleteIds = initialCases
    .filter((caseData) => !seenIds.has(caseData.id))
    .map((caseData) => caseData.id)

  return { create, update, delete: deleteIds }
}
