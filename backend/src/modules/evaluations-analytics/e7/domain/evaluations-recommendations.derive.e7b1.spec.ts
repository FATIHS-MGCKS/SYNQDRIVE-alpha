import {
  assertValidE7ActionTarget,
  E7InvalidActionTargetError,
} from '@synq/evaluations-recommendations/evaluations-recommendations-action-target';
import {
  deriveEvaluationsRecommendations,
  E7_FINANCE_METRIC_OPEN,
  E7_FINANCE_METRIC_OVERDUE,
  qualityLimitationKey,
  qualityLimitationsForSections,
} from './evaluations-recommendations.derive';
import {
  e7BaseQuality,
  e7BaseSummary,
  e7MoneyMetric,
  E7_FIXTURE_ANALYTICS_PERIOD,
  E7_FIXTURE_MTD_PERIOD,
  E7_FIXTURE_SCOPE,
} from './evaluations-recommendations.fixtures';

const GEN = '2026-02-15T00:00:00.000Z';

function fullyAvailableSummary(
  overrides: Parameters<typeof e7BaseSummary>[0] = {},
): ReturnType<typeof e7BaseSummary> {
  const base = e7BaseSummary();
  return e7BaseSummary({
    ...overrides,
    sections: {
      ...base.sections,
      utilization: { ...base.sections.utilization, status: 'AVAILABLE' },
      driverInfluence: {
        ...base.sections.driverInfluence,
        status: 'NOT_APPLICABLE',
        reason: 'NOT_REQUESTED',
        piiTier: 'none',
        factors: [],
      },
      ...overrides.sections,
    },
  });
}

describe('E7B.1 recommendation authority conformance', () => {
  it('1. Finance AVAILABLE positive overdue emits', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
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
  });

  it('2. Finance PARTIAL positive overdue suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(
                E7_FINANCE_METRIC_OVERDUE,
                100,
                'EUR',
                E7_FIXTURE_MTD_PERIOD,
                'PARTIAL',
              ),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
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
    expect(result.recommendations.some((r) => r.family === 'RECEIVABLES_ATTENTION')).toBe(false);
  });

  it('3. Finance STALE positive overdue suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'STALE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(
                E7_FINANCE_METRIC_OVERDUE,
                100,
                'EUR',
                E7_FIXTURE_MTD_PERIOD,
                'STALE',
              ),
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
    expect(result.recommendations.some((r) => r.family === 'RECEIVABLES_ATTENTION')).toBe(false);
  });

  it('4. Finance UNAVAILABLE positive-looking fixture suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'UNAVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(
                E7_FINANCE_METRIC_OVERDUE,
                100,
                'EUR',
                E7_FIXTURE_MTD_PERIOD,
                'UNAVAILABLE',
              ),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD, 'UNAVAILABLE'),
            },
            reason: 'NO_DATA',
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'RECEIVABLES_ATTENTION')).toBe(false);
  });

  it('5. Open receivables AVAILABLE emits', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 500, 'EUR', E7_FIXTURE_MTD_PERIOD),
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

  it('6. Driver AVAILABLE + factors emits', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'AVAILABLE',
            reason: null,
            piiTier: 'full',
            factors: [
              {
                driverRef: 'cust-1',
                associatedDimension: 'LATE',
                associationShare: 0.5,
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
    expect(result.recommendations.some((r) => r.family === 'DRIVER_INFLUENCE_REVIEW')).toBe(true);
  });

  it('7. Driver PARTIAL + factors suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'PARTIAL',
            reason: 'PARTIAL',
            piiTier: 'full',
            factors: [
              {
                driverRef: 'cust-1',
                associatedDimension: 'LATE',
                associationShare: 0.5,
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
    expect(result.recommendations.some((r) => r.family === 'DRIVER_INFLUENCE_REVIEW')).toBe(false);
  });

  it('8. Driver PARTIAL + zero factors suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'PARTIAL',
            piiTier: 'full',
            factors: [],
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

  it('9. Driver AVAILABLE + zero factors suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'AVAILABLE',
            reason: null,
            piiTier: 'full',
            factors: [],
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

  it('10. Driver piiTier none suppresses', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          driverInfluence: {
            ...e7BaseSummary().sections.driverInfluence,
            status: 'AVAILABLE',
            piiTier: 'none',
            factors: [
              {
                driverRef: 'cust-1',
                associatedDimension: 'LATE',
                associationShare: 0.5,
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
    expect(result.recommendations.some((r) => r.family === 'DRIVER_INFLUENCE_REVIEW')).toBe(false);
  });

  it('11. Cost PARTIAL + unsupported source emits', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
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

  it('12. Cost UNAVAILABLE suppresses cost recommendation', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          costModel: {
            ...e7BaseSummary().sections.costModel,
            status: 'UNAVAILABLE',
            reason: 'NO_DATA',
            categories: [],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'COST_EVIDENCE_INCOMPLETE')).toBe(false);
  });

  it('13. Cost PARTIAL without canonical missing-source evidence does not fabricate', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          costModel: {
            ...e7BaseSummary().sections.costModel,
            status: 'PARTIAL',
            reason: null,
            categories: [],
          },
        },
      }),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'COST_EVIDENCE_INCOMPLETE')).toBe(false);
  });

  it('14. source-specific quality limitations attached', () => {
    const quality = e7BaseQuality({
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
    });
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
            },
            reason: null,
          },
        },
      }),
      quality,
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    const rec = result.recommendations.find((r) => r.family === 'RECEIVABLES_ATTENTION');
    expect(rec?.provenance.qualityLimitations.length).toBeGreaterThan(0);
    expect(rec?.provenance.qualityLimitations.some((l) => l.section === 'finance')).toBe(true);
  });

  it('15. structural freshness UNKNOWN preserved in provenance', () => {
    const quality = e7BaseQuality();
    const limits = qualityLimitationsForSections(quality, ['finance']);
    expect(limits.some((l) => l.dimension === 'FRESHNESS' && l.state === 'UNKNOWN')).toBe(true);
  });

  it('16. freshness UNKNOWN alone does not create standalone quality rec', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary(),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'DATA_QUALITY_LIMITED')).toBe(false);
  });

  it('17. cost-specific + unrelated finance limitation preserves generic quality rec', () => {
    const quality = e7BaseQuality({
      sections: [
        {
          section: 'costModel',
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
          requiredSourceClasses: ['COST'],
          lineage: [],
          reason: 'MISSING_SOURCES',
        },
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
          reason: 'FINANCE_PARTIAL',
        },
      ],
    });
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
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
      quality,
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'COST_EVIDENCE_INCOMPLETE')).toBe(true);
    expect(result.recommendations.some((r) => r.family === 'DATA_QUALITY_LIMITED')).toBe(true);
  });

  it('18. skipped-specific + unrelated provenance limitation preserves generic quality rec', () => {
    const quality = e7BaseQuality({
      sections: [
        {
          section: 'weaknesses',
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
          requiredSourceClasses: ['BOOKINGS'],
          lineage: [],
          reason: 'SKIPPED',
        },
        {
          section: 'utilization',
          status: 'PARTIAL',
          dimensions: {
            FRESHNESS: 'UNKNOWN',
            COMPLETENESS: 'PARTIAL',
            PROVENANCE: 'PARTIAL',
            VALIDITY: 'UNKNOWN',
            TEMPORAL_APPLICABILITY: 'COMPLETE',
          },
          freshness: null,
          businessEventRecency: null,
          coverage: null,
          requiredSourceClasses: ['UTILIZATION'],
          lineage: [],
          reason: 'PROVENANCE_GAP',
        },
      ],
    });
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          weaknesses: {
            ...e7BaseSummary().sections.weaknesses,
            status: 'PARTIAL',
            skippedDimensions: [{ dimension: 'DRIVER', reason: 'PRIVACY_TIER' }],
            weaknesses: [],
          },
        },
      }),
      quality,
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.recommendations.some((r) => r.family === 'DETECTION_INPUT_SKIPPED')).toBe(true);
    const generic = result.recommendations.find((r) => r.family === 'DATA_QUALITY_LIMITED');
    expect(generic).toBeDefined();
    expect(generic?.provenance.qualityLimitations.some((l) => l.section === 'utilization')).toBe(true);
  });

  it('19. AVAILABLE + zero triggers -> NO_ACTION_NEEDED', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary(),
      quality: e7BaseQuality({ overall: { status: 'AVAILABLE', complete: true, reason: null } }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.recommendations).toHaveLength(0);
    expect(result.emptyState).toBe('NO_ACTION_NEEDED');
  });

  it('20. PARTIAL + zero recs -> INSUFFICIENT_EVIDENCE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary(),
      quality: e7BaseQuality(),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.recommendations).toHaveLength(0);
    expect(result.emptyState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('21. STALE + zero recs -> INSUFFICIENT_EVIDENCE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'STALE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
            },
            reason: 'STALE',
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

  it('22. UNAVAILABLE + zero recs -> INSUFFICIENT_EVIDENCE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: e7BaseSummary({
        sections: {
          finance: { status: 'UNAVAILABLE', metrics: {}, reason: 'NO_DATA' },
          utilization: { ...e7BaseSummary().sections.utilization, status: 'UNAVAILABLE' },
          strengths: { ...e7BaseSummary().sections.strengths, status: 'UNAVAILABLE' },
          weaknesses: { ...e7BaseSummary().sections.weaknesses, status: 'UNAVAILABLE' },
          costModel: { ...e7BaseSummary().sections.costModel, status: 'UNAVAILABLE' },
          driverInfluence: { ...e7BaseSummary().sections.driverInfluence, status: 'UNAVAILABLE' },
        },
      }),
      quality: e7BaseQuality({ overall: { status: 'UNAVAILABLE', complete: false, reason: 'NO_DATA' } }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.emptyState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('23. ERROR + zero recs -> INSUFFICIENT_EVIDENCE', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          costModel: { ...e7BaseSummary().sections.costModel, status: 'ERROR', reason: 'ERROR' },
        },
      }),
      quality: e7BaseQuality({ overall: { status: 'ERROR', complete: false, reason: 'ERROR' } }),
      requestPeriod: E7_FIXTURE_ANALYTICS_PERIOD,
      scope: E7_FIXTURE_SCOPE,
      generatedAt: GEN,
    });
    expect(result.status).toBe('ERROR');
    expect(result.emptyState).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('24. valid section action accepted', () => {
    expect(() =>
      assertValidE7ActionTarget({ kind: 'EVALUATIONS_SECTION', value: 'finance' }),
    ).not.toThrow();
  });

  it('25. invalid section target rejected', () => {
    expect(() =>
      assertValidE7ActionTarget({ kind: 'EVALUATIONS_SECTION', value: 'evil-section' as never }),
    ).toThrow(E7InvalidActionTargetError);
  });

  it('26. valid application route accepted', () => {
    expect(() =>
      assertValidE7ActionTarget({ kind: 'APPLICATION_ROUTE', value: 'financial-insights' }),
    ).not.toThrow();
  });

  it('27. invalid application route rejected', () => {
    expect(() =>
      assertValidE7ActionTarget({ kind: 'APPLICATION_ROUTE', value: 'https://evil.example' as never }),
    ).toThrow(E7InvalidActionTargetError);
  });

  it('28. no arbitrary external URL in serialized payload', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
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
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\//);
  });

  it('29. all actions remain mutating=false', () => {
    const result = deriveEvaluationsRecommendations({
      summary: fullyAvailableSummary({
        sections: {
          finance: {
            status: 'AVAILABLE',
            metrics: {
              [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
              [E7_FINANCE_METRIC_OPEN]: e7MoneyMetric(E7_FINANCE_METRIC_OPEN, 0, 'EUR', E7_FIXTURE_MTD_PERIOD),
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
      }
    }
  });

  it('30. stable ids unchanged for unchanged accepted evidence', () => {
    const summary = fullyAvailableSummary({
      sections: {
        finance: {
          status: 'AVAILABLE',
          metrics: {
            [E7_FINANCE_METRIC_OVERDUE]: e7MoneyMetric(E7_FINANCE_METRIC_OVERDUE, 100, 'EUR', E7_FIXTURE_MTD_PERIOD),
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

  it('documents limitation keys for supersession', () => {
    const key = qualityLimitationKey({
      section: 'finance',
      dimension: 'COMPLETENESS',
      state: 'PARTIAL',
      reason: 'X',
    });
    expect(key).toBe('finance:COMPLETENESS:PARTIAL:X');
  });
});
