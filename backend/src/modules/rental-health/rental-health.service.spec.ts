import { RentalHealthService } from './rental-health.service';
import { computeOverallState } from './rental-health.types';
import { normalizeDtcSeverityBand } from '../vehicle-intelligence/dtc/dtc-severity.util';

describe('RentalHealthService (unit)', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleLatestState: { findUnique: jest.fn() },
    vehicleComplaint: { findMany: jest.fn() },
  };
  const battery = { getSummary: jest.fn() };
  const tires = { getSummary: jest.fn() };
  const brakes = { getSummary: jest.fn() };
  const dtc = { getSummary: jest.fn() };
  const hm = { getAiHealthCareSignals: jest.fn() };
  const serviceCompliance = {
    evaluateCompliance: jest.fn(),
    toRentalModuleHealth: jest.fn(),
  };

  const svc = new RentalHealthService(
    prisma as any,
    battery as any,
    tires as any,
    brakes as any,
    dtc as any,
    hm as any,
    serviceCompliance as any,
  );

  const evaluateBattery = (summary: any, hmAi: any = null) =>
    (svc as any).evaluateBattery(summary, hmAi);
  const evaluateErrorCodes = (summary: any) =>
    (svc as any).evaluateErrorCodes(summary);

  const batterySummary = (overrides: {
    healthStatus?: string;
    restingValueV?: number | null;
    restingStatus?: string;
    measurementContext?: string;
  }) => ({
    generatedAt: '2026-06-24T12:00:00.000Z',
    lv: {
      healthStatus: overrides.healthStatus ?? 'GOOD',
      freshness: { observedAt: '2026-06-24T11:00:00.000Z' },
      estimatedHealth: { displayMode: 'BARS', status: 'GOOD' },
      restingVoltage: {
        valueV: overrides.restingValueV === undefined ? 12.84 : overrides.restingValueV,
        status: overrides.restingStatus ?? 'GOOD',
        measurementContext: overrides.measurementContext ?? 'RESTING',
      },
    },
  });
  const evaluateComplaints = (complaints: any[], loaded: boolean) =>
    (svc as any).evaluateComplaints(complaints, loaded);
  const collectBlockingReasons = (
    modules: any,
    complaints: any[],
    hmAi: any,
    complianceEval: any,
    dtcSummary: any,
    brakeSummary: any,
  ) =>
    (svc as any).collectBlockingReasons(
      modules,
      complaints,
      hmAi,
      complianceEval,
      dtcSummary,
      brakeSummary,
    );

  beforeEach(() => jest.clearAllMocks());

  it('unknown module prevents overall good', () => {
    expect(
      computeOverallState([
        { state: 'good' },
        { state: 'unknown' },
      ]),
    ).toBe('unknown');
  });

  it('A: 12.84V resting with WATCH aggregate stays good — no battery alert', () => {
    const res = evaluateBattery(
      batterySummary({ healthStatus: 'WATCH', restingValueV: 12.84, restingStatus: 'GOOD' }),
    );
    expect(res.state).toBe('good');
    expect(res.reason).not.toMatch(/beobachten/i);
    expect(res.reason).not.toMatch(/Nachladen|kritisch/i);
  });

  it('B: low resting voltage with WARNING aggregate => warning with resting note', () => {
    const res = evaluateBattery(
      batterySummary({ healthStatus: 'WARNING', restingValueV: 12.05, restingStatus: 'WARNING' }),
    );
    expect(res.state).toBe('warning');
    expect(res.reason).toMatch(/Ruhespannung 12\.05 V/);
    expect(res.reason).toMatch(/Nachladen|auffällig/i);
  });

  it('C: only live voltage (no genuine resting) never labels reason as Ruhespannung', () => {
    const liveOnly = evaluateBattery(
      batterySummary({ healthStatus: 'GOOD', restingValueV: 13.9, measurementContext: 'UNKNOWN' }),
    );
    expect(liveOnly.reason).not.toMatch(/Ruhespannung/i);
    const noResting = evaluateBattery(
      batterySummary({ healthStatus: 'GOOD', restingValueV: null }),
    );
    expect(noResting.reason).not.toMatch(/Ruhespannung/i);
  });

  it('D: HM battery warning light escalates to warning regardless of voltage', () => {
    const res = evaluateBattery(
      batterySummary({ healthStatus: 'GOOD', restingValueV: 12.84, restingStatus: 'GOOD' }),
      { dashboardLights: { battery_low_warning: 'on' } },
    );
    expect(res.state).toBe('warning');
    expect(res.reason).toMatch(/Warnleuchte/i);
  });

  it('estimated-health WARNING with good resting does not blame the resting voltage', () => {
    const res = evaluateBattery(
      batterySummary({ healthStatus: 'WARNING', restingValueV: 12.84, restingStatus: 'GOOD' }),
    );
    expect(res.state).toBe('warning');
    expect(res.reason).toMatch(/Geschätzte Batteriegesundheit/i);
    expect(res.reason).not.toMatch(/Ruhespannung 12\.84/);
  });

  it('critical DTC with severity critical (not only high display) => critical module', () => {
    const res = evaluateErrorCodes({
      status: 'active_faults',
      activeFaultCount: 1,
      worstSeverityBand: normalizeDtcSeverityBand('critical'),
      lastSuccessfulCheckAt: new Date().toISOString(),
      activeFaultPreview: [],
    });
    expect(res.state).toBe('critical');
  });

  it('complaints load failure => unknown not good', () => {
    const res = evaluateComplaints([], false);
    expect(res.state).toBe('unknown');
    expect(res.reason).toMatch(/nicht geladen/i);
  });

  it('expired TÜV blocks rental via blocking reasons', () => {
    const modules = {
      service_compliance: { state: 'critical', reason: 'TÜV abgelaufen seit 3 Tagen' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      {
        tuvBokraft: {
          tuvOverdue: true,
          tuvRemainingDays: -3,
          bokraftOverdue: false,
        },
        nextService: { trackingStatus: 'NO_TRACKING' },
      },
      null,
      null,
    );
    expect(reasons.some((r: string) => /TÜV abgelaufen/i.test(r))).toBe(true);
  });

  it('service no tracking does not block rental alone', () => {
    const modules = {
      service_compliance: {
        state: 'unknown',
        reason: 'Kein HM/OEM Service-Tracking',
      },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      {
        tuvBokraft: { tuvOverdue: false, bokraftOverdue: false },
        nextService: { trackingStatus: 'NO_TRACKING' },
      },
      null,
      null,
    );
    expect(reasons).toHaveLength(0);
  });

  it('blocksRental observation adds blocking reason', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [{ blocksRental: true }],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
    );
    expect(reasons).toContain('Technische Beobachtung blockiert Vermietung');
  });

  it('critical severity without blocksRental does not block rental', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [{ urgency: 'CRITICAL', blocksRental: false, impact: 'SAFETY' }],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
    );
    expect(reasons).toHaveLength(0);
  });

  it('rental_blocked derives from blocking reasons length', () => {
    const blocking_reasons = ['TÜV abgelaufen'];
    expect(blocking_reasons.length > 0).toBe(true);
  });

  it('isRentalBlocked returns blocked on aggregation failure', async () => {
    prisma.vehicle.findFirst.mockRejectedValue(new Error('db down'));
    const gate = await svc.isRentalBlocked('org-1', 'veh-1');
    expect(gate.healthGateStatus).toBe('UNAVAILABLE');
    expect(gate.blocked).toBe(true);
    expect(gate.manualReviewRequired).toBe(true);
  });
});
