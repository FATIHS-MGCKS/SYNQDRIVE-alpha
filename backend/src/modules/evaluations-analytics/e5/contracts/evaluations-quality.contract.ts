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
  // v2 (E5.1A): freshness is no longer conflated with business-event recency
  // (no authoritative ingestion/sync timestamp → freshness UNKNOWN; business
  // timestamps exposed separately as businessEventRecency); conservative status
  // roll-up (never upgrades PARTIAL/STALE → AVAILABLE); composite provenance
  // requires every declared source class, not just one.
  quality: 'evaluations-quality-e5-v2',
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

/**
 * Business-event recency (activity metadata) — the newest/oldest BUSINESS event
 * timestamp in scope/period. This is NOT pipeline/data freshness: a business may
 * legitimately have no recent events while its data pipeline is perfectly
 * current.
 */
export interface E5BusinessEventRecency {
  readonly newestAt: string | null;
  readonly oldestAt: string | null;
}

export interface E5SectionQuality {
  readonly section: string;
  /** Mirrors the underlying E4/E3 section status verbatim — never upgraded. */
  readonly status: EvaluationsMetricStatus;
  readonly dimensions: Readonly<Record<E5QualityDimension, E5DimensionState>>;
  /**
   * Pipeline/data freshness. On current main there is no authoritative
   * ingestion/observation/sync watermark for these sources, so the state is
   * UNKNOWN (never inferred from business recency).
   */
  readonly freshness: EvaluationsSourceFreshness | null;
  /** Business-event recency (activity), distinct from pipeline freshness. */
  readonly businessEventRecency: E5BusinessEventRecency | null;
  readonly coverage: EvaluationsDataCoverage | null;
  /** Canonical source classes this section's results depend on. */
  readonly requiredSourceClasses: readonly string[];
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
