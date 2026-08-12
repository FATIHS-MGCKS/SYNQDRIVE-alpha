/**
 * E5A quality/freshness/lineage contracts.
 *
 * E5 is a governance layer AROUND the E1–E4 truths, not a second calculation
 * engine. It reuses the E1 `EvaluationsSourceFreshness` and `EvaluationsDataCoverage`
 * shapes and the E1/E4 status semantics; it never redefines metric values,
 * money, period, or status, and never upgrades an E1/E4 status.
 */
import type {
  EvaluationsMetricStatus,
  EvaluationsSourceFreshness,
  EvaluationsDataCoverage,
} from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';

export const E5_CALCULATION_VERSIONS = {
  quality: 'evaluations-quality-e5-v1',
} as const;

/** Distinct quality dimensions — never collapsed into a single 0–100 score. */
export const E5_QUALITY_DIMENSIONS = [
  'FRESHNESS',
  'COMPLETENESS',
  'PROVENANCE',
  'VALIDITY',
  'TEMPORAL_APPLICABILITY',
] as const;
export type E5QualityDimension = (typeof E5_QUALITY_DIMENSIONS)[number];

/** Conservative dimension states (no fabricated numeric score). */
export const E5_DIMENSION_STATES = ['COMPLETE', 'PARTIAL', 'UNKNOWN', 'UNAVAILABLE'] as const;
export type E5DimensionState = (typeof E5_DIMENSION_STATES)[number];

export interface E5QualityScope {
  readonly organizationId: string;
  readonly stationIds: readonly string[] | null;
  readonly stationScoped: boolean;
}

/**
 * Tenant-safe lineage reference. It intentionally exposes only the source CLASS
 * and an organization-scoped opaque token — never raw record ids, PII, document
 * content, or cross-tenant/out-of-station identifiers.
 */
export interface E5LineageRef {
  readonly sourceCategory: string;
  readonly sourceRef: string;
  readonly effectiveTimestamp: string | null;
  readonly calculationVersion: string;
  readonly reason: string;
}

export interface E5SectionQuality {
  readonly section: string;
  /** Mirrors the underlying E4/E3 section status verbatim — never upgraded. */
  readonly status: EvaluationsMetricStatus;
  readonly dimensions: Readonly<Record<E5QualityDimension, E5DimensionState>>;
  readonly freshness: EvaluationsSourceFreshness | null;
  readonly coverage: EvaluationsDataCoverage | null;
  readonly lineage: readonly E5LineageRef[];
  readonly reason: string | null;
}

export interface EvaluationsQualityReport {
  readonly schemaVersion: '1.0.0';
  readonly generatedAt: string;
  readonly scope: E5QualityScope;
  readonly period: EvaluationsPeriodWindow;
  readonly calculationVersion: string;
  readonly sections: readonly E5SectionQuality[];
  readonly overall: {
    readonly status: EvaluationsMetricStatus;
    /** True only when every section is AVAILABLE and every dimension COMPLETE. */
    readonly complete: boolean;
    readonly reason: string | null;
  };
}
