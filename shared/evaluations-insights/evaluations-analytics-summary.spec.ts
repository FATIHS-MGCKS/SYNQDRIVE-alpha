import {
  buildExecutiveKpis,
  buildFinancialSummary,
  buildFleetUtilizationSummary,
  computeOverallStatus,
  deltaPercent,
  deriveStrengthsAndWeaknesses,
  resolveAnalyticsPeriodWindows,
  sectionStatusFromResult,
  wrapSection,
} from './evaluations-analytics-summary';
import type {
  EvaluationsBookingSnapshot,
  EvaluationsFinancialSnapshot,
  EvaluationsFleetSnapshot,
} from './evaluations-analytics-summary.contract';

const financial: EvaluationsFinancialSnapshot = {
  revenueMtdMinor: 500_000,
  revenuePreviousMinor: 400_000,
  expensesMtdMinor: 120_000,
  expensesPreviousMinor: 100_000,
  paidRevenueMtdMinor: 450_000,
  openReceivablesMinor: 80_000,
  overdueReceivablesMinor: 20_000,
  openReceivablesCount: 5,
  overdueReceivablesCount: 2,
  currency: 'EUR',
};

const bookings: EvaluationsBookingSnapshot = {
  active: 12,
  pending: 4,
  completed: 200,
  revenueTodayMinor: 15_000,
  revenueMtdMinor: 480_000,
  revenuePreviousMinor: 390_000,
  currency: 'EUR',
};

const fleet: EvaluationsFleetSnapshot = {
  total: 50,
  available: 20,
  rented: 25,
  reserved: 3,
  maintenance: 1,
  blocked: 1,
  other: 0,
  cleaningRequired: 2,
  underutilized: 5,
};

describe('evaluations-analytics-summary (shared)', () => {
  it('resolveAnalyticsPeriodWindows returns current and previous MTD windows', () => {
    const ref = new Date('2026-06-16T12:00:00.000Z');
    const { current, previous } = resolveAnalyticsPeriodWindows('mtd', 'Europe/Berlin', ref);
    expect(current.key).toBe('mtd');
    expect(new Date(current.from).getUTCMonth()).toBe(5);
    expect(new Date(previous.to).getTime()).toBeLessThan(new Date(current.from).getTime());
  });

  it('deltaPercent handles zero previous as null for non-zero current', () => {
    expect(deltaPercent(100, 0)).toBeNull();
    expect(deltaPercent(0, 0)).toBe(0);
    expect(deltaPercent(110, 100)).toBe(10);
  });

  it('buildFinancialSummary computes net margin and deltas', () => {
    const summary = buildFinancialSummary(financial);
    expect(summary.netMarginMinor).toBe(380_000);
    expect(summary.revenueDeltaPercent).toBe(25);
  });

  it('buildFleetUtilizationSummary counts utilization from operational fleet', () => {
    const util = buildFleetUtilizationSummary(fleet);
    expect(util.totalOperational).toBe(48);
    expect(util.utilizationPercent).toBeCloseTo(52.1, 0);
    expect(util.underutilizedVehicles).toBe(5);
  });

  it('deriveStrengthsAndWeaknesses flags overdue receivables and critical insights', () => {
    const util = buildFleetUtilizationSummary(fleet);
    const { strengths, weaknesses } = deriveStrengthsAndWeaknesses({
      financial,
      fleet,
      risks: {
        businessRiskGroups: 2,
        revenueLeakageGroups: 1,
        criticalInsights: 3,
        criticalBookings: 1,
        estimatedExposureMinor: 50_000,
        exposureCurrency: 'EUR',
        orgWideRisks: 1,
        bookingScopedRisks: 2,
      },
      fleetUtilization: util,
    });
    expect(weaknesses.some((w) => w.code === 'OVERDUE_RECEIVABLES')).toBe(true);
    expect(weaknesses.some((w) => w.code === 'CRITICAL_INSIGHTS')).toBe(true);
    expect(strengths.some((s) => s.code === 'REVENUE_GROWTH')).toBe(true);
  });

  it('sectionStatusFromResult maps failures to ERROR or UNAVAILABLE', () => {
    expect(sectionStatusFromResult({ ok: true, data: {} })).toBe('OK');
    expect(sectionStatusFromResult({ ok: false, error: 'db down' })).toBe('ERROR');
    expect(sectionStatusFromResult({ ok: false, error: 'not found', unavailable: true })).toBe(
      'UNAVAILABLE',
    );
  });

  it('computeOverallStatus returns PARTIAL when mixed OK and ERROR', () => {
    expect(
      computeOverallStatus([
        { key: 'a', status: 'OK' },
        { key: 'b', status: 'ERROR' },
      ]),
    ).toBe('PARTIAL');
  });

  it('wrapSection preserves envelope shape', () => {
    const env = wrapSection({ x: 1 }, 'OK', '2026-06-01T00:00:00.000Z');
    expect(env.status).toBe('OK');
    expect(env.data).toEqual({ x: 1 });
    expect(env.error).toBeNull();
  });

  it('buildExecutiveKpis aggregates cross-domain metrics without PII fields', () => {
    const executive = buildExecutiveKpis(financial, bookings, fleet, {
      businessRiskGroups: 1,
      revenueLeakageGroups: 0,
      criticalInsights: 2,
      criticalBookings: 1,
      estimatedExposureMinor: 10_000,
      exposureCurrency: 'EUR',
      orgWideRisks: 0,
      bookingScopedRisks: 1,
    });
    expect(executive.revenueMtdMinor).toBe(500_000);
    expect(executive.activeBookings).toBe(12);
    expect(executive.criticalRisks).toBe(2);
    expect(Object.keys(executive)).not.toContain('customerName');
  });
});
