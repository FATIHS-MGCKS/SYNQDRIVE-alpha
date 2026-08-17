/**
 * E7C frontend test fixtures — mirrors shared contract shapes only.
 */
import type {
  E7Recommendation,
  EvaluationsRecommendationsResponse,
} from '@synq/evaluations-recommendations/evaluations-recommendations.contract';

export const E7_TEST_MTD_PERIOD = {
  periodType: 'MTD' as const,
  start: '2026-06-01T00:00:00.000Z',
  endExclusive: '2026-07-01T00:00:00.000Z',
  reference: '2026-06-16T12:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION' as const,
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
};

export const E7_TEST_ROLLING_PERIOD = {
  ...E7_TEST_MTD_PERIOD,
  periodType: 'ROLLING_30_DAYS' as const,
};

export const E7_TEST_SCOPE = {
  organizationId: 'org-a',
  stationIds: null,
  stationScoped: false,
};

function baseProvenance(overrides?: Partial<E7Recommendation['provenance']>) {
  return {
    calculationVersion: 'recommendations-e7-v1' as const,
    sourceSections: ['finance'] as const,
    sourceRuleIds: [] as const,
    sourceMetricIds: ['fin.overdue_receivables'] as const,
    period: E7_TEST_MTD_PERIOD,
    sourcePeriods: [{ source: 'finance', period: E7_TEST_MTD_PERIOD }] as const,
    scope: E7_TEST_SCOPE,
    inputStatuses: { finance: 'AVAILABLE' as const },
    qualityLimitations: [] as const,
    lineageRefs: [] as const,
    derivationReason: 'RECEIVABLES_OVERDUE:EUR',
    ...overrides,
  };
}

export function e7TestRecommendation(overrides?: Partial<E7Recommendation>): E7Recommendation {
  return {
    id: 'rec-test-1',
    family: 'RECEIVABLES_ATTENTION',
    category: 'FINANCE',
    severity: 'WARNING',
    titleKey: 'evaluations.recommendations.receivablesAttention.title',
    explanationKey: 'evaluations.recommendations.receivablesAttention.explanation',
    copyParams: [{ key: 'amount', type: 'MONEY', value: { amountMinor: 5000, currency: 'EUR' } }],
    actionability: 'ACTIONABLE',
    actions: [
      {
        actionType: 'NAVIGATION',
        mutating: false,
        labelKey: 'evaluations.recommendations.actions.viewFinance',
        target: { kind: 'EVALUATIONS_SECTION', value: 'finance' },
        confirmationRequired: false,
      },
    ],
    provenance: baseProvenance(),
    ...overrides,
  };
}

export function e7TestResponse(
  overrides?: Partial<EvaluationsRecommendationsResponse>,
): EvaluationsRecommendationsResponse {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-06-16T12:00:00.000Z',
    calculationVersion: 'recommendations-e7-v1',
    requestPeriod: E7_TEST_ROLLING_PERIOD,
    scope: E7_TEST_SCOPE,
    status: 'AVAILABLE',
    reason: null,
    recommendations: [e7TestRecommendation()],
    emptyState: null,
    ...overrides,
  };
}
