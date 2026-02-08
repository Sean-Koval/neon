/**
 * Types for the Suite Editor wizard.
 */

import { CONFIG } from '@/lib/config'
import type { EvalCaseCreate, ScorerType } from '@/lib/types'

export interface SuiteFormData {
  /** Step 1: Basic info */
  name: string
  description: string
  agent_id: string

  /** Step 2: Configuration */
  default_scorers: ScorerType[]
  default_min_score: number
  default_timeout_seconds: number
  parallel: boolean
  stop_on_failure: boolean

  /** Step 3: Test cases */
  cases: EvalCaseCreate[]
}

export const EMPTY_CASE: EvalCaseCreate = {
  name: '',
  description: '',
  input: {},
  expected_tools: [],
  expected_output_contains: [],
  expected_output_pattern: null,
  scorers: ['tool_selection'],
  scorer_config: null,
  min_score: CONFIG.DEFAULT_MIN_SCORE,
  tags: [],
  timeout_seconds: 60,
}

export const DEFAULT_FORM_DATA: SuiteFormData = {
  name: '',
  description: '',
  agent_id: '',
  default_scorers: ['tool_selection', 'reasoning'],
  default_min_score: CONFIG.DEFAULT_MIN_SCORE,
  default_timeout_seconds: 120,
  parallel: true,
  stop_on_failure: false,
  cases: [],
}

export type WizardStep = 'info' | 'config' | 'cases' | 'review'

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: 'info', label: 'Suite Info' },
  { key: 'config', label: 'Configuration' },
  { key: 'cases', label: 'Test Cases' },
  { key: 'review', label: 'Review' },
]

export const ALL_SCORERS: { value: ScorerType; label: string }[] = [
  { value: 'tool_selection', label: 'Tool Selection' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'grounding', label: 'Grounding' },
  { value: 'efficiency', label: 'Efficiency' },
  { value: 'custom', label: 'Custom' },
]
