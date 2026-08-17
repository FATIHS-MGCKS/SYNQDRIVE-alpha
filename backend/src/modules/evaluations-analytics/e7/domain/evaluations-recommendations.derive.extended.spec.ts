import { deriveEvaluationsRecommendations } from './evaluations-recommendations.derive';
import {
  e7BaseQuality,
  e7BaseSummary,
  e7MoneyMetric,
  E7_FIXTURE_ANALYTICS_PERIOD,
  E7_FIXTURE_MTD_PERIOD,
  E7_FIXTURE_SCOPE,
} from './evaluations-recommendations.fixtures';
import {
  E7_FINANCE_METRIC_OPEN,
  E7_FINANCE_METRIC_OVERDUE,
} from './evaluations-recommendations.derive';

const GEN = '2026-02-15T00:00:00.000Z';

describe('E7 recommendation derivation — extended coverage', () => {
  it('emits strength reinforce from E4 strength output', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          strengths: {
            ...e7BaseSummary().sections.strengths,
            strengths: [
              {
                ruleId: 'HIGH_UTILIZATION',
                ruleVersion: 'strength-detection-e4-v3',
                comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
                evidenceKind: 'OBSERVATION',
                dimension: 'UTILIZATION',
                evidence: {
                  metricId: 'ops.fleet_utilization_pct',
                  observedValue: 92,
                  comparisonValue: 80,
                  threshold: 80,
                  unit: 'PERCENT',
                  sampleSize: 10,
                },
              },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'STRENGTH_REINFORCE')).toBe(true);
  });

  it('suppresses utilization when utilization metric is unavailable', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          utilization: {
            ...e7BaseSummary().sections.utilization,
            status: 'UNAVAILABLE',
            utilizationPercent: {
              ...e7BaseSummary().sections.utilization.utilizationPercent,
              status: 'UNAVAILABLE',
              value: null,
            },
          },
          weaknesses: {
            ...e7BaseSummary().sections.weaknesses,
            weaknesses: [
              {
                ruleId: 'UNDERUTILIZATION',
                ruleVersion: 'weakness-detection-e4-v3',
                severity: 'WARNING',
                comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
                evidenceKind: 'OBSERVATION',
                dimension: 'FLEET',
                evidence: {
                  metricId: 'ops.fleet_utilization_pct',
                  observedValue: 25,
                  comparisonValue: 40,
                  threshold: 40,
                  unit: 'PERCENT',
                  sampleSize: 5,
                },
              },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'UTILIZATION_ATTENTION')).toBe(false);
  });

  it('preserves KWD money without summing currencies', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 123450, 'KWD', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 50000, 'EUR', E7_FIXTURE_MTD_PERIOD),
            },
            reason: null,
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    const overdue = result.recommendations.find((r) => r.family === 'RECEIVABLES_ATTENTION');
    const money = overdue?.copyParams.find((p) => p.type === 'MONEY')?.value;
    expect(money).toEqual({ amountMinor: 123450, currency: 'KWD' });
    expect(result.recommendations.filter((r) => r.family === 'RECEIVABLES_ATTENTION')).toHaveLength(1);
  });

  it('emits cost evidence incomplete from cost model', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          costModel: {
            ...e7BaseSummary().sections.costModel,
            status: 'PARTIAL',
            reason: 'MISSING_SOURCES',
            categories: [
              {
                category: 'OPERATING_EXPENSES',
                nature: 'ACTUAL',
                status: 'UNAVAILABLE',
                totalsByCurrency: [],
                eventCount: 0,
                formula: 'sum',
                sources: [],
                reason: 'NO_INVOICE_FEED',
              },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'COST_EVIDENCE_INCOMPLETE')).toBe(true);
  });

  it('deduplicates skipped detection dimensions', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          weaknesses: {
            ...e7BaseSummary().sections.weaknesses,
            status: 'PARTIAL',
            reason: 'SKIPPED_DIMENSIONS',
            weaknesses: [],
            skippedDimensions: [
              { dimension: 'DRIVER', reason: 'PRIVACY_TIER' },
              { dimension: 'DRIVER', reason: 'PRIVACY_TIER' },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.filter((r) => r.family === 'DETECTION_INPUT_SKIPPED')).toHaveLength(1);
  });

  it('allows driver influence at full tier without embedding driverRef', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'AVAILABLE',
            reason: null,
            piiTier: 'full',
            factors: [
              {
                driverRef: 'cust-1',
                associatedDimension: 'LATE_RETURNS',
                associationShare: 0.8,
                sampleSize: 3,
                relationship: 'ASSOCIATED_WITH',
              },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    const driver = result.recommendations.find((r) => r.family === 'DRIVER_INFLUENCE_REVIEW');
    expect(driver).toBeDefined();
    expect(JSON.stringify(driver)).not.toMatch(/driverRef|customerId|email/i);
  });

  it('marks collection STALE when governing section status is STALE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'STALE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
            },
            reason: 'STALE_EVIDENCE',
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.status).toBe('STALE');
    expect(result.emptyState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('creates actionable quality recommendation for section PARTIAL', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          utilization: { ...e7BaseSummary().sections.utilization, status: 'AVAILABLE' },
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'NOT_APPLICABLE',
            piiTier: 'none',
            factors: [],
          },
        },
      }),
      quality: e7BaseQuality({
        sections: [
          {
            section: 'finance',
            status: 'PARTIAL',
            dimensions: {
              FRESHNESS: 'UNKNOWN',
              COMPLETENESS: 'PARTIAL',
              PROVENANCE: 'COMPLETE',
              VALIDITY: 'UNKNOWN',
              TEMPORAL_APPLICABILITY: 'COMPLETE',
            },
            freshness: null,
            businessEventRecency: null,
            coverage: null,
            requiredSourceClasses: ['FINANCE_INVOICE'],
            lineage: [],
            reason: 'PARTIAL_COVERAGE',
          },
        ],
        overall: { status: 'PARTIAL', complete: false, reason: 'QUALITY_INCOMPLETE' },
      }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'DATA_QUALITY_LIMITED')).toBe(true);
  });

  it('sorts receivables before strength deterministically', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
            },
            reason: null,
          },
          strengths: {
            ...e7BaseSummary().sections.strengths,
            strengths: [
              {
                ruleId: 'HIGH_UTILIZATION',
                ruleVersion: 'strength-detection-e4-v3',
                comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
                evidenceKind: 'OBSERVATION',
                dimension: 'UTILIZATION',
                evidence: {
                  metricId: 'ops.fleet_utilization_pct',
                  observedValue: 90,
                  comparisonValue: 80,
                  threshold: 80,
                  unit: 'PERCENT',
                  sampleSize: 10,
                },
              },
            ],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations[0]?.family).toBe('RECEIVABLES_ATTENTION');
    expect(result.recommendations.some((r) => r.severity === 'INFO')).toBe(true);
  });
});
