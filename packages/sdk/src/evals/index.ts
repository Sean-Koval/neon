/**
 * Skill Evaluation Framework
 *
 * Comprehensive evaluation of agent skills with:
 * - Parameter accuracy assessment
 * - Result quality scoring
 * - Skill-specific regression tracking
 * - Multi-skill chain evaluation
 */

// Skill Evaluation API
export {
  // Define functions
  defineSkillEval,
  defineSkillEvalSuite,
  // Run functions
  runSkillEval,
  runSkillEvalSuite,
  // Utility functions
  skillTestFromSpan,
  generateSkillTestCases,
  // Types
  type ParameterType,
  type ParameterSchema,
  type SkillBehavior,
  type SkillTestCase,
  type SkillResult,
  type SkillEval,
  type SkillTestResult,
  type SkillEvalResult,
  type SkillEvalOptions,
  type SkillEvalSuite,
} from "./skill-eval.js";
