import { BatteryV2IdempotentExecutionService } from './battery-v2-idempotent-execution.service';
import { BatteryV2VehicleLockService } from './battery-v2-vehicle-lock.service';
import type { BatteryV2JobPayload } from './battery-v2-job.types';
import { buildBatteryV2AttemptContext } from './battery-v2-job.validation';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';

function basePayload(
  overrides: Partial<BatteryV2JobPayload> = {},
): BatteryV2JobPayload {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: 'hv-snap:test-key',
    sourceEntityId: null,
    requestedAt: '2026-07-16T12:00:00.000Z',
    modelVersion: '1.0.0',
    correlationId: 'corr-1',
    attemptContext: buildBatteryV2AttemptContext({ maxAttempts: 3 }),
    ...overrides,
  };
}

describe('BatteryV2IdempotentExecutionService', () => {
  const prisma = {
    hvBatteryHealthSnapshot: { findUnique: jest.fn() },
    batteryMeasurement: { findUnique: jest.fn(), findFirst: jest.fn() },
    batteryMeasurementSession: { findFirst: jest.fn() },
    batteryFeatures: { findUnique: jest.fn() },
    batteryAssessment: { findUnique: jest.fn() },
    batteryPublication: { findUnique: jest.fn() },
    hvChargeSession: { findUnique: jest.fn() },
    hvCapacityObservation: { findUnique: jest.fn() },
  };

  const lockHandle = { key: 'lock', token: 'tok', acquiredAt: new Date() };
  const vehicleLock = {
    scopeForJobType: jest.fn().mockReturnValue('ingest'),
    acquire: jest.fn().mockResolvedValue(lockHandle),
    release: jest.fn().mockResolvedValue(undefined),
  };

  let service: BatteryV2IdempotentExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatteryV2IdempotentExecutionService(
      prisma as any,
      vehicleLock as unknown as BatteryV2VehicleLockService,
    );
    prisma.hvBatteryHealthSnapshot.findUnique.mockResolvedValue(null);
    prisma.batteryMeasurement.findUnique.mockResolvedValue(null);
    prisma.batteryMeasurement.findFirst.mockResolvedValue(null);
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue(null);
    prisma.batteryFeatures.findUnique.mockResolvedValue(null);
    prisma.batteryAssessment.findUnique.mockResolvedValue(null);
    prisma.batteryPublication.findUnique.mockResolvedValue(null);
    prisma.hvChargeSession.findUnique.mockResolvedValue(null);
    prisma.hvCapacityObservation.findUnique.mockResolvedValue(null);
  });

  it('executes handler under vehicle lock when not yet completed', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    const result = await service.execute({
      jobType: 'BATTERY_OBSERVATION_CLASSIFY',
      payload: basePayload({ idempotencyKey: 'hv-snap:abc' }),
      handler,
    });

    expect(result).toEqual({ skipped: false });
    expect(vehicleLock.acquire).toHaveBeenCalledWith(VEH, 'ingest');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(vehicleLock.release).toHaveBeenCalledWith(lockHandle);
  });

  it('skips handler when HV snapshot idempotency row already exists', async () => {
    prisma.hvBatteryHealthSnapshot.findUnique.mockResolvedValue({ id: 'snap-1' });
    const handler = jest.fn();

    const result = await service.execute({
      jobType: 'BATTERY_OBSERVATION_CLASSIFY',
      payload: basePayload({ idempotencyKey: 'hv-snap:existing' }),
      handler,
    });

    expect(result).toEqual({ skipped: true, skipReason: 'already_completed' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips handler when LV measurement idempotency row already exists', async () => {
    prisma.batteryMeasurement.findUnique.mockResolvedValue({ id: 'meas-1' });
    const handler = jest.fn();

    const result = await service.execute({
      jobType: 'BATTERY_OBSERVATION_CLASSIFY',
      payload: basePayload({ idempotencyKey: 'battery-obs:lv-key' }),
      handler,
    });

    expect(result).toEqual({ skipped: true, skipReason: 'already_completed' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips start proxy when ICE_START_PROXY session already exists', async () => {
    prisma.batteryMeasurementSession.findFirst.mockResolvedValue({ id: 'session-1' });
    const handler = jest.fn();

    const result = await service.execute({
      jobType: 'BATTERY_START_PROXY_EXTRACT',
      payload: {
        ...basePayload({
          idempotencyKey: `battery-start-proxy:${TRIP}:1.0.0`,
        }),
        tripId: TRIP,
        tripStartedAt: '2026-07-16T12:05:00.000Z',
      },
      handler,
    });

    expect(result.skipped).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('serializes parallel executions for the same vehicle via lock', async () => {
    let active = 0;
    let maxActive = 0;
    let locked = false;
    const waitQueue: Array<() => void> = [];

    vehicleLock.acquire.mockImplementation(async () => {
      if (locked) {
        await new Promise<void>((resolve) => waitQueue.push(resolve));
      }
      locked = true;
      return lockHandle;
    });
    vehicleLock.release.mockImplementation(async () => {
      locked = false;
      waitQueue.shift()?.();
    });

    const handler = jest.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
    });

    await Promise.all([
      service.execute({
        jobType: 'BATTERY_OBSERVATION_CLASSIFY',
        payload: basePayload({ idempotencyKey: 'hv-snap:parallel-1' }),
        handler,
      }),
      service.execute({
        jobType: 'BATTERY_OBSERVATION_CLASSIFY',
        payload: basePayload({ idempotencyKey: 'hv-snap:parallel-2' }),
        handler,
      }),
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    expect(vehicleLock.release).toHaveBeenCalledTimes(2);
  });

  it('allows idempotent retry after worker crash when row exists', async () => {
    prisma.hvBatteryHealthSnapshot.findUnique.mockResolvedValue({ id: 'snap-done' });
    const handler = jest.fn();

    const attempts = await Promise.all([
      service.execute({
        jobType: 'BATTERY_OBSERVATION_CLASSIFY',
        payload: basePayload({ idempotencyKey: 'hv-snap:retry' }),
        handler,
      }),
      service.execute({
        jobType: 'BATTERY_OBSERVATION_CLASSIFY',
        payload: basePayload({ idempotencyKey: 'hv-snap:retry' }),
        handler,
      }),
    ]);

    expect(attempts.every((r) => r.skipped)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid idempotency key prefix for job type', async () => {
    await expect(
      service.execute({
        jobType: 'BATTERY_REST_TARGET_EVALUATE',
        payload: basePayload({ idempotencyKey: 'hv-snap:wrong' }),
        handler: jest.fn(),
      }),
    ).rejects.toThrow(/idempotencyKey must start with rest-target:|battery-rest:/);
  });
});
