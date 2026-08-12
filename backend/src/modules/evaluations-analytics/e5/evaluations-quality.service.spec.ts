import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import { EvaluationsQualityService } from './evaluations-quality.service';

const GEN = new Date('2026-02-15T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const period: EvaluationsPeriodWindow = {
  periodType: 'MTD',
  start: '2026-02-01T00:00:00.000Z',
  endExclusive: '2026-03-01T00:00:00.000Z', // future vs GEN → current period
  reference: '2026-02-15T00:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
};

const orgScope: EvaluationsAuthorizedAnalyticsScope = {
  organizationId: 'org-a',
  stationIds: null,
  stationScoped: false,
  period,
};
const stationScope: EvaluationsAuthorizedAnalyticsScope = {
  organizationId: 'org-a',
  stationIds: ['st-1'],
  stationScoped: true,
  period,
};
const actor = { id: 'u1', organizationId: 'org-a', platformRole: 'ORG_ADMIN' };

function coverage(ratio: number | null, missing: string[] = []) {
  return {
    expectedRecords: 3,
    availableRecords: ratio === null ? null : Math.round(3 * (ratio ?? 0)),
    excludedRecords: null,
    ratio,
    missingSources: missing,
  };
}

function summaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: GEN.toISOString(),
    period,
    sections: {
      finance: { status: 'AVAILABLE', metrics: {}, reason: null },
      costModel: { status: 'AVAILABLE', coverage: coverage(1) },
      utilization: { status: 'PARTIAL', coverage: coverage(1, ['VEHICLE_ELIGIBILITY_HISTORY', 'BLOCKED_HISTORY']) },
      strengths: { status: 'PARTIAL', coverage: coverage(0.66) },
      weaknesses: { status: 'PARTIAL', coverage: coverage(0.66) },
      driverInfluence: { status: 'AVAILABLE', coverage: coverage(1) },
      ...overrides,
    },
  };
}

function rangeOf(newest: number | null) {
  return { newestMs: newest, oldestMs: newest === null ? null : newest - 10 * DAY };
}

function buildService(opts: {
  summary?: unknown;
  freshnessNewestMs?: number | null;
  paymentsNewestMs?: number | null;
} = {}) {
  const insights = {
    getSummary: jest.fn().mockResolvedValue(opts.summary ?? summaryFixture()),
  };
  const newest = opts.freshnessNewestMs === undefined ? GEN.getTime() - DAY : opts.freshnessNewestMs;
  const paymentsNewest = opts.paymentsNewestMs === undefined ? newest : opts.paymentsNewestMs;
  const range = rangeOf(newest);
  const repo = {
    financeFreshness: jest.fn().mockResolvedValue(range),
    paymentsFreshness: jest.fn().mockResolvedValue(rangeOf(paymentsNewest)),
    bookingsFreshness: jest.fn().mockResolvedValue(range),
    maintenanceFreshness: jest.fn().mockResolvedValue(range),
    damageFreshness: jest.fn().mockResolvedValue(range),
    telemetrySnapshotNewest: jest.fn().mockResolvedValue(newest),
  };
  const service = new EvaluationsQualityService(insights as never, repo as never);
  return { service, insights, repo };
}

describe('EvaluationsQualityService — org scope', () => {
  it('mirrors E4 section statuses verbatim (never upgrades)', async () => {
    const { service } = buildService();
    const report = await service.getQualityReport(orgScope, actor, GEN);
    const byName = Object.fromEntries(report.sections.map((s) => [s.section, s.status]));
    expect(byName.finance).toBe('AVAILABLE');
    expect(byName.costModel).toBe('AVAILABLE');
    expect(byName.utilization).toBe('PARTIAL');
    expect(byName.strengths).toBe('PARTIAL');
    expect(byName.weaknesses).toBe('PARTIAL');
    expect(byName.driverInfluence).toBe('AVAILABLE');
  });

  it('does not fabricate full coverage: PARTIAL utilization → COMPLETENESS PARTIAL', async () => {
    const { service } = buildService();
    const report = await service.getQualityReport(orgScope, actor, GEN);
    const util = report.sections.find((s) => s.section === 'utilization');
    expect(util?.dimensions.COMPLETENESS).toBe('PARTIAL');
    // Mixed AVAILABLE+PARTIAL sections → PARTIAL roll-up, never upgraded.
    expect(report.overall.status).toBe('PARTIAL');
    expect(report.overall.complete).toBe(false);
  });

  it('E5.1A: freshness is UNKNOWN (no pipeline authority); business recency is exposed separately', async () => {
    const { service } = buildService();
    const report = await service.getQualityReport(orgScope, actor, GEN);
    const finance = report.sections.find((s) => s.section === 'finance');
    // Freshness is never inferred from business recency.
    expect(finance?.freshness?.state).toBe('UNKNOWN');
    expect(finance?.dimensions.FRESHNESS).toBe('UNKNOWN');
    // Business recency is present as distinct activity metadata.
    expect(finance?.businessEventRecency?.newestAt).toBe(new Date(GEN.getTime() - DAY).toISOString());
    // Lineage is opaque source-class only — no raw record ids/PII.
    expect(finance?.lineage.map((l) => l.sourceCategory)).toEqual(
      expect.arrayContaining(['FINANCE_INVOICE', 'FINANCE_PAYMENT']),
    );
    expect(finance?.lineage[0].sourceRef.startsWith('org:org-a:')).toBe(true);
  });

  it('E5.1A: Finance provenance is PARTIAL when Payment provenance is absent, COMPLETE when both present', async () => {
    const partial = await buildService({ paymentsNewestMs: null }).service.getQualityReport(orgScope, actor, GEN);
    const financePartial = partial.sections.find((s) => s.section === 'finance');
    expect(financePartial?.requiredSourceClasses).toEqual(['FINANCE_INVOICE', 'FINANCE_PAYMENT']);
    expect(financePartial?.dimensions.PROVENANCE).toBe('PARTIAL'); // invoice present, payment absent

    const complete = await buildService().service.getQualityReport(orgScope, actor, GEN);
    const financeComplete = complete.sections.find((s) => s.section === 'finance');
    expect(financeComplete?.dimensions.PROVENANCE).toBe('COMPLETE'); // both invoice + payment present
  });

  it('emits UNKNOWN freshness + UNKNOWN provenance (not healthy) when no source data exists', async () => {
    const { service } = buildService({ freshnessNewestMs: null });
    const report = await service.getQualityReport(orgScope, actor, GEN);
    const finance = report.sections.find((s) => s.section === 'finance');
    expect(finance?.freshness?.state).toBe('UNKNOWN');
    expect(finance?.dimensions.FRESHNESS).toBe('UNKNOWN');
    expect(finance?.dimensions.PROVENANCE).toBe('UNKNOWN'); // no present source classes
    expect(finance?.businessEventRecency?.newestAt).toBeNull();
  });

  it('overall is never fully complete while freshness is structurally UNKNOWN', async () => {
    const summary = summaryFixture({
      costModel: { status: 'AVAILABLE', coverage: coverage(1) },
      utilization: { status: 'AVAILABLE', coverage: coverage(1) },
      strengths: { status: 'AVAILABLE', coverage: coverage(1) },
      weaknesses: { status: 'AVAILABLE', coverage: coverage(1) },
    });
    const { service } = buildService({ summary });
    const report = await service.getQualityReport(orgScope, actor, GEN);
    expect(report.overall.status).toBe('AVAILABLE'); // all sections AVAILABLE
    expect(report.overall.complete).toBe(false); // FRESHNESS UNKNOWN blocks full completeness
    expect(report.overall.reason).toBe('QUALITY_INCOMPLETE');
  });
});

describe('EvaluationsQualityService — historical period (no current-state-as-historical)', () => {
  it('exposes historical business recency without fabricating freshness', async () => {
    const historicalPeriod: EvaluationsPeriodWindow = {
      ...period,
      periodType: 'MONTH',
      start: '2025-12-01T00:00:00.000Z',
      endExclusive: '2026-01-01T00:00:00.000Z',
      reference: '2025-12-31T00:00:00.000Z',
    };
    const histScope = { ...orgScope, period: historicalPeriod };
    const newest = Date.parse('2025-12-31T00:00:00.000Z');
    const { service } = buildService({ freshnessNewestMs: newest });
    const report = await service.getQualityReport(histScope as never, actor, GEN);
    const finance = report.sections.find((s) => s.section === 'finance');
    // Freshness is UNKNOWN (never fabricated from a current snapshot); business
    // recency reflects the in-period historical event.
    expect(finance?.freshness?.state).toBe('UNKNOWN');
    expect(finance?.businessEventRecency?.newestAt).toBe(new Date(newest).toISOString());
  });
});

describe('EvaluationsQualityService — station scope (no org-wide leakage)', () => {
  it('does not read org-wide freshness and emits no lineage under a station scope', async () => {
    const stationSummary = summaryFixture({
      finance: { status: 'UNAVAILABLE', metrics: {}, reason: 'STATION_SCOPED_FINANCE_UNSUPPORTED' },
      costModel: { status: 'UNAVAILABLE', coverage: null },
      utilization: { status: 'UNAVAILABLE', coverage: null },
      strengths: { status: 'UNAVAILABLE', coverage: null },
      weaknesses: { status: 'UNAVAILABLE', coverage: null },
      driverInfluence: { status: 'UNAVAILABLE', coverage: null },
    });
    const { service, repo } = buildService({ summary: stationSummary });
    const report = await service.getQualityReport(stationScope, actor, GEN);
    expect(repo.financeFreshness).not.toHaveBeenCalled();
    expect(repo.paymentsFreshness).not.toHaveBeenCalled();
    expect(repo.bookingsFreshness).not.toHaveBeenCalled();
    for (const section of report.sections) {
      expect(section.freshness).toBeNull();
      expect(section.businessEventRecency).toBeNull();
      expect(section.lineage).toEqual([]);
      expect(section.status).toBe('UNAVAILABLE');
    }
    expect(report.overall.status).toBe('UNAVAILABLE');
    expect(JSON.stringify(report)).not.toContain('org:org-a:OrgInvoice');
  });
});
