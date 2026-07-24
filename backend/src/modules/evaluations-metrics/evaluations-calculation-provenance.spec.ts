import {
  buildCalculationProvenance,
  parseCalculationProvenance,
  wrapCalculationResult,
  EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION,
} from '@synq/evaluations-metrics/evaluations-calculation-provenance';
import {
  attachInsightCalculationProvenance,
  buildInsightRunProvenance,
  INSIGHT_TYPE_METRIC_ID,
  resolveInsightPeriod,
} from './insight-calculation-provenance';
import { InsightEntityScope, InsightSeverity, InsightType } from '../business-insights/insight.types';
import type { DetectorContext, InsightCandidate } from '../business-insights/insight.types';
import { DEFAULT_POLICY } from '../business-insights/insight.types';

describe('evaluations calculation provenance', () => {
  const now = new Date('2026-06-16T12:00:00.000Z');
  const ctx: DetectorContext = {
    organizationId: 'org-1',
    now,
    policy: { ...DEFAULT_POLICY, lowUtilizationDays: 7 },
  };

  const sampleCandidate: InsightCandidate = {
    type: InsightType.LOW_UTILIZATION,
    severity: InsightSeverity.OPPORTUNITY,
    priority: 50,
    title: 'Low Utilization',
    message: 'idle',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['v1'],
    metrics: { idleDays: 7, lostRevenueAmountMinor: 35_000, lostRevenueCurrency: 'EUR' },
    reasons: ['No bookings'],
    confidence: 1,
    dedupeKey: 'low_utilization:v1',
  };

  it('builds provenance with required fields', () => {
    const p = buildCalculationProvenance({
      metricId: 'fin.mtd_issued_revenue',
      calculationVersion: '1.0.0',
      generatedAt: now,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: now,
      appliedFilters: { organizationId: 'org-1' },
      sourceVersions: { dataSource: 'org_invoices' },
    });

    expect(p.schemaVersion).toBe(EVALUATIONS_CALCULATION_PROVENANCE_SCHEMA_VERSION);
    expect(p.metricId).toBe('fin.mtd_issued_revenue');
    expect(p.calculationVersion).toBe('1.0.0');
    expect(p.generatedAt).toBe(now.toISOString());
    expect(p.completeness).toBe('complete');
  });

  it('wraps values in result envelope', () => {
    const p = buildCalculationProvenance({
      metricId: 'fin.open_receivables',
      calculationVersion: '1.0.0',
      generatedAt: now,
      periodStart: now,
      periodEnd: now,
    });
    const envelope = wrapCalculationResult(42_00, p);
    expect(envelope.value).toBe(42_00);
    expect(envelope.provenance.metricId).toBe('fin.open_receivables');
  });

  it('returns null for legacy missing provenance without inventing defaults', () => {
    expect(parseCalculationProvenance(null)).toBeNull();
    expect(parseCalculationProvenance(undefined)).toBeNull();
    expect(parseCalculationProvenance({ foo: 'bar' })).toBeNull();
  });

  it('round-trips serialized provenance', () => {
    const original = buildCalculationProvenance({
      metricId: 'ins.low_utilization',
      calculationVersion: '1.0.0',
      generatedAt: now,
      periodStart: new Date('2026-06-09T12:00:00.000Z'),
      periodEnd: new Date('2026-06-23T12:00:00.000Z'),
      appliedFilters: { organizationId: 'org-1', insightType: InsightType.LOW_UTILIZATION },
      sourceVersions: { detector: InsightType.LOW_UTILIZATION, dataSources: ['vehicles', 'bookings'] },
      completeness: 'complete',
    });

    const parsed = parseCalculationProvenance(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('attaches per-insight provenance with registry calculationVersion', () => {
    const [withMeta] = attachInsightCalculationProvenance([sampleCandidate], ctx, now);
    expect(withMeta.calculationMeta?.metricId).toBe(INSIGHT_TYPE_METRIC_ID[InsightType.LOW_UTILIZATION]);
    expect(withMeta.calculationMeta?.calculationVersion).toBe('1.0.0');
    expect(withMeta.calculationMeta?.appliedFilters.organizationId).toBe('org-1');
    expect(withMeta.calculationMeta?.sourceVersions.dataSources).toEqual(['vehicles', 'bookings']);
  });

  it('uses rolling lookback period for LOW_UTILIZATION', () => {
    const period = resolveInsightPeriod(InsightType.LOW_UTILIZATION, ctx, sampleCandidate);
    expect(period.periodStart.toISOString()).toBe('2026-06-09T12:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-06-23T12:00:00.000Z');
  });

  it('marks run provenance partial when detectors fail', () => {
    const runMeta = buildInsightRunProvenance({
      organizationId: 'org-1',
      trigger: 'scheduled_30min',
      startedAt: new Date('2026-06-16T12:00:00.000Z'),
      finishedAt: new Date('2026-06-16T12:00:05.000Z'),
      policy: {
        enabledTypes: [InsightType.LOW_UTILIZATION, InsightType.STATION_SHORTAGE],
        maxVisibleInsights: 4,
        refreshIntervalMin: 30,
      },
      detectorFailures: [InsightType.STATION_SHORTAGE],
      publishedMetricIds: ['ins.low_utilization'],
      rankedCandidateCount: 3,
    });

    expect(runMeta.completeness).toBe('partial');
    expect(runMeta.appliedFilters.failedDetectors).toEqual([InsightType.STATION_SHORTAGE]);
  });

  it('marks run provenance degraded when publish truncates ranked candidates', () => {
    const runMeta = buildInsightRunProvenance({
      organizationId: 'org-1',
      trigger: 'manual_admin',
      startedAt: now,
      finishedAt: now,
      policy: {
        enabledTypes: [InsightType.LOW_UTILIZATION],
        maxVisibleInsights: 2,
        refreshIntervalMin: 30,
      },
      detectorFailures: [],
      publishedMetricIds: ['ins.low_utilization', 'ins.station_shortage'],
      rankedCandidateCount: 5,
    });

    expect(runMeta.completeness).toBe('degraded');
  });

  it('supports future calculationVersion without breaking parse', () => {
    const v2 = buildCalculationProvenance({
      metricId: 'fin.mtd_issued_revenue',
      calculationVersion: '2.0.0',
      generatedAt: now,
      periodStart: now,
      periodEnd: now,
      completeness: 'complete',
    });

    const parsed = parseCalculationProvenance(v2);
    expect(parsed?.calculationVersion).toBe('2.0.0');
  });
});
