import { BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { BatteryDriveProfile } from '../battery-v2-domain';
import { resolveLvStartProxyDiagnostic } from './lv-start-proxy-diagnostic.resolver';

const VEH = 'clveh1234567890123456789012';
const NOW = new Date('2026-07-16T12:05:00.000Z');

describe('resolveLvStartProxyDiagnostic', () => {
  const policyProfiles = {
    resolveForVehicle: jest.fn(),
  };

  const prisma = {
    batteryMeasurementSession: {
      findFirst: jest.fn(),
    },
    batteryMeasurement: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BATTERY_V2_START_PROXY_ENABLED = 'true';
    policyProfiles.resolveForVehicle.mockResolvedValue({
      driveProfile: BatteryDriveProfile.ICE,
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
    });
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({
      id: 'session-1',
      tripId: 'trip-1',
      startedAt: new Date('2026-07-16T12:00:00.000Z'),
      status: 'COMPLETED',
      metadata: { pointCount: 35 },
    });
    prisma.batteryMeasurement.findMany.mockResolvedValue([
      {
        type: BatteryMeasurementType.START_DIP_PROXY,
        quality: BatteryMeasurementQuality.VALID_PROXY,
        numericValue: 2.4,
        unit: 'V',
        observedAt: new Date('2026-07-16T12:00:00.000Z'),
        context: {
          messart: 'START_DIP_PROXY',
          medianIntervalMs: 5000,
          coverageRatio: 0.82,
          offsetFromTargetMs: 0,
          targetOffsetFromStartMs: 0,
        },
      },
    ]);
  });

  afterEach(() => {
    delete process.env.BATTERY_V2_START_PROXY_ENABLED;
  });

  it('returns diagnostic view without operational effect', async () => {
    const view = await resolveLvStartProxyDiagnostic(
      prisma as any,
      policyProfiles as any,
      VEH,
      NOW,
    );

    expect(view.diagnosticOnly).toBe(true);
    expect(view.scoreWeightPercent).toBe(0);
    expect(view.operationalEffect).toBe(false);
    expect(view.alertEligible).toBe(false);
    expect(view.operationalStatus).toBe('UNKNOWN');
    expect(view.uiLabelDe).toBe('Startverhalten (geschätzt)');
    const dip = view.measurements.find((m) => m.messart === 'START_DIP_PROXY');
    expect(dip?.classification).toBe('PROXY');
    expect(dip?.dataQualityStatus).toBe('PROXY');
    expect(dip?.measurementAgeMs).toBe(5 * 60_000);
  });

  it('returns BEV availability as nicht unterstützt', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      driveProfile: BatteryDriveProfile.BEV,
      startProxyAllowed: false,
      startProxyRequiresConfirmedIceStart: false,
    });

    const view = await resolveLvStartProxyDiagnostic(
      prisma as any,
      policyProfiles as any,
      VEH,
      NOW,
    );

    expect(view.availability).toBe('UNSUPPORTED');
    expect(view.availabilityLabelDe).toBe('Nicht unterstützt');
  });
});
