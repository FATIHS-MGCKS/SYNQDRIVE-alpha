import { VehicleProviderSourceObservationOutcome, VehicleRegistryLifecycle } from '@prisma/client';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';
import {
  applyVsi03P2cCapturePilotEnv,
  clearVsi03P2cCapturePilotEnv,
} from './vsi03-p2c-capture-test-env';

describe('VsiProviderSourceObservationWriterService', () => {
  const baseFetch = {
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    provider: 'DIMO',
    providerBindingId: '9ff5e350-cd4b-4e3a-956a-4f1770b017f2',
    providerTokenReference: '123',
    pollJobId: 'job-1',
    bullmqAttemptNumber: 0,
    fetchCorrelationId: 'corr-1',
    idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('job-1', 0),
    providerFetchedAt: new Date('2026-10-14T12:00:00.000Z'),
    providerSourceTimestamp: new Date('2026-10-14T11:59:00.000Z'),
    monotonicStaleSkipped: false,
  };

  function prismaWithEligibility() {
    return {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: baseFetch.vehicleId,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        }),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({ id: baseFetch.providerBindingId, provider: 'DIMO' }),
      },
    };
  }

  afterEach(() => {
    clearVsi03P2cCapturePilotEnv();
  });

  it('7 duplicate retry same attempt is idempotent', async () => {
    applyVsi03P2cCapturePilotEnv({
      organizationId: baseFetch.organizationId,
      vehicleId: baseFetch.vehicleId,
    });
    const create = jest.fn();
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ observationIndex: 1n });
    const allocate = jest.fn().mockResolvedValue(1n);
    const writer = new VsiProviderSourceObservationWriterService({
      ...prismaWithEligibility(),
      vehicleProviderSourceObservation: { findUnique, create },
      $transaction: jest.fn(async (fn) =>
        fn({ vehicleProviderSourceObservationCounter: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } }),
      ),
    } as never);
    writer.allocateObservationIndex = allocate;
    await writer.recordProviderFetch(baseFetch);
    await writer.recordProviderFetch(baseFetch);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('6 distinct BullMQ attempts use distinct idempotency keys', () => {
    expect(buildDimoSnapshotFetchObservationIdempotencyKey('j', 0)).not.toBe(
      buildDimoSnapshotFetchObservationIdempotencyKey('j', 1),
    );
  });

  it('13 persistence failure does not throw', async () => {
    applyVsi03P2cCapturePilotEnv({
      organizationId: baseFetch.organizationId,
      vehicleId: baseFetch.vehicleId,
    });
    const writer = new VsiProviderSourceObservationWriterService({
      ...prismaWithEligibility(),
      $queryRaw: jest.fn().mockResolvedValue([{ allocated: 1n }]),
      vehicleProviderSourceObservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
    } as never);
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
  });

  it('17 capture flag off is no-op', async () => {
    clearVsi03P2cCapturePilotEnv();
    const writer = new VsiProviderSourceObservationWriterService({} as never);
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
  });
});
