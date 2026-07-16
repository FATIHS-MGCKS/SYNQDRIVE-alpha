import { BatteryDriveProfile } from '../battery-v2-domain';
import { BatteryStartProxyExtractService } from './battery-start-proxy-extract.service';
import { BatteryV2ProviderError } from '../jobs/battery-v2-job.errors';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const TRIP_START = new Date('2026-07-16T12:00:00.000Z');

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

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('persists START_DIP_PROXY for ICE with provider points', async () => {
    policyProfiles.resolveForVehicle.mockResolvedValue({
      startProxyAllowed: true,
      startProxyRequiresConfirmedIceStart: false,
      driveProfile: BatteryDriveProfile.ICE,
    });

    dimoSegments.fetchCrankWindow.mockResolvedValue([
      {
        timestamp: new Date(TRIP_START.getTime() - 5_000).toISOString(),
        voltage: 12.5,
        rpm: 0,
      },
      {
        timestamp: new Date(TRIP_START.getTime() + 5_000).toISOString(),
        voltage: 11.9,
        rpm: 500,
      },
    ]);

    const result = await service.extractAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: TRIP_START,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.skipped) {
      throw new Error('expected persisted measurement');
    }
    expect(result.measurementId).toBe('meas-1');
    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_DIP_PROXY',
        context: expect.objectContaining({ diagnosticOnly: true }),
        provenance: expect.objectContaining({ scoreEffect: false }),
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
