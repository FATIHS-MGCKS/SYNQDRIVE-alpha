import { BatteryDriveProfile } from '@prisma/client';
import { ShutdownEvidenceTripContextService } from './shutdown-evidence-trip-context.service';
import { ShutdownEvidenceRepository } from './shutdown-evidence.repository';

describe('ShutdownEvidenceTripContextService', () => {
  const originalEnv = process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED;

  afterEach(() => {
    if (originalEnv == null) {
      delete process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED = originalEnv;
    }
  });

  it('writes nothing when shadow flag is disabled', async () => {
    process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED = 'false';
    const repository = {
      createTripContextIdempotent: jest.fn(),
      findFirstLvObservationAfterTripEnd: jest.fn(),
    } as unknown as ShutdownEvidenceRepository;
    const prisma = { vehicle: { findUnique: jest.fn() } } as any;
    const batteryPolicy = { resolveForVehicle: jest.fn() } as any;

    const service = new ShutdownEvidenceTripContextService(
      prisma,
      repository,
      batteryPolicy,
    );

    const outcome = await service.captureAtTripFinalization({
      organizationId: 'org',
      vehicleId: 'veh',
      tripId: 'trip-1',
      tripEndedAt: new Date('2026-09-06T20:00:44.000Z'),
    });

    expect(outcome).toBe('skipped_flag_off');
    expect(repository.createTripContextIdempotent).not.toHaveBeenCalled();
  });

  it('creates trip shutdown context when flag enabled', async () => {
    process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED = 'true';
    const tripEnd = new Date('2026-09-06T20:00:44.000Z');
    const createTripContextIdempotent = jest.fn().mockResolvedValue('created');
    const repository = {
      findFirstLvObservationAfterTripEnd: jest.fn().mockResolvedValue(null),
      createTripContextIdempotent,
    } as unknown as ShutdownEvidenceRepository;
    const batteryPolicy = {
      resolveForVehicle: jest.fn().mockResolvedValue({
        driveProfile: BatteryDriveProfile.ICE,
      }),
    } as any;
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          latestState: {
            lvBatteryVoltage: 12.15,
            speedKmh: 0,
            isIgnitionOn: false,
            engineLoad: 0,
            tractionBatteryIsCharging: false,
            tractionBatteryChargingPowerKw: 0,
            online: true,
            lastSeenAt: tripEnd,
            sourceTimestamp: tripEnd,
            providerFetchedAt: tripEnd,
            syncJobRef: 'poll-1',
          },
          tripDetectionState: { activeTripId: null, lastActivityAt: tripEnd },
        }),
      },
    } as any;

    const service = new ShutdownEvidenceTripContextService(
      prisma,
      repository,
      batteryPolicy,
    );

    const outcome = await service.captureAtTripFinalization({
      organizationId: 'org',
      vehicleId: 'veh',
      tripId: 'trip-1',
      tripEndedAt: tripEnd,
    });

    expect(outcome).toBe('created');
    expect(createTripContextIdempotent).toHaveBeenCalledTimes(1);
    const payload = createTripContextIdempotent.mock.calls[0][0];
    expect(payload.snapshot.atomicClaim).toBe(false);
    expect(payload.idempotencyKey).toBe('shutdown-ctx:veh:trip-1');
  });

  it('suppresses duplicate trip context on replay', async () => {
    process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED = 'true';
    const tripEnd = new Date('2026-09-06T20:00:44.000Z');
    const repository = {
      findFirstLvObservationAfterTripEnd: jest.fn().mockResolvedValue(null),
      createTripContextIdempotent: jest.fn().mockResolvedValue('duplicate'),
    } as unknown as ShutdownEvidenceRepository;
    const batteryPolicy = {
      resolveForVehicle: jest.fn().mockResolvedValue({
        driveProfile: BatteryDriveProfile.ICE,
      }),
    } as any;
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          latestState: {
            lvBatteryVoltage: 12.15,
            speedKmh: 0,
            isIgnitionOn: false,
            engineLoad: 0,
            tractionBatteryIsCharging: false,
            tractionBatteryChargingPowerKw: 0,
            online: true,
            lastSeenAt: tripEnd,
            sourceTimestamp: tripEnd,
            providerFetchedAt: tripEnd,
            syncJobRef: 'poll-1',
          },
          tripDetectionState: { activeTripId: null, lastActivityAt: tripEnd },
        }),
      },
    } as any;

    const service = new ShutdownEvidenceTripContextService(
      prisma,
      repository,
      batteryPolicy,
    );

    const outcome = await service.captureAtTripFinalization({
      organizationId: 'org',
      vehicleId: 'veh',
      tripId: 'trip-1',
      tripEndedAt: tripEnd,
    });

    expect(outcome).toBe('duplicate');
  });
});
