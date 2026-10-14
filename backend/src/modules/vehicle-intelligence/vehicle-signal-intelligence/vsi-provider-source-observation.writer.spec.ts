import { VehicleProviderSourceObservationOutcome } from '@prisma/client';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';

describe('VsiProviderSourceObservationWriterService', () => {
  const baseFetch = {
    organizationId: 'org',
    vehicleId: 'veh',
    provider: 'DIMO',
    providerBindingId: 'link',
    providerTokenReference: '123',
    pollJobId: 'job-1',
    bullmqAttemptNumber: 0,
    fetchCorrelationId: 'corr-1',
    idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('job-1', 0),
    providerFetchedAt: new Date('2026-10-14T12:00:00.000Z'),
    providerSourceTimestamp: new Date('2026-10-14T11:59:00.000Z'),
    monotonicStaleSkipped: false,
  };

  it('7 duplicate retry same attempt is idempotent', async () => {
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
    const create = jest.fn();
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ observationIndex: 1n });
    const allocate = jest.fn().mockResolvedValue(1n);
    const writer = new VsiProviderSourceObservationWriterService({
      vehicleProviderSourceObservation: { findUnique, create },
      $transaction: jest.fn(async (fn) =>
        fn({ vehicleProviderSourceObservationCounter: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } }),
      ),
    } as never);
    writer.allocateObservationIndex = allocate;
    await writer.recordProviderFetch(baseFetch);
    await writer.recordProviderFetch(baseFetch);
    expect(create).toHaveBeenCalledTimes(1);
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
  });

  it('6 distinct BullMQ attempts use distinct idempotency keys', () => {
    expect(buildDimoSnapshotFetchObservationIdempotencyKey('j', 0)).not.toBe(
      buildDimoSnapshotFetchObservationIdempotencyKey('j', 1),
    );
  });

  it('13 persistence failure does not throw', async () => {
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
    const writer = new VsiProviderSourceObservationWriterService({
      $queryRaw: jest.fn().mockResolvedValue([{ allocated: 1n }]),
      vehicleProviderSourceObservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
    } as never);
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
  });

  it('17 capture flag off is no-op', async () => {
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
    const writer = new VsiProviderSourceObservationWriterService({} as never);
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
  });
});
