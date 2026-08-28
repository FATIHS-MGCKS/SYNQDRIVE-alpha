import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';

import {
  DimoSnapshotProcessor,
  type DimoSnapshotJobData,
} from './dimo-snapshot.processor';

/**
 * PR A0 — trip-start isolation hardening.
 *
 * Invariant under test: a failure in a non-trip snapshot subsystem
 * (device-connection resolution outbox drain) must never prevent
 * evaluateTripStart() from running. Same failure class as the Battery V2
 * incident that stalled fleet-wide live trip detection.
 */
describe('DimoSnapshotProcessor — trip start isolation', () => {
  const vehicleId = 'veh-1';
  const dimoTokenId = 42;

  const buildSignals = () => ({
    lastSeen: new Date().toISOString(),
    isIgnitionOn: { value: 1, timestamp: new Date().toISOString() },
    speed: { value: 37 },
    powertrainTransmissionTravelledDistance: { value: 12345 },
  });

  const buildHarness = (overrides?: {
    outboxError?: unknown;
    tripStartError?: unknown;
  }) => {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          hardwareType: 'AUTOPI',
          dimoVehicle: { connectionStatus: 'CONNECTED' },
          dataSourceLinks: [{ id: 'link-1', sourceSubtype: null }],
        }),
      },
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'vls-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dimoPollLog: {
        create: jest.fn().mockResolvedValue({ id: 'poll-1' }),
      },
    };

    const dimoAuth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const dimoTelemetry = {
      fetchLatestVehicleSnapshot: jest
        .fn()
        .mockResolvedValue({ signalsLatest: buildSignals() }),
    };
    const evaluateSnapshotForTripStart = jest.fn(async () => {
      if (overrides?.tripStartError) throw overrides.tripStartError;
    });
    const tripOrchestration = { evaluateSnapshotForTripStart };
    const batteryObservationProducer = {
      classifyAndEnqueue: jest.fn().mockResolvedValue(null),
    };
    const processPendingBatch = jest.fn(async () => {
      if (overrides?.outboxError) throw overrides.outboxError;
      return 0;
    });
    const resolutionOutboxProcessor = { processPendingBatch };

    const processor = new DimoSnapshotProcessor(
      dimoAuth as never,
      dimoTelemetry as never,
      prisma as never,
      tripOrchestration as never,
      batteryObservationProducer as never,
      undefined as never, // chTelemetry
      undefined, // tripMetrics
      undefined, // episodeResolution
      undefined, // episodeService
      resolutionOutboxProcessor as never,
    );

    const job = {
      id: 'job-1',
      data: { vehicleId, dimoTokenId },
    } as unknown as Job<DimoSnapshotJobData>;

    return {
      processor,
      job,
      prisma,
      evaluateSnapshotForTripStart,
      processPendingBatch,
    };
  };

  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('A. resolution outbox succeeds → normal flow unchanged', async () => {
    const h = buildHarness();

    await h.processor.process(h.job);

    expect(h.processPendingBatch).toHaveBeenCalledTimes(1);
    expect(h.evaluateSnapshotForTripStart).toHaveBeenCalledTimes(1);
    expect(h.prisma.dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('B. resolution outbox throws → evaluateTripStart still executes', async () => {
    const h = buildHarness({ outboxError: new Error('outbox db unavailable') });

    await expect(h.processor.process(h.job)).resolves.toBeUndefined();

    expect(h.processPendingBatch).toHaveBeenCalledTimes(1);
    expect(h.evaluateSnapshotForTripStart).toHaveBeenCalledTimes(1);
    expect(h.prisma.dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
  });

  it('C. evaluateTripStart failure remains visible and non-fatal', async () => {
    const h = buildHarness({ tripStartError: new Error('trip start boom') });

    await expect(h.processor.process(h.job)).resolves.toBeUndefined();

    expect(h.evaluateSnapshotForTripStart).toHaveBeenCalledTimes(1);
    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0]).includes('Trip start eval error'),
      ),
    ).toBe(true);
  });

  it('D. no duplicate snapshot or trip evaluation introduced by the boundary', async () => {
    const h = buildHarness({ outboxError: new Error('outbox db unavailable') });

    await h.processor.process(h.job);

    expect(h.processPendingBatch).toHaveBeenCalledTimes(1);
    expect(h.evaluateSnapshotForTripStart).toHaveBeenCalledTimes(1);
    expect(h.prisma.vehicleLatestState.upsert).toHaveBeenCalledTimes(1);
    expect(h.prisma.dimoPollLog.create).toHaveBeenCalledTimes(1);
  });

  it('E. logger carries actionable subsystem and error context', async () => {
    const h = buildHarness({ outboxError: new Error('outbox db unavailable') });

    await h.processor.process(h.job);

    const logged = errorSpy.mock.calls.map((call) => String(call[0]));
    const boundaryLog = logged.find((line) =>
      line.includes('device_connection_episode_resolution_outbox'),
    );
    expect(boundaryLog).toBeDefined();
    expect(boundaryLog).toContain(`vehicleId=${vehicleId}`);
    expect(boundaryLog).toContain('jobId=job-1');
    expect(boundaryLog).toContain('errorName=Error');
    expect(boundaryLog).toContain('outbox db unavailable');
  });

  it('F. UnrecoverableError is not swallowed (fatal taxonomy preserved)', async () => {
    const h = buildHarness({
      outboxError: new UnrecoverableError('non-retryable outbox fault'),
    });

    await expect(h.processor.process(h.job)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(h.evaluateSnapshotForTripStart).not.toHaveBeenCalled();
    expect(h.prisma.dimoPollLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILURE' }),
      }),
    );
  });
});
