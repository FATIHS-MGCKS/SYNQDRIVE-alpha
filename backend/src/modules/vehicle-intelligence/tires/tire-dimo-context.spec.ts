import { buildTireDimoContext, resolveCapabilityGatedTpmsWarning } from './tire-dimo-context.builder';
import { classifySeasonStatus } from './tire-status';
import { TireWearModelService } from './tire-wear-model.service';

const AS_OF = new Date('2026-07-16T12:00:00.000Z');

describe('buildTireDimoContext', () => {
  it('gates TPMS warning off when fleet signal absent', () => {
    const ctx = buildTireDimoContext({
      asOf: AS_OF,
      latestState: {
        odometerKm: 120000,
        providerSource: 'DIMO',
        lastSeenAt: AS_OF,
      },
      tpmsWarning: { signalPresent: false, value: null, sourceTimestamp: null },
    });
    expect(ctx.tpms.architecturePrepared).toBe(true);
    expect(ctx.tpms.usable).toBe(false);
    expect(ctx.tpms.warningActive).toBeNull();

    const gated = resolveCapabilityGatedTpmsWarning(ctx.tpms, {
      signalPresent: true,
      value: true,
      sourceTimestamp: AS_OF,
    });
    expect(gated.signalPresent).toBe(false);
  });

  it('uses odometer only for plausibility when capability passes', () => {
    const ctx = buildTireDimoContext({
      asOf: AS_OF,
      availableSignalNames: ['powertrainTransmissionTravelledDistance'],
      latestState: {
        odometerKm: 150000,
        providerSource: 'DIMO',
        sourceTimestamp: AS_OF,
        lastSeenAt: AS_OF,
      },
      coverage: {
        powertrainTransmissionTravelledDistance: {
          sampleCount14d: 40,
          coveragePercent: 28,
        },
      },
      lastKnownOdometerKm: 149000,
    });
    expect(ctx.odometer.plausibilityOnly).toBe(true);
    expect(ctx.odometer.usable).toBe(true);
    expect(ctx.odometer.valueKm).toBe(150000);
  });
});

describe('season evaluation with ambient assist', () => {
  const july = new Date('2026-07-16T12:00:00.000Z');

  it('uses calendar fallback without ambient capability', () => {
    const result = classifySeasonStatus('SUMMER', july);
    expect(result.hintSource).toBe('CALENDAR');
    expect(result.mismatch).toBe(false);
  });

  it('improves hint quality with multi-day cold ambient in summer month', () => {
    const result = classifySeasonStatus('SUMMER', july, {
      weightedAvgTempC: 1,
      sampleCount: 5,
      capabilityUsable: true,
    });
    expect(result.hintSource).toBe('AMBIENT_ASSISTED');
    expect(result.expectedSeason).toBe('WINTER');
    expect(result.mismatch).toBe(true);
    expect(result.advisoryNoteEn).toMatch(/Advisory only/);
    expect(result.advisoryNoteEn).not.toMatch(/legally required/i);
  });

  it('does not let a single ambient reading decide tire change alone', () => {
    const result = classifySeasonStatus('SUMMER', july, {
      weightedAvgTempC: -10,
      sampleCount: 1,
      capabilityUsable: true,
    });
    expect(result.hintSource).toBe('CALENDAR_FALLBACK');
    expect(result.ambientAssisted).toBe(false);
  });
});

describe('heat stress driving load', () => {
  const svc = new TireWearModelService({} as never, {} as never);

  it('does not double-apply driving factor when driving impact is available', () => {
    const withDriving = svc.computeHeatStressFactor(1.05, 140, 1.1, 1.2, null, {
      drivingImpactAvailable: true,
    });
    const withoutDriving = svc.computeHeatStressFactor(1.05, 140, 1.1, 1.2, null, {
      drivingImpactAvailable: false,
    });
    expect(withDriving).toBeLessThan(withoutDriving);
  });
});
