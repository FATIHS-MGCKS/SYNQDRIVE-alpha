import { requireEvaluationsMetricDefinition } from '@modules/evaluations-metrics';
import {
  buildAvailableEvaluationsMetric,
  buildUnavailableEvaluationsMetric,
} from '@synq/evaluations-metrics/evaluations-metric-response.builder';
import type { EvaluationsMetricResponse } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import { EvaluationsInsightsService } from './evaluations-insights.service';

const GEN = new Date('2026-01-31T12:00:00.000Z');

const period: EvaluationsPeriodWindow = {
  periodType: 'MTD',
  start: '2026-01-01T00:00:00.000Z',
  endExclusive: '2026-02-01T00:00:00.000Z',
  reference: '2026-01-31T00:00:00.000Z',
  timezone: {
    effectiveTimezone: 'Europe/Berlin',
    source: 'ORGANIZATION',
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'Europe/Berlin',
  },
  comparisonBasis: null,
};

const START = Date.parse(period.start);
const END = Date.parse(period.endExclusive);

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

// Historical period fully in the past relative to GEN (endExclusive <= GEN).
const historicalPeriod: EvaluationsPeriodWindow = {
  ...period,
  periodType: 'MONTH',
  start: '2025-12-01T00:00:00.000Z',
  endExclusive: '2026-01-01T00:00:00.000Z',
  reference: '2025-12-31T00:00:00.000Z',
};
const HIST_START = Date.parse(historicalPeriod.start);
const HIST_END = Date.parse(historicalPeriod.endExclusive);
const historicalScope: EvaluationsAuthorizedAnalyticsScope = {
  organizationId: 'org-a',
  stationIds: null,
  stationScoped: false,
  period: historicalPeriod,
};

const actor = { id: 'user-1', organizationId: 'org-a', platformRole: 'ORG_ADMIN' };

function financeMetric(
  id: string,
  kind: 'money' | 'percent',
  value: unknown,
): EvaluationsMetricResponse {
  const def = requireEvaluationsMetricDefinition(id);
  return buildAvailableEvaluationsMetric({
    metricId: id,
    metricKind: def.metricKind,
    calculationVersion: def.calculationVersion,
    period,
    generatedAt: GEN,
    ...(kind === 'money'
      ? { valueType: 'MONEY', unit: 'CURRENCY_MINOR', value: value as never }
      : { valueType: 'SIGNED_PERCENT', unit: 'PERCENT', value: value as never }),
  });
}

function availableFinance(): Record<string, EvaluationsMetricResponse> {
  return {
    'fin.mtd_issued_revenue': financeMetric('fin.mtd_issued_revenue', 'money', {
      amountMinor: 100000,
      currency: 'EUR',
    }),
    'fin.profit_margin_mtd': financeMetric('fin.profit_margin_mtd', 'percent', 25),
  };
}

function unavailableFinance(): Record<string, EvaluationsMetricResponse> {
  const def = requireEvaluationsMetricDefinition('fin.mtd_issued_revenue');
  return {
    'fin.mtd_issued_revenue': buildUnavailableEvaluationsMetric({
      metricId: 'fin.mtd_issued_revenue',
      metricKind: def.metricKind,
      calculationVersion: def.calculationVersion,
      period,
      generatedAt: GEN,
      valueType: 'MONEY',
      unit: 'CURRENCY_MINOR',
      reason: 'STATION_SCOPED_FINANCE_UNSUPPORTED',
    }),
  };
}

function fullyRentedVehicle() {
  return {
    vehicleId: `v-${Math.random()}`,
    eligibility: { startMs: START, endExclusiveMs: END },
    rented: [{ startMs: START, endExclusiveMs: END }],
    maintenance: [],
    blocked: [],
  };
}

function buildService(overrides: {
  financeMetrics?: Record<string, EvaluationsMetricResponse>;
  repo?: Partial<Record<string, jest.Mock>>;
  piiTier?: 'full' | 'pseudonymous' | 'none';
}) {
  const financeMock = {
    computeFinancialInsights: jest.fn().mockResolvedValue({
      organizationId: 'org-a',
      period,
      metrics: overrides.financeMetrics ?? availableFinance(),
    }),
  };
  const repo = {
    resolveReportingCurrency: jest.fn().mockResolvedValue('EUR'),
    loadCostEvents: jest.fn().mockResolvedValue([
      {
        category: 'OPERATING_EXPENSES',
        nature: 'ACTUAL',
        amountMinor: 5000,
        currency: 'EUR',
        economicKey: 'invoice:1',
        businessAtMs: START + 1000,
      },
    ]),
    loadUnsupportedCostSources: jest.fn().mockResolvedValue({
      serviceCaseCount: 0,
      damageCount: 0,
      fixedConfigVehicleCount: 0,
      vehicleCount: 3,
    }),
    loadUtilizationFacts: jest.fn().mockResolvedValue({
      vehicles: [fullyRentedVehicle(), fullyRentedVehicle(), fullyRentedVehicle()],
      telemetryOfflineVehicles: 1,
      vehicleCount: 3,
    }),
    loadBookingOutcomes: jest.fn().mockResolvedValue({ totalOutcomes: 20, cancelledPlusNoShow: 1 }),
    loadDriverObservations: jest.fn().mockResolvedValue({
      observations: [
        { driverRef: 'driver-a', dimension: 'BOOKING_CANCELLATIONS', count: 6 },
        { driverRef: 'driver-b', dimension: 'BOOKING_CANCELLATIONS', count: 4 },
      ],
      unattributedCount: 2,
    }),
    ...overrides.repo,
  } as never;
  const privacy = { resolvePiiTier: jest.fn().mockResolvedValue(overrides.piiTier ?? 'full') };
  const audit = { recordPersonLevelAccess: jest.fn().mockResolvedValue(undefined) };
  const service = new EvaluationsInsightsService(
    financeMock as never,
    repo as never,
    privacy as never,
    audit as never,
  );
  return { service, financeMock, privacy, audit, repo: repo as unknown as Record<string, jest.Mock> };
}

describe('EvaluationsInsightsService — org scope', () => {
  it('composes all sections and delegates finance to E3 verbatim', async () => {
    const { service, financeMock } = buildService({});
    const summary = await service.getSummary(orgScope, actor, GEN);

    expect(financeMock.computeFinancialInsights).toHaveBeenCalledTimes(1);
    expect(financeMock.computeFinancialInsights).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-a', requestedStationIds: null }),
    );
    expect(summary.sections.finance.status).toBe('AVAILABLE');
    expect(summary.sections.finance.metrics['fin.mtd_issued_revenue'].value).toEqual({
      amountMinor: 100000,
      currency: 'EUR',
    });
    expect(summary.sections.costModel.status).toBe('AVAILABLE');
    expect(summary.sections.costModel.totalsByCurrency).toEqual([{ amountMinor: 5000, currency: 'EUR' }]);
    // Coverage-limited (scheduled occupancy, approximate eligibility, unknown
    // blocked) → PARTIAL, never AVAILABLE; value + PARTIAL + coverage.
    expect(summary.sections.utilization.status).toBe('PARTIAL');
    expect(summary.sections.utilization.utilizationPercent.status).toBe('PARTIAL');
    expect(summary.sections.utilization.utilizationPercent.value).toBe(100);
    expect(summary.sections.utilization.occupancyBasis).toBe('SCHEDULED');
    // Blocked has no authoritative source → null, never a synthetic 0.
    expect(summary.sections.utilization.blockedMs).toBeNull();
    // Current period (GEN < endExclusive) → current telemetry snapshot surfaced.
    expect(summary.sections.utilization.telemetryOfflineVehicles).toBe(1);
    expect(summary.sections.utilization.telemetrySnapshotAsOf).toBe(GEN.toISOString());
    // Utilization is PARTIAL → skipped from detection; the section is PARTIAL and
    // does not emit HIGH_UTILIZATION as fully AVAILABLE evidence. Finance/booking
    // rules still evaluate.
    expect(summary.sections.strengths.status).toBe('PARTIAL');
    expect(summary.sections.strengths.strengths.map((s) => s.ruleId)).toContain('LOW_CANCELLATION_RATE');
    expect(summary.sections.strengths.strengths.map((s) => s.ruleId)).not.toContain('HIGH_UTILIZATION');
    expect(summary.sections.strengths.skippedDimensions.map((d) => d.dimension)).toContain('UTILIZATION');
    expect(summary.sections.strengths.evaluatedDimensions).toEqual(
      expect.arrayContaining(['FINANCE', 'BOOKINGS']),
    );
    expect(summary.sections.driverInfluence.status).toBe('AVAILABLE');
    expect(summary.sections.driverInfluence.disclaimer).toContain('Correlation is not causation');
  });

  it('never surfaces unsafe financial-exposure heuristics', async () => {
    const { service } = buildService({});
    const summary = await service.getSummary(orgScope, actor, GEN);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('estimatedFinancialExposure');
    expect(serialized).not.toContain('financialImpactEur');
    expect(serialized).not.toContain('lostRevenue');
  });

  it('reconciles direct endpoints with summary sections (no mismatch)', async () => {
    const { service } = buildService({});
    const summary = await service.getSummary(orgScope, actor, GEN);
    const directStrengths = await service.getStrengths(orgScope, actor, GEN);
    const directWeaknesses = await service.getWeaknesses(orgScope, actor, GEN);
    expect(directStrengths.strengths).toEqual(summary.sections.strengths.strengths);
    expect(directWeaknesses.weaknesses).toEqual(summary.sections.weaknesses.weaknesses);
  });

  it('scopes every repository query to the request organization', async () => {
    const { service, repo } = buildService({});
    await service.getSummary(orgScope, actor, GEN);
    for (const method of ['loadCostEvents', 'loadUtilizationFacts', 'loadDriverObservations', 'loadBookingOutcomes']) {
      expect(repo[method]).toHaveBeenCalled();
      expect(repo[method].mock.calls[0][0]).toBe('org-a');
    }
  });
});

describe('EvaluationsInsightsService — station scope fails closed (no org fallback, no false zero)', () => {
  it('degrades cost/utilization/driver/detection to UNAVAILABLE with specific reasons', async () => {
    const { service, repo } = buildService({ financeMetrics: unavailableFinance() });
    const summary = await service.getSummary(stationScope, actor, GEN);

    expect(summary.sections.finance.status).toBe('UNAVAILABLE');
    expect(summary.sections.costModel.status).toBe('UNAVAILABLE');
    expect(summary.sections.costModel.reason).toBe('COST_STATION_LINEAGE_UNAVAILABLE');
    expect(summary.sections.costModel.totalsByCurrency).toEqual([]);
    expect(summary.sections.utilization.status).toBe('UNAVAILABLE');
    expect(summary.sections.utilization.reason).toBe('STATION_UTILIZATION_HISTORY_UNAVAILABLE');
    expect(summary.sections.utilization.utilizationPercent.value).toBeNull();
    // UNAVAILABLE ≠ zero: every analytical quantity is null, not a synthetic 0.
    const util = summary.sections.utilization;
    expect(util.capacityMs).toBeNull();
    expect(util.rentedMs).toBeNull();
    expect(util.maintenanceMs).toBeNull();
    expect(util.blockedMs).toBeNull();
    expect(util.netCapacityMs).toBeNull();
    expect(util.eligibleVehicles).toBeNull();
    expect(util.overlappingBookingPairs).toBeNull();
    expect(util.telemetryOfflineVehicles).toBeNull();
    expect(summary.sections.driverInfluence.status).toBe('UNAVAILABLE');
    expect(summary.sections.strengths.status).toBe('UNAVAILABLE');
    expect(summary.sections.strengths.strengths).toEqual([]);
    expect(summary.sections.weaknesses.status).toBe('UNAVAILABLE');

    // No org-wide source read happened under a station scope (no fallback).
    expect(repo.loadCostEvents).not.toHaveBeenCalled();
    expect(repo.loadUtilizationFacts).not.toHaveBeenCalled();
    expect(repo.loadDriverObservations).not.toHaveBeenCalled();
    expect(repo.loadBookingOutcomes).not.toHaveBeenCalled();
  });
});

describe('EvaluationsInsightsService — section isolation', () => {
  it('keeps valid sections when one section fails (no zeroing)', async () => {
    const { service } = buildService({
      repo: { loadUtilizationFacts: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    const summary = await service.getSummary(orgScope, actor, GEN);
    expect(summary.sections.utilization.status).toBe('ERROR');
    expect(summary.sections.utilization.reason).toBe('UTILIZATION_SECTION_ERROR');
    // ERROR ≠ empty fleet: no synthetic zeros.
    expect(summary.sections.utilization.capacityMs).toBeNull();
    expect(summary.sections.utilization.eligibleVehicles).toBeNull();
    expect(summary.sections.utilization.blockedMs).toBeNull();
    // Unrelated sections survive.
    expect(summary.sections.finance.status).toBe('AVAILABLE');
    expect(summary.sections.costModel.status).toBe('AVAILABLE');
  });
});

describe('EvaluationsInsightsService — cost currency safety', () => {
  it('segments mixed currency without a false blended total (PARTIAL)', async () => {
    const { service } = buildService({
      repo: {
        loadCostEvents: jest.fn().mockResolvedValue([
          { category: 'OPERATING_EXPENSES', nature: 'ACTUAL', amountMinor: 5000, currency: 'EUR', economicKey: 'invoice:1', businessAtMs: START + 1000 },
          { category: 'OPERATING_EXPENSES', nature: 'ACTUAL', amountMinor: 7000, currency: 'USD', economicKey: 'invoice:2', businessAtMs: START + 2000 },
        ]),
      },
    });
    const cost = await service.getCostModel(orgScope, GEN);
    expect(cost.status).toBe('PARTIAL');
    expect(cost.mixedCurrency).toBe(true);
    expect(cost.totalsByCurrency).toEqual([
      { amountMinor: 5000, currency: 'EUR' },
      { amountMinor: 7000, currency: 'USD' },
    ]);
  });

  it('returns UNAVAILABLE (not €0) when there are no cost sources', async () => {
    const { service } = buildService({
      repo: {
        loadCostEvents: jest.fn().mockResolvedValue([]),
        loadUnsupportedCostSources: jest.fn().mockResolvedValue({
          serviceCaseCount: 0,
          damageCount: 0,
          fixedConfigVehicleCount: 0,
          vehicleCount: 3,
        }),
      },
    });
    const cost = await service.getCostModel(orgScope, GEN);
    expect(cost.status).toBe('UNAVAILABLE');
    expect(cost.totalsByCurrency).toEqual([]);
    expect(cost.reason).toBe('NO_COST_SOURCE');
  });

  it('marks ServiceCase/Damage/fixed costs UNSUPPORTED (unproven currency/periodicity) → PARTIAL, never €0', async () => {
    const { service } = buildService({
      repo: {
        loadCostEvents: jest.fn().mockResolvedValue([
          { category: 'OPERATING_EXPENSES', nature: 'ACTUAL', amountMinor: 5000, currency: 'EUR', economicKey: 'invoice:1', businessAtMs: START + 1000 },
        ]),
        loadUnsupportedCostSources: jest.fn().mockResolvedValue({
          serviceCaseCount: 2,
          damageCount: 1,
          fixedConfigVehicleCount: 4,
          vehicleCount: 4,
        }),
      },
    });
    const cost = await service.getCostModel(orgScope, GEN);
    expect(cost.status).toBe('PARTIAL');
    expect(cost.reason).toBe('COST_MODEL_INCOMPLETE_UNSUPPORTED_CATEGORIES');
    // Authoritative invoice cost present; recorded/fixed reported as UNAVAILABLE.
    expect(cost.totalsByCurrency).toEqual([{ amountMinor: 5000, currency: 'EUR' }]);
    const byCat = Object.fromEntries(cost.categories.map((c) => [c.category, c]));
    expect(byCat.OPERATING_EXPENSES.status).toBe('AVAILABLE');
    expect(byCat.UNPLANNED_MAINTENANCE.status).toBe('UNAVAILABLE');
    expect(byCat.UNPLANNED_MAINTENANCE.totalsByCurrency).toEqual([]);
    expect(byCat.UNPLANNED_MAINTENANCE.reason).toBe('SERVICECASE_COST_CURRENCY_UNPROVEN');
    expect(byCat.DAMAGE_REPAIR.reason).toBe('DAMAGE_COST_CURRENCY_UNPROVEN');
    expect(byCat.ESTIMATED_FIXED_COSTS.reason).toBe('FIXED_COST_PERIODICITY_AND_HISTORY_UNPROVEN');
  });

  it('returns UNAVAILABLE when only unsupported sources exist (no authoritative invoice cost)', async () => {
    const { service } = buildService({
      repo: {
        loadCostEvents: jest.fn().mockResolvedValue([]),
        loadUnsupportedCostSources: jest.fn().mockResolvedValue({
          serviceCaseCount: 3,
          damageCount: 0,
          fixedConfigVehicleCount: 0,
          vehicleCount: 5,
        }),
      },
    });
    const cost = await service.getCostModel(orgScope, GEN);
    expect(cost.status).toBe('UNAVAILABLE');
    expect(cost.reason).toBe('COST_SOURCES_UNSUPPORTED');
    expect(cost.totalsByCurrency).toEqual([]);
  });
});

describe('EvaluationsInsightsService — E5B person-level privacy gating', () => {
  it('full tier reveals raw org-scoped driver references', async () => {
    const { service } = buildService({ piiTier: 'full' });
    const driver = await service.getDriverInfluence(orgScope, actor, GEN);
    expect(driver.piiTier).toBe('full');
    expect(driver.status).toBe('AVAILABLE');
    expect(driver.factors.map((f) => f.driverRef)).toEqual(expect.arrayContaining(['driver-a', 'driver-b']));
  });

  it('pseudonymous tier redacts driver references to non-reversible pseudonyms', async () => {
    const { service } = buildService({ piiTier: 'pseudonymous' });
    const driver = await service.getDriverInfluence(orgScope, actor, GEN);
    expect(driver.piiTier).toBe('pseudonymous');
    expect(driver.status).toBe('AVAILABLE');
    for (const factor of driver.factors) {
      expect(factor.driverRef.startsWith('person-····')).toBe(true);
    }
    // No raw identity leaks in the serialized response.
    const serialized = JSON.stringify(driver);
    expect(serialized).not.toContain('driver-a');
    expect(serialized).not.toContain('driver-b');
  });

  it('none tier denies person-level access server-side (UNAVAILABLE, no factors)', async () => {
    const { service, audit } = buildService({ piiTier: 'none' });
    const driver = await service.getDriverInfluence(orgScope, actor, GEN);
    expect(driver.piiTier).toBe('none');
    expect(driver.status).toBe('UNAVAILABLE');
    expect(driver.reason).toBe('PERSON_LEVEL_ACCESS_DENIED');
    expect(driver.factors).toEqual([]);
    expect(JSON.stringify(driver)).not.toContain('driver-a');
    // E5C: denied access recorded honestly, actor from server context, no PII.
    expect(audit.recordPersonLevelAccess).toHaveBeenCalledTimes(1);
    const rec = audit.recordPersonLevelAccess.mock.calls[0][0];
    expect(rec.result).toBe('DENIED');
    expect(rec.actorUserId).toBe('user-1');
    expect(rec.organizationId).toBe('org-a');
    expect(JSON.stringify(rec)).not.toContain('driver-a');
  });

  it('E5C: authorized person-level access records SUCCEEDED with non-PII metadata only', async () => {
    const { service, audit } = buildService({ piiTier: 'full' });
    await service.getDriverInfluence(orgScope, actor, GEN);
    expect(audit.recordPersonLevelAccess).toHaveBeenCalledTimes(1);
    const rec = audit.recordPersonLevelAccess.mock.calls[0][0];
    expect(rec.result).toBe('SUCCEEDED');
    expect(rec.actorUserId).toBe('user-1');
    expect(rec.piiTier).toBe('full');
    // Records only aggregate counts + tier — never driver identifiers.
    expect(JSON.stringify(rec)).not.toContain('driver-a');
    expect(JSON.stringify(rec)).not.toContain('driver-b');
  });

  it('summary applies the same person-level gate to its driverInfluence section', async () => {
    const { service } = buildService({ piiTier: 'none' });
    const summary = await service.getSummary(orgScope, actor, GEN);
    expect(summary.sections.driverInfluence.status).toBe('UNAVAILABLE');
    expect(summary.sections.driverInfluence.reason).toBe('PERSON_LEVEL_ACCESS_DENIED');
    expect(JSON.stringify(summary.sections.driverInfluence)).not.toContain('driver-a');
  });
});

describe('EvaluationsInsightsService — E4.2 detection coverage & temporal signal', () => {
  it('PARTIAL utilization cannot produce a fully AVAILABLE HIGH_UTILIZATION strength', async () => {
    const { service } = buildService({});
    const strengths = await service.getStrengths(orgScope, actor, GEN);
    // Utilization is structurally PARTIAL → skipped; section PARTIAL, no HIGH_UTILIZATION.
    expect(strengths.status).toBe('PARTIAL');
    expect(strengths.strengths.map((s) => s.ruleId)).not.toContain('HIGH_UTILIZATION');
    expect(strengths.skippedDimensions.map((d) => d.dimension)).toContain('UTILIZATION');
    const utilSkip = strengths.skippedDimensions.find((d) => d.dimension === 'UTILIZATION');
    expect(utilSkip?.reason).toBe('UTILIZATION_SOURCE_PARTIAL');
  });

  it('PARTIAL utilization (30%) cannot produce a fully AVAILABLE UNDERUTILIZATION weakness', async () => {
    const { service } = buildService({
      repo: {
        loadUtilizationFacts: jest.fn().mockResolvedValue({
          vehicles: [
            { vehicleId: 'v1', eligibility: { startMs: START, endExclusiveMs: END }, rented: [{ startMs: START, endExclusiveMs: START + (END - START) * 0.3 }], maintenance: [], blocked: [] },
            { vehicleId: 'v2', eligibility: { startMs: START, endExclusiveMs: END }, rented: [], maintenance: [], blocked: [] },
            { vehicleId: 'v3', eligibility: { startMs: START, endExclusiveMs: END }, rented: [], maintenance: [], blocked: [] },
          ],
          telemetryOfflineVehicles: 0,
          vehicleCount: 3,
        }),
      },
    });
    const weaknesses = await service.getWeaknesses(orgScope, actor, GEN);
    expect(weaknesses.status).toBe('PARTIAL');
    expect(weaknesses.weaknesses.map((w) => w.ruleId)).not.toContain('UNDERUTILIZATION');
    expect(weaknesses.skippedDimensions.map((d) => d.dimension)).toContain('UTILIZATION');
  });

  it('empty detection items + a skipped dimension does not become fully AVAILABLE', async () => {
    // Finance healthy (no weakness), bookings evaluated but no cancellation
    // weakness, utilization PARTIAL (skipped) → weaknesses=[] but section PARTIAL.
    const { service } = buildService({});
    const weaknesses = await service.getWeaknesses(orgScope, actor, GEN);
    expect(weaknesses.weaknesses).toEqual([]);
    expect(weaknesses.status).toBe('PARTIAL');
    expect(weaknesses.status).not.toBe('AVAILABLE');
    expect(weaknesses.skippedDimensions.length).toBeGreaterThan(0);
  });

  it('summary preserves detection PARTIAL status (no upgrade)', async () => {
    const { service } = buildService({});
    const summary = await service.getSummary(orgScope, actor, GEN);
    expect(summary.sections.strengths.status).toBe('PARTIAL');
    expect(summary.sections.weaknesses.status).toBe('PARTIAL');
  });

  it('historical period does not present current latestState.online as a period fact', async () => {
    const { service } = buildService({
      repo: {
        loadUtilizationFacts: jest.fn().mockResolvedValue({
          vehicles: [
            { vehicleId: 'v1', eligibility: { startMs: HIST_START, endExclusiveMs: HIST_END }, rented: [{ startMs: HIST_START, endExclusiveMs: HIST_END }], maintenance: [], blocked: [] },
          ],
          telemetryOfflineVehicles: 2, // current snapshot count
          vehicleCount: 1,
        }),
      },
    });
    const util = await service.getUtilization(historicalScope, GEN);
    // Historical period → current telemetry snapshot is NOT a period fact.
    expect(util.telemetryOfflineVehicles).toBeNull();
    expect(util.telemetrySnapshotAsOf).toBeNull();
  });

  it('current telemetry snapshot does not change the utilization calculation', async () => {
    const facts = (offline: number) => ({
      vehicles: [
        { vehicleId: 'v1', eligibility: { startMs: START, endExclusiveMs: END }, rented: [{ startMs: START, endExclusiveMs: END }], maintenance: [], blocked: [] },
      ],
      telemetryOfflineVehicles: offline,
      vehicleCount: 1,
    });
    const svcA = buildService({ repo: { loadUtilizationFacts: jest.fn().mockResolvedValue(facts(0)) } }).service;
    const svcB = buildService({ repo: { loadUtilizationFacts: jest.fn().mockResolvedValue(facts(5)) } }).service;
    const a = await svcA.getUtilization(orgScope, GEN);
    const b = await svcB.getUtilization(orgScope, GEN);
    expect(a.utilizationPercent.value).toBe(b.utilizationPercent.value);
    expect(a.rentedMs).toBe(b.rentedMs);
    expect(a.netCapacityMs).toBe(b.netCapacityMs);
    // Only the informational current-snapshot count differs.
    expect(a.telemetryOfflineVehicles).toBe(0);
    expect(b.telemetryOfflineVehicles).toBe(5);
  });
});
