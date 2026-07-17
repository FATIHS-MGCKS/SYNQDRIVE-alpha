import { BatteryMeasurementQuality } from '@prisma/client';
import { BatteryDriveProfile } from '../battery-v2-domain';
import { BatteryStartProxyExtractService } from './battery-start-proxy-extract.service';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';
import { START_PROXY_CADENCE_GATE_VERSION } from './battery-start-proxy-cadence-gate';
import { START_PROXY_MEASUREMENT_PLAN_VERSION } from './battery-start-proxy-measurements';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const TRIP_START = new Date(Date.now() - 3 * 60_000);

function seriesEvery5s(count: number, voltage = 12.4) {
  const startMs = TRIP_START.getTime() - 25_000;
  return Array.from({ length: count }, (_, index) => {
    const ms = startMs + index * 5_000;
    return {
      timestamp: new Date(ms).toISOString(),
      voltage,
      rpm: ms >= TRIP_START.getTime() ? 600 : 0,
    };
  });
}

describe('BatteryStartProxyExtractService', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };
  const dimoSegments = {
    fetchCrankWindow: jest.fn(),
  };
  const policyProfiles = {
    resolveForVehicle: jest.fn(),
  };
  const sessions = {
    create: jest.fn().mockResolvedValue({ id: 'session-1' }),
  };
  const measurements = {
    create: jest.fn().mockResolvedValue({ id: 'meas-1' }),
  };

  let service: BatteryStartProxyExtractService;
  let measurementCounter: number;

  beforeEach(() => {
    jest.clearAllMocks();
    measurementCounter = 0;
    measurements.create.mockImplementation(async () => ({
      id: `meas-${++measurementCounter}`,
    }));
    service = new BatteryStartProxyExtractService(
      prisma as any,
      dimoSegments as any,
      policyProfiles as any,
      sessions as any,
      measurements as any,
    );
    prisma.vehicle.findFirst.mockResolvedValue({
      dimoVehicle: { tokenId: 42 },
    });
  });

  it('skips BEV profiles where start proxy is not allowed', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: false,
      driveProfile: BatteryDriveProfile.BEV,
    });

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      skipReason: 'unsupported_profile',
    });
    expect(dimoSegments.fetchCrankWindow).not.toHaveBeenCalled();
  });

  it('skips PHEV trips without confirmed ICE start', async () => {
    policyProfiles.resolveForVehicle
      .mockResolvedValueOnce({
        startProxyAllowed: true,
        startProxyRequiresConfirmedIceStart: true,
        driveProfile: BatteryDriveProfile.PHEV,
      })
      .mockResolvedValueOnce({
        startProxyAllowed: true,
        startProxyRequiresConfirmedIceStart: true,
        driveProfile: BatteryDriveProfile.PHEV,
      });

    dimoSegments.fetchCrankWindow.mockResolvedValue([
      {
        timestamp: new Date(TRIP_START.getTime() + 10_000).toISOString(),
        voltage: 12.4,
        rpm: 0,
      },
    ]);

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      skipReason: 'phev_ice_start_not_confirmed',
    });
    expect(measurements.create).not.toHaveBeenCalled();
  });

  it('persists multiple proxy measurements after cadence gate passes', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
      driveProfile: BatteryDriveProfile.ICE,
    });

    const points = seriesEvery5s(35, 12.4);
    points[5].voltage = 12.5;
    points[7].voltage = 11.7;
    dimoSegments.fetchCrankWindow.mockResolvedValue(points);

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) {
      throw new Error('expected persisted measurements');
    }
    expect(result.measurementIds.length).toBeGreaterThanOrEqual(4);
    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_DIP_PROXY',
        quality: BatteryMeasurementQuality.VALID_PROXY,
        numericValue: expect.any(Number),
        context: expect.objectContaining({
          notCrankMinimum: true,
          cadenceGateVersion: START_PROXY_CADENCE_GATE_VERSION,
          measurementPlanVersion: START_PROXY_MEASUREMENT_PLAN_VERSION,
        }),
        provenance: expect.objectContaining({
          scoreEffect: false,
          publicationEligible: false,
        }),
      }),
    );
    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PRE_START_VOLTAGE',
        idempotencyKey: `pre-start-voltage:${TRIP}`,
      }),
    );
  });

  it('persists status measurements without numeric values for NO_DATA', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
      driveProfile: BatteryDriveProfile.ICE,
    });
    dimoSegments.fetchCrankWindow.mockResolvedValue([]);

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      skipReason: 'no_data',
    });
    expect(measurements.create).toHaveBeenCalledTimes(5);
    for (const call of measurements.create.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          quality: BatteryMeasurementQuality.NO_DATA,
          numericValue: null,
        }),
      );
    }
  });

  it('persists INSUFFICIENT_CADENCE status measurements without numeric values', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
      driveProfile: BatteryDriveProfile.ICE,
    });

    const startMs = TRIP_START.getTime();
    dimoSegments.fetchCrankWindow.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => ({
        timestamp: new Date(startMs - 20_000 + index * 20_000).toISOString(),
        voltage: 12.3,
        rpm: 600,
      })),
    );

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      skipReason: 'insufficient_cadence',
    });
    expect(measurements.create).toHaveBeenCalledTimes(5);
    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: BatteryMeasurementQuality.INSUFFICIENT_CADENCE,
        numericValue: null,
      }),
    );
  });

  it('propagates provider failures as retryable errors', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
      driveProfile: BatteryDriveProfile.ICE,
    });
    dimoSegments.fetchCrankWindow.mockRejectedValue(new Error('DIMO timeout'));

    await expect(
      service.extractAndPersist({
        organizationId: ORG,
        vehicleId: VEH,
        tripId: TRIP,
        tripStartedAt: TRIP_START,
      }),
    ).rejects.toBeInstanceOf(BatteryV2ProviderError);
  });
});
