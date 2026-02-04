/**
 * Variant Definition API
 *
 * Define control and treatment variants for A/B testing experiments.
 */

import type { Variant, VariantConfig, VariantType } from "./types.js";

/**
 * Options for defining a variant
 */
export interface DefineVariantOptions {
  /** Unique identifier for the variant */
  id?: string;
  /** Human-readable name */
  name: string;
  /** Variant type (control or treatment) */
  type?: VariantType;
  /** Optional description */
  description?: string;
  /** Agent configuration */
  config?: VariantConfig;
  /** Traffic allocation percentage (0-100) */
  allocation?: number;
}

/**
 * Counter for generating deterministic variant IDs
 */
let variantIdCounter = 0;

/**
 * Reset variant ID counter (useful for testing)
 */
export function resetVariantIdCounter(): void {
  variantIdCounter = 0;
}

/**
 * Generate a unique ID for a variant
 * Uses a deterministic counter-based approach for reproducibility
 */
function generateVariantId(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const counter = variantIdCounter++;
  return `${sanitized}-${counter.toString(36).padStart(4, "0")}`;
}

/**
 * Define a variant for A/B testing
 *
 * @example
 * ```typescript
 * const control = defineVariant({
 *   name: 'GPT-4 Control',
 *   type: 'control',
 *   config: {
 *     model: 'gpt-4',
 *     temperature: 0.7,
 *   },
 * });
 *
 * const treatment = defineVariant({
 *   name: 'GPT-4 Turbo Treatment',
 *   type: 'treatment',
 *   config: {
 *     model: 'gpt-4-turbo',
 *     temperature: 0.5,
 *   },
 * });
 * ```
 */
export function defineVariant(options: DefineVariantOptions): Variant {
  const {
    id = generateVariantId(options.name),
    name,
    type = "treatment",
    description,
    config = {},
    allocation,
  } = options;

  // Validate allocation if provided
  if (allocation !== undefined && (allocation < 0 || allocation > 100)) {
    throw new Error(`Variant allocation must be between 0 and 100, got ${allocation}`);
  }

  return {
    id,
    name,
    type,
    description,
    config,
    allocation,
  };
}

/**
 * Define a control variant (convenience function)
 *
 * @example
 * ```typescript
 * const control = defineControl({
 *   name: 'Current Production',
 *   config: {
 *     agentId: 'agent-v1',
 *     agentVersion: '1.2.3',
 *   },
 * });
 * ```
 */
export function defineControl(
  options: Omit<DefineVariantOptions, "type">
): Variant {
  return defineVariant({ ...options, type: "control" });
}

/**
 * Define a treatment variant (convenience function)
 *
 * @example
 * ```typescript
 * const treatment = defineTreatment({
 *   name: 'New Algorithm',
 *   config: {
 *     agentId: 'agent-v2',
 *     agentVersion: '2.0.0',
 *     parameters: {
 *       useNewRetrieval: true,
 *     },
 *   },
 * });
 * ```
 */
export function defineTreatment(
  options: Omit<DefineVariantOptions, "type">
): Variant {
  return defineVariant({ ...options, type: "treatment" });
}

/**
 * Validate a set of variants for an experiment
 */
export function validateVariants(variants: Variant[]): string[] {
  const errors: string[] = [];

  if (variants.length < 2) {
    errors.push("Experiment requires at least 2 variants (1 control + 1 treatment)");
  }

  const controls = variants.filter((v) => v.type === "control");
  const treatments = variants.filter((v) => v.type === "treatment");

  if (controls.length === 0) {
    errors.push("Experiment requires at least 1 control variant");
  }

  if (controls.length > 1) {
    errors.push("Experiment should have exactly 1 control variant");
  }

  if (treatments.length === 0) {
    errors.push("Experiment requires at least 1 treatment variant");
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const variant of variants) {
    if (ids.has(variant.id)) {
      errors.push(`Duplicate variant ID: ${variant.id}`);
    }
    ids.add(variant.id);
  }

  // Check allocation percentages sum to 100 if all are specified
  const allocations = variants
    .map((v) => v.allocation)
    .filter((a): a is number => a !== undefined);

  if (allocations.length > 0 && allocations.length === variants.length) {
    const total = allocations.reduce((sum, a) => sum + a, 0);
    if (Math.abs(total - 100) > 0.01) {
      errors.push(`Variant allocations must sum to 100, got ${total}`);
    }
  }

  return errors;
}

/**
 * Get the control variant from a list
 */
export function getControlVariant(variants: Variant[]): Variant | undefined {
  return variants.find((v) => v.type === "control");
}

/**
 * Get treatment variants from a list
 */
export function getTreatmentVariants(variants: Variant[]): Variant[] {
  return variants.filter((v) => v.type === "treatment");
}
