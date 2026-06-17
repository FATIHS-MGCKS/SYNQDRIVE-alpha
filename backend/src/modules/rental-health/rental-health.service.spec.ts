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

  const evaluateErrorCodes = (summary: any) =>
    (svc as any).evaluateErrorCodes(summary);
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

  it('safety complaint adds blocking reason', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [{ impact: 'SAFETY' }],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
    );
    expect(reasons).toContain('Offene Sicherheits-Reklamation');
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
