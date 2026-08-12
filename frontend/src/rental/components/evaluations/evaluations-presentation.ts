/**
 * E6B presentation-only adapters. Display mapping ONLY — no business aggregation,
 * threshold derivation, quality inference, privacy decision, currency inference, or
 * period recomputation. Status/label/tone mapping preserves canonical meaning.
 */
import type { TranslationKey } from '../../i18n/translations/en';
import type {
  EvaluationsMetricStatus,
  EvaluationsMetricResponse,
  E5QualityDimension,
  E5DimensionState,
  EvaluationsSourceFreshness,
  EvaluationsPiiTier,
} from '../../lib/evaluations/evaluations-canonical.types';

/** Pipeline freshness state (FRESH/STALE/UNKNOWN/ERROR) — distinct from E1 status. */
export type EvaluationsFreshnessState = EvaluationsSourceFreshness['state'];

export type EvaluationsStatusTone = 'positive' | 'warning' | 'watch' | 'neutral' | 'critical';

/** Canonical E1 status → tone. Never upgrades meaning; UNKNOWN/UNAVAILABLE stay neutral. */
export function statusTone(status: EvaluationsMetricStatus): EvaluationsStatusTone {
  switch (status) {
    case 'AVAILABLE':
      return 'positive';
    case 'PARTIAL':
      return 'warning';
    case 'STALE':
      return 'watch';
    case 'ERROR':
      return 'critical';
    case 'UNAVAILABLE':
    case 'NOT_APPLICABLE':
    default:
      return 'neutral';
  }
}

export function statusLabelKey(status: EvaluationsMetricStatus): TranslationKey {
  return `evaluations.status.${status}` as TranslationKey;
}

/** Map a tone to the repository's `sq-tone-*` utility classes (icon+text, not color-only). */
export function toneClassName(tone: EvaluationsStatusTone): string {
  switch (tone) {
    case 'positive':
      return 'sq-tone-positive';
    case 'warning':
      return 'sq-tone-warning';
    case 'watch':
      return 'sq-tone-watch';
    case 'critical':
      return 'sq-tone-critical';
    case 'neutral':
    default:
      return 'sq-tone-neutral';
  }
}

/** Value-bearing statuses may display a value; others must show a placeholder. */
export function canShowMetricValue(status: EvaluationsMetricStatus): boolean {
  return status === 'AVAILABLE' || status === 'PARTIAL' || status === 'STALE';
}

/** Canonical finance metric ids → KPI label keys (E3 authority). */
export const EVALUATIONS_FINANCE_KPI_LABEL: Readonly<Record<string, TranslationKey>> = {
  'fin.mtd_issued_revenue': 'evaluations.kpi.issuedRevenue',
  'fin.mtd_paid_revenue': 'evaluations.kpi.paidRevenue',
  'fin.mtd_expenses': 'evaluations.kpi.expenses',
  'fin.mtd_net_result': 'evaluations.kpi.netResult',
  'fin.profit_margin_mtd': 'evaluations.kpi.profitMargin',
  'fin.open_receivables': 'evaluations.kpi.openReceivables',
  'fin.overdue_receivables': 'evaluations.kpi.overdueReceivables',
};

/** Cost category → label key. */
export function costCategoryLabelKey(category: string): TranslationKey {
  return `evaluations.cost.category.${category}` as TranslationKey;
}

/**
 * Read a numeric metric value for display, preserving status semantics: returns
 * `null` for no-value statuses (never coerced to 0).
 */
export function readNumericMetricForDisplay(
  metric: EvaluationsMetricResponse | undefined | null,
): { value: number | null; status: EvaluationsMetricStatus } | null {
  if (!metric) return null;
  const status = metric.status;
  if (!canShowMetricValue(status)) return { value: null, status };
  const raw = (metric as { value?: unknown }).value;
  return { value: typeof raw === 'number' ? raw : null, status };
}

// ── E6C: E5 data-quality dimension presentation (SEPARATE from E1 metric status) ──
// The five E5 dimension states are their own vocabulary and must NOT be mapped onto
// the E1 metric-status badge. COMPLETE→positive, PARTIAL→warning, UNKNOWN/UNAVAILABLE
// stay neutral (never upgraded, never rendered as zero/healthy).

export function dimensionStateTone(state: E5DimensionState): EvaluationsStatusTone {
  switch (state) {
    case 'COMPLETE':
      return 'positive';
    case 'PARTIAL':
      return 'warning';
    case 'UNKNOWN':
    case 'UNAVAILABLE':
    default:
      return 'neutral';
  }
}

export function dimensionStateLabelKey(state: E5DimensionState): TranslationKey {
  return `evaluations.quality.dimensionState.${state}` as TranslationKey;
}

export function dimensionLabelKey(dimension: E5QualityDimension): TranslationKey {
  return `evaluations.quality.dimension.${dimension}` as TranslationKey;
}

/** Ordered canonical dimensions (server supplies a record; we render a stable order). */
export const E5_QUALITY_DIMENSIONS: readonly E5QualityDimension[] = [
  'FRESHNESS',
  'COMPLETENESS',
  'PROVENANCE',
  'VALIDITY',
  'TEMPORAL_APPLICABILITY',
];

// ── Pipeline freshness state (distinct from business-event recency and E1 status) ──
export function freshnessStateTone(state: EvaluationsFreshnessState): EvaluationsStatusTone {
  switch (state) {
    case 'FRESH':
      return 'positive';
    case 'STALE':
      return 'watch';
    case 'ERROR':
      return 'critical';
    case 'UNKNOWN':
    default:
      return 'neutral';
  }
}

export function freshnessStateLabelKey(state: EvaluationsFreshnessState): TranslationKey {
  return `evaluations.quality.freshnessState.${state}` as TranslationKey;
}

// ── E6C: driver influence presentation (server-authoritative; never derived) ──
export function driverPiiTierLabelKey(tier: EvaluationsPiiTier): TranslationKey {
  return `evaluations.driver.piiTier.${tier}` as TranslationKey;
}

export function driverRelationshipLabelKey(
  relationship: 'ASSOCIATED_WITH' | 'CORRELATES_WITH',
): TranslationKey {
  return `evaluations.driver.relationship.${relationship}` as TranslationKey;
}
