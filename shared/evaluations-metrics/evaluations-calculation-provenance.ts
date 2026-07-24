/**
 * Calculation provenance contract for Auswertungen metrics and Business Insights.
 * @see docs/architecture/analytics/evaluations-calculation-versioning.md
 */

export const EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION = '1.0.0';

export const EVALUATIONS_CALCULATION_ENGINE_VERSION = '1.0.0';

export type EvaluationsCalculationCompleteness =
  | 'complete'
  | 'partial'
  | 'degraded'
  | 'unknown';

/** ISO-8601 date-time strings in serialized form. */
export interface EvaluationsCalculationProvenance {
  readonly schemaVersion: string;
  readonly metricId: string;
  readonly calculationVersion: string;
  readonly generatedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly appliedFilters: Readonly<Record<string, unknown>>;
  readonly sourceVersions: Readonly<Record<string, unknown>>;
  readonly completeness: EvaluationsCalculationCompleteness;
}

export interface EvaluationsCalculationResultEnvelope<T> {
  readonly value: T;
  readonly provenance: EvaluationsCalculationProvenance;
}

export interface BuildCalculationProvenanceInput {
  metricId: string;
  calculationVersion: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  appliedFilters?: Record<string, unknown>;
  sourceVersions?: Record<string, unknown>;
  completeness?: EvaluationsCalculationCompleteness;
}

export function buildCalculationProvenance(
  input: BuildCalculationProvenanceInput,
): EvaluationsCalculationProvenance {
  return {
    schemaVersion: EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION,
    metricId: input.metricId,
    calculationVersion: input.calculationVersion,
    generatedAt: input.generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    appliedFilters: input.appliedFilters ?? {},
    sourceVersions: input.sourceVersions ?? {},
    completeness: input.completeness ?? 'complete',
  };
}

export function wrapCalculationResult<T>(
  value: T,
  provenance: EvaluationsCalculationProvenance,
): EvaluationsCalculationResultEnvelope<T> {
  return { value, provenance };
}

/**
 * Returns null for legacy/missing records — does not invent historical metadata.
 */
export function parseCalculationProvenance(
  raw: unknown,
): EvaluationsCalculationProvenance | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.metricId !== 'string' ||
    typeof o.calculationVersion !== 'string' ||
    typeof o.generatedAt !== 'string' ||
    typeof o.periodStart !== 'string' ||
    typeof o.periodEnd !== 'string' ||
    typeof o.completeness !== 'string'
  ) {
    return null;
  }
  return {
    schemaVersion: typeof o.schemaVersion === 'string' ? o.schemaVersion : 'unknown',
    metricId: o.metricId,
    calculationVersion: o.calculationVersion,
    generatedAt: o.generatedAt,
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    appliedFilters:
      o.appliedFilters != null && typeof o.appliedFilters === 'object' && !Array.isArray(o.appliedFilters)
        ? (o.appliedFilters as Record<string, unknown>)
        : {},
    sourceVersions:
      o.sourceVersions != null && typeof o.sourceVersions === 'object' && !Array.isArray(o.sourceVersions)
        ? (o.sourceVersions as Record<string, unknown>)
        : {},
    completeness: o.completeness as EvaluationsCalculationCompleteness,
  };
}

export function isLegacyProvenanceMissing(
  raw: unknown,
): boolean {
  return parseCalculationProvenance(raw) == null;
}
