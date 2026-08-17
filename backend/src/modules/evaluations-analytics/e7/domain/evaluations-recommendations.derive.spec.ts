import {
  deriveEvaluationsRecommendations,
  E7_FINANCE_METRIC_OPEN,
  E7_FINANCE_METRIC_OVERDUE,
} from './evaluations-recommendations.derive';
import {
  e7BaseQuality,
  e7BaseSummary,
  e7MoneyMetric,
  E7_FIXTURE_ANALYTICS_PERIOD,
  E7_FIXTURE_MTD_PERIOD,
  E7_FIXTURE_SCOPE,
} from './evaluations-recommendations.fixtures';
import {
  buildE7RecommendationId,
  canonicalStationScopeKey,
} from '@synq/evaluations-recommendations/evaluations-recommendations-id';

const GEN = '2026-02-15T00:00:00.000Z';

describe('E7 recommendation derivation', () => {
  it('produces stable deterministic ids', () => {
    const summary = e7BaseSummary({
      sections: {
        finance: {
          status: 'AVAILABLE',
          metrics: {
            [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 5000, 'EUR', E7_FIXTURE_MTD_PERIOD),
            [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
          },
          reason: null,
        },
      },
    });
    const a = deriveEvaluationsRecommendations({
      summary,
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    const b = deriveEvaluationsRecommendations({
      summary,
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: '2026-02-16T00:00:00.000Z',
    });
    expect(a.recommendations[0]?.id).toBe(b.recommendations[0]?.id);
  });

  it('canonicalizes station scope order for identity', () => {
    expect(canonicalStationScopeKey(['b', 'a'])).toBe(canonicalStationScopeKey(['a', 'b']));
    const material = {
      organizationId: 'org-a',
      stationIds: ['st-2', 'st-1'],
      period: E7_FIXTURE_MTD_PERIOD,
      family: 'RECEIVABLES_ATTENTION' as const,
      sourceRuleId: null,
      sourceMetricId: E7_FINANCE_METRIC_OVERDUE,
      dimension: null,
      derivationReason: 'RECEIVABLES_OVERDUE:EUR',
      currency: 'EUR',
    };
    const id1 = buildE7RecommendationId({ ...material, stationIds: ['st-1', 'st-2'] });
    const id2 = buildE7RecommendationId({ ...material, stationIds: ['st-2', 'st-1'] });
    expect(id1).toBe(id2);
  });

  it('keeps finance recommendation id stable when analytics period changes', () => {
    const mtd = E7_FIXTURE_MTD_PERIOD;
    const overdue = e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', mtd);
    const summary = e7BaseSummary({
      sections: {
        finance: {
          status: 'AVAILABLE',
          metrics: {
            [E7_FINANCE_METRIC_OVERDUE]: overdue,
            [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', mtd),
          },
          reason: null,
        },
      },
    });
    const jan = deriveEvaluationsRecommendations({
      summary,
      quality: e7BaseQuality(),
      requestPeriod: { ...E7_FIXTURE_ANALYTICS_PERIOD, periodType: 'MONTH' },
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    const feb = deriveEvaluationsRecommendations({
      summary: { ...summary, period: { ...mtd, periodType: 'MTD' } },
      quality: e7BaseQuality(),
      requestPeriod: mtd,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(jan.recommendations.find((r) => r.family === 'RECEIVABLES_ATTENTION')?.id).toBe(
      feb.recommendations.find((r) => r.family === 'RECEIVABLES_ATTENTION')?.id,
    );
    expect(jan.recommendations[0]?.provenance.period).toEqual(mtd);
  });

  it('changes analytics-section recommendation id when analytics period changes', () => {
    const weakness = {
      ruleId: 'HIGH_CANCELLATION_RATE',
      ruleVersion: 'weakness-detection-e4-v3',
      severity: 'WARNING' as const,
      comparatorBasis: 'PLATFORM_RULE_THRESHOLD' as const,
      evidenceKind: 'OBSERVATION' as const,
      dimension: 'BOOKINGS',
      evidence: {
        metricId: null,
        observedValue: 15,
        comparisonValue: 10,
        threshold: 10,
        unit: 'PERCENT',
        sampleSize: 20,
      },
    };
    const p1 = E7_FIXTURE_ANALYTICS_PERIOD;
    const p2 = { ...p1, start: '2025-12-01T00:00:00.000Z', endExclusive: '2026-01-01T00:00:00.000Z' };
    const mk = (period: typeof p1) =>
      deriveEvaluationsRecommendations({
        summary: e7BaseSummary({
          sections: {
            weaknesses: {
              status: 'AVAILABLE',
              calculationVersion: 'weakness-detection-e4-v3',
              period,
              scope: E7_FIXTURE_SCOPE,
              coverage: null,
              generatedAt: GEN,
              reason: null,
              weaknesses: [weakness],
              evaluatedDimensions: ['BOOKINGS'],
              skippedDimensions: [],
            },
          },
        }),
        quality: e7BaseQuality(),
        requestPeriod: period,
        scope: E7_FIXTURE_SCOPE,
        generatedAt: GEN,
      });
    const a = mk(p1).recommendations.find((r) => r.family === 'WEAKNESS_ATTENTION');
    const b = mk(p2).recommendations.find((r) => r.family === 'WEAKNESS_ATTENTION');
    expect(a?.id).not.toBe(b?.id);
  });

  it('emits RECEIVABLES_ATTENTION when overdue > 0', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 2500, 'USD', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 2500, 'USD', E7_FIXTURE_MTD_PERIOD),
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
    expect(result.recommendations.some((r) => r.family === 'RECEIVABLES_ATTENTION')).toBe(true);
    expect(result.recommendations.some((r) => r.family === 'OPEN_RECEIVABLES_REVIEW')).toBe(false);
    const money = result.recommendations[0].copyParams.find((p) => p.type === 'MONEY')?.value;
    expect(money).toEqual({ amountMinor: 2500, currency: 'USD' });
  });

  it('suppresses overdue recommendation when overdue is zero', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary(),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'RECEIVABLES_ATTENTION')).toBe(false);
  });

  it('emits OPEN_RECEIVABLES_REVIEW for non-overdue open balance only', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 900, 'EUR', E7_FIXTURE_MTD_PERIOD),
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
    expect(result.recommendations.some((r) => r.family === 'OPEN_RECEIVABLES_REVIEW')).toBe(true);
  });

  it('maps UNDERUTILIZATION weakness to UTILIZATION_ATTENTION only', () => {
    const weakness = {
      ruleId: 'UNDERUTILIZATION',
      ruleVersion: 'weakness-detection-e4-v3',
      severity: 'CRITICAL' as const,
      comparatorBasis: 'PLATFORM_RULE_THRESHOLD' as const,
      evidenceKind: 'OBSERVATION' as const,
      dimension: 'FLEET',
      evidence: {
        metricId: 'ops.fleet_utilization_pct',
        observedValue: 25,
        comparisonValue: 40,
        threshold: 40,
        unit: 'PERCENT',
        sampleSize: 5,
      },
    };
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          weaknesses: {
            status: 'AVAILABLE',
            calculationVersion: 'weakness-detection-e4-v3',
            period: E7_FIXTURE_ANALYTICS_PERIOD,
            scope: E7_FIXTURE_SCOPE,
            coverage: null,
            generatedAt: GEN,
            reason: null,
            weaknesses: [weakness],
            evaluatedDimensions: ['UTILIZATION'],
            skippedDimensions: [],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'UTILIZATION_ATTENTION')).toBe(true);
    expect(result.recommendations.some((r) => r.family === 'WEAKNESS_ATTENTION' && r.provenance.sourceRuleIds.includes('UNDERUTILIZATION'))).toBe(false);
  });

  it('does not emit structural freshness-only DATA_QUALITY_LIMITED', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary(),
      quality: e7BaseQuality({
        sections: [
          {
            section: 'finance',
            status: 'AVAILABLE',
            dimensions: {
              FRESHNESS: 'UNKNOWN',
              COMPLETENESS: 'COMPLETE',
              PROVENANCE: 'COMPLETE',
              VALIDITY: 'UNKNOWN',
              TEMPORAL_APPLICABILITY: 'COMPLETE',
            },
            freshness: null,
            businessEventRecency: null,
            coverage: null,
            requiredSourceClasses: ['FINANCE_INVOICE'],
            lineage: [],
            reason: null,
          },
        ],
      }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'DATA_QUALITY_LIMITED')).toBe(false);
  });

  it('suppresses driver recommendation at piiTier none', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          driverInfluence: {
            status: 'AVAILABLE',
            calculationVersion: 'driver-influence-e4-v1',
            period: E7_FIXTURE_ANALYTICS_PERIOD,
            scope: E7_FIXTURE_SCOPE,
            coverage: null,
            generatedAt: GEN,
            reason: null,
            disclaimer: 'association only',
            confounders: [],
            factors: [{ driverRef: 'cust-1', associatedDimension: 'X', associationShare: 0.5, sampleSize: 3, relationship: 'ASSOCIATED_WITH' }],
            piiTier: 'none',
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'DRIVER_INFLUENCE_REVIEW')).toBe(false);
  });

  it('uses NO_ACTION_NEEDED when evaluable and no triggers', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary(),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations).toHaveLength(0);
    expect(result.emptyState).toBe('NO_ACTION_NEEDED');
  });

  it('uses INSUFFICIENT_EVIDENCE when collection is UNAVAILABLE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: { status: 'UNAVAILABLE', metrics: {}, reason: 'STATION_SCOPE' },
          utilization: { ...e7BaseSummary().sections.utilization, status: 'UNAVAILABLE' },
          strengths: { ...e7BaseSummary().sections.strengths, status: 'UNAVAILABLE' },
          weaknesses: { ...e7BaseSummary().sections.weaknesses, status: 'UNAVAILABLE' },
          costModel: { ...e7BaseSummary().sections.costModel, status: 'UNAVAILABLE' },
          driverInfluence: { ...e7BaseSummary().sections.driverInfluence, status: 'UNAVAILABLE' },
        },
      }),
      quality: e7BaseQuality({ overall: { status: 'UNAVAILABLE', complete: false, reason: 'X' } }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.emptyState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('sorts deterministically by family bucket and severity', () => {
    const summary = e7BaseSummary({
      sections: {
        finance: {
          status: 'AVAILABLE',
          metrics: {
            [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
            [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
          },
          reason: null,
        },
        weaknesses: {
          status: 'AVAILABLE',
          calculationVersion: 'weakness-detection-e4-v3',
          period: E7_FIXTURE_ANALYTICS_PERIOD,
          scope: E7_FIXTURE_SCOPE,
          coverage: null,
          generatedAt: GEN,
          reason: null,
          weaknesses: [
            {
              ruleId: 'HIGH_CANCELLATION_RATE',
              ruleVersion: 'v',
              severity: 'WARNING',
              comparatorBasis: 'PLATFORM_RULE_THRESHOLD',
              evidenceKind: 'OBSERVATION',
              dimension: 'BOOKINGS',
              evidence: { metricId: null, observedValue: 20, comparisonValue: 10, threshold: 10, unit: 'PERCENT', sampleSize: 12 },
            },
          ],
          evaluatedDimensions: ['BOOKINGS'],
          skippedDimensions: [],
        },
      },
    });
    const result = deriveEvaluationsRecommendations({
      summary,
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations[0]?.family).toBe('RECEIVABLES_ATTENTION');
    expect(result.recommendations[1]?.family).toBe('WEAKNESS_ATTENTION');
  });

  it('keeps all actions non-mutating with allowlisted targets', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'JPY', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'JPY', E7_FIXTURE_MTD_PERIOD),
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
    for (const rec of result.recommendations) {
      for (const action of rec.actions) {
        expect(action.mutating).toBe(false);
        expect(action.confirmationRequired).toBe(false);
        expect(['EVALUATIONS_SECTION', 'APPLICATION_ROUTE', 'ENTITY_REFERENCE']).toContain(action.target.kind);
      }
      expect(rec.provenance.calculationVersion).toBe('recommendations-e7-v1');
    }
    expect(JSON.stringify(result)).not.toMatch(/estimatedExposure|forecast|expectedBenefit|confidence/i);
  });
});
