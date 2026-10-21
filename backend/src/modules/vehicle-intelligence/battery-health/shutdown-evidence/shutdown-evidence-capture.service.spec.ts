import { BatteryDriveProfile } from '@prisma/client';
import { ShutdownEvidenceCaptureService } from './shutdown-evidence-capture.service';
import { ShutdownEvidenceRepository } from './shutdown-evidence.repository';

describe('ShutdownEvidenceCaptureService', () => {
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
      findLatestCompletedIceTripInCaptureWindow: jest.fn(),
      createObservationIdempotent: jest.fn(),
    } as unknown as ShutdownEvidenceRepository;
    const batteryPolicy = {
      resolveForVehicle: jest.fn(),
    } as any;
    const prisma = { vehicle: { findUnique: jest.fn() } } as any;

    const service = new ShutdownEvidenceCaptureService(
      prisma,
      repository,
      batteryPolicy,
    );

    const outcome = await service.captureFromObservationClassify({
      organizationId: 'org',
      vehicleId: 'veh',
      idempotencyKey: 'k',
      snapshotContext: {
        providerFetchedAt: new Date().toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: new Date().toISOString(),
      },
    } as any);

    expect(outcome).toBe('skipped_flag_off');
    expect(repository.createObservationIdempotent).not.toHaveBeenCalled();
  });

  it('creates observation when flag enabled and trip window matches', async () => {
    process.env.BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED = 'true';
    const tripEnd = new Date('2026-09-06T20:00:44.000Z');
    const repository = {
      findLatestCompletedIceTripInCaptureWindow: jest.fn().mockResolvedValue({
        id: 'trip-1',
        startTime: new Date('2026-09-06T19:30:00.000Z'),
        endTime: tripEnd,
      }),
      createObservationIdempotent: jest.fn().mockResolvedValue('created'),
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

    const service = new ShutdownEvidenceCaptureService(
      prisma,
      repository,
      batteryPolicy,
    );

    const outcome = await service.captureFromObservationClassify({
      organizationId: 'org',
      vehicleId: 'veh',
      idempotencyKey: 'battery-obs:test',
      snapshotContext: {
        providerFetchedAt: tripEnd.toISOString(),
        lvBatteryVoltage: 12.2,
        lvBatteryObservedAt: tripEnd.toISOString(),
      },
    } as any);

    expect(outcome).toBe('created');
    expect(repository.createObservationIdempotent).toHaveBeenCalledTimes(1);
  });
});
