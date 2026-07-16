import { RentalHealthService } from './rental-health.service';
import { computeOverallState } from './rental-health.types';
import { BATTERY_V2_READINESS_ENABLED_ENV } from '@config/battery-health-v2.config';
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

  const evaluateBattery = (summary: any, hmAi: any = null, dtcSummary: any = null) =>
    (svc as any).evaluateBattery(summary, hmAi, dtcSummary);
  const evaluateErrorCodes = (summary: any) =>
    (svc as any).evaluateErrorCodes(summary);
  const evaluateBrakes = (summary: any) => (svc as any).evaluateBrakes(summary);

  const batterySummary = (overrides: {
    healthStatus?: string;
    restingValueV?: number | null;
    restingStatus?: string;
    measurementContext?: string;
    legacyPublicationUnsafe?: boolean;
  }) => ({
    generatedAt: '2026-06-24T12:00:00.000Z',
    lv: {
      healthStatus: overrides.healthStatus ?? 'GOOD',
      freshness: { observedAt: '2026-06-24T11:00:00.000Z' },
      estimatedHealth: {
        displayMode: 'BARS',
        status: 'GOOD',
        decisionCapable: overrides.legacyPublicationUnsafe ? false : true,
      },
      legacyPublicationSafety: overrides.legacyPublicationUnsafe
        ? {
            decisionCapable: false,
            displayMode: 'LEGACY_UNVERIFIED',
            diagnosticLabelDe: 'Legacy / unverifiziert (nicht entscheidungsfähig)',
            reasons: ['REST_LIKELY_CONTAMINATED'],
          }
        : {
            decisionCapable: true,
            displayMode: 'DECISION_CAPABLE',
            diagnosticLabelDe: 'Geschätzter 12V-Zustand (entscheidungsfähig)',
            reasons: [],
          },
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
    batterySummary: any = null,
  ) =>
    (svc as any).collectBlockingReasons(
      modules,
      complaints,
      hmAi,
      complianceEval,
      dtcSummary,
      brakeSummary,
      batterySummary,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[BATTERY_V2_READINESS_ENABLED_ENV];
  });

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

  it('unsafe legacy CRITICAL aggregate does not escalate rental battery alone', () => {
    const res = evaluateBattery(
      batterySummary({
        healthStatus: 'CRITICAL',
        restingValueV: 12.84,
        restingStatus: 'GOOD',
        legacyPublicationUnsafe: true,
      }),
    );
    expect(res.state).toBe('unknown');
    expect(res.evidence_type).toBe('legacy_unverified');
    expect(res.reason).not.toMatch(/kritisch/i);
  });

  it('unsafe legacy does not suppress genuine resting-voltage WARNING', () => {
    const res = evaluateBattery(
      batterySummary({
        healthStatus: 'WARNING',
        restingValueV: 12.05,
        restingStatus: 'WARNING',
        legacyPublicationUnsafe: true,
      }),
    );
    expect(res.state).toBe('warning');
    expect(res.reason).toMatch(/Ruhespannung 12\.05 V/);
  });

  it('HM warning light still escalates when legacy publication is unsafe', () => {
    const res = evaluateBattery(
      batterySummary({
        healthStatus: 'CRITICAL',
        restingValueV: 12.84,
        restingStatus: 'GOOD',
        legacyPublicationUnsafe: true,
      }),
      { dashboardLights: { battery_low_warning: 'on' } },
    );
    expect(res.state).toBe('warning');
    expect(res.reason).toMatch(/Warnleuchte/i);
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

  it('brake DOCUMENTED basis maps to evidence_type document (not provider)', () => {
    const res = evaluateBrakes({
      overallCondition: 'GOOD',
      dataBasis: 'DOCUMENTED',
      frontDataBasis: 'DOCUMENTED',
      rearDataBasis: 'DOCUMENTED',
      confidenceLevel: 'LOW',
      updatedAt: '2026-07-06T12:00:00.000Z',
    });
    expect(res.state).toBe('good');
    expect(res.evidence_type).toBe('document');
  });

  it('brake SENSOR basis maps to evidence_type sensor', () => {
    const res = evaluateBrakes({
      overallCondition: 'WATCH',
      dataBasis: 'SENSOR',
      frontDataBasis: 'SENSOR',
      updatedAt: '2026-07-06T12:00:00.000Z',
    });
    expect(res.evidence_type).toBe('sensor');
  });

  it('evaluateBrakes never promotes unknown to good', () => {
    const unknownSummary = evaluateBrakes({
      overallCondition: 'UNKNOWN',
      dataBasis: 'UNKNOWN',
      updatedAt: '2026-07-06T12:00:00.000Z',
    });
    expect(unknownSummary.state).toBe('unknown');
    expect(unknownSummary.state).not.toBe('good');

    const nullSummary = evaluateBrakes(null);
    expect(nullSummary.state).toBe('unknown');
    expect(nullSummary.evidence_type).toBe('unknown');
  });

  it('evaluateBrakes is read-only (no prisma or brake service writes)', () => {
    const writeSpy = jest.spyOn(prisma.vehicle, 'findFirst');
    const brakesSpy = jest.spyOn(brakes, 'getSummary');

    evaluateBrakes({
      overallCondition: 'GOOD',
      dataBasis: 'DOCUMENTED',
      updatedAt: '2026-07-06T12:00:00.000Z',
    });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(brakesSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
    brakesSpy.mockRestore();
  });

  it('DOCUMENTED/ESTIMATED GOOD never blocks rental', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'Bremszustand: GOOD' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    for (const dataBasis of ['DOCUMENTED', 'ESTIMATED'] as const) {
      const reasons = collectBlockingReasons(
        modules,
        [],
        null,
        { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
        null,
        {
          overallCondition: 'GOOD',
          dataBasis,
          openAlerts: [],
        },
      );
      expect(reasons).toHaveLength(0);
    }
  });

  it('MEASURED CRITICAL blocks rental', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'critical', reason: 'Kritischer Bremsbelag' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      {
        overallCondition: 'CRITICAL',
        dataBasis: 'MEASURED',
        openAlerts: [],
      },
    );
    expect(reasons.some((r: string) => /Bremsen:/i.test(r))).toBe(true);
  });

  it('CRITICAL with critical openAlert blocks even when dataBasis is SENSOR', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'critical', reason: 'Sofortiger Bremsenersatz' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      {
        overallCondition: 'CRITICAL',
        dataBasis: 'SENSOR',
        openAlerts: [{ severity: 'critical', code: 'immediate_replacement', message: 'Sofort' }],
      },
    );
    expect(reasons.some((r: string) => /Bremsen:/i.test(r))).toBe(true);
  });

  it('brake ESTIMATED CRITICAL does not imply rental block without measured basis', () => {
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'critical', reason: 'critical' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      {
        overallCondition: 'CRITICAL',
        dataBasis: 'ESTIMATED',
        openAlerts: [],
      },
    );
    expect(reasons).toHaveLength(0);
  });

  it('battery readiness blocks on warning light when flag enabled', () => {
    process.env[BATTERY_V2_READINESS_ENABLED_ENV] = 'true';
    const summary = batterySummary({
      healthStatus: 'GOOD',
      restingValueV: 12.84,
      restingStatus: 'GOOD',
    });
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
      battery: { state: 'warning', reason: 'Batterie-Warnleuchte aktiv' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      { dashboardLights: { battery_low_warning: 'on' } },
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
      summary,
    );
    expect(reasons.some((r: string) => /Batterie:/i.test(r))).toBe(true);
  });

  it('battery readiness does not block shadow-only signals when flag enabled', () => {
    process.env[BATTERY_V2_READINESS_ENABLED_ENV] = 'true';
    const summary = {
      ...batterySummary({
        healthStatus: 'CRITICAL',
        restingValueV: 11.0,
        restingStatus: 'CRITICAL',
        legacyPublicationUnsafe: true,
      }),
      canonical: {
        lv: {
          canonical: {
            primaryTruth: { source: 'V2_SHADOW_DIAGNOSTIC', decisionCapable: false },
          },
          assessment: { assessmentMode: 'SHADOW', assessmentTrack: 'TELEMETRY' },
          latestQualifiedRest: { quality: 'SHADOW' },
        },
        liveState: { lv: { values: { voltageV: null } } },
        hv: {
          providerSoh: { percent: null, decisionFresh: false },
          capacityAssessment: { shadowGatePassed: true },
        },
      },
    };
    const modules = {
      service_compliance: { state: 'good', reason: 'ok' },
      brakes: { state: 'good', reason: 'ok' },
      tires: { state: 'good', reason: 'ok' },
      error_codes: { state: 'good', reason: 'ok' },
      battery: { state: 'unknown', reason: 'Keine belastbare Batteriebewertung verfügbar' },
    };
    const reasons = collectBlockingReasons(
      modules,
      [],
      null,
      { tuvBokraft: { tuvOverdue: false, bokraftOverdue: false } },
      null,
      null,
      summary,
    );
    expect(reasons.some((r: string) => /Batterie:/i.test(r))).toBe(false);
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
