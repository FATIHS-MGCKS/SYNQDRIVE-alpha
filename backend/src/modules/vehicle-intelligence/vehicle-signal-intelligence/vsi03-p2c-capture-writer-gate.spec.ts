import { VehicleRegistryLifecycle } from '@prisma/client';
import {
  buildDimoSnapshotFetchObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';
import {
  applyVsi03P2cCapturePilotEnv,
  clearVsi03P2cCapturePilotEnv,
} from './vsi03-p2c-capture-test-env';
import { VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV } from './vsi03-p2c.config';

describe('VsiProviderSourceObservationWriterService — P2D capture gates', () => {
  const baseFetch = {
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    provider: 'DIMO',
    providerBindingId: '9ff5e350-cd4b-4e3a-956a-4f1770b017f2',
    providerTokenReference: '192922',
    pollJobId: 'job-1',
    bullmqAttemptNumber: 0,
    fetchCorrelationId: 'corr-1',
    idempotencyKey: buildDimoSnapshotFetchObservationIdempotencyKey('corr-1'),
    providerFetchedAt: new Date('2026-10-14T12:00:00.000Z'),
    providerSourceTimestamp: new Date('2026-10-14T11:59:00.000Z'),
    monotonicStaleSkipped: false,
  };

  function writerWithEligibilityMocks(active = true) {
    return new VsiProviderSourceObservationWriterService({
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(
          active
            ? { id: baseFetch.vehicleId, registryLifecycle: VehicleRegistryLifecycle.ACTIVE }
            : null,
        ),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue(
          active
            ? { id: baseFetch.providerBindingId, provider: 'DIMO' }
            : null,
        ),
      },
      vehicleProviderSourceObservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (fn) =>
        fn({
          vehicleProviderSourceObservationCounter: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        }),
      ),
      $queryRaw: jest.fn().mockResolvedValue([{ allocated: 1n }]),
    } as never);
  }

  afterEach(() => {
    clearVsi03P2cCapturePilotEnv();
  });

  it('capture flag on without allowlist remains no-op', async () => {
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV = 'true';
    const writer = writerWithEligibilityMocks();
    writer.allocateObservationIndex = jest.fn();
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
    expect(writer.allocateObservationIndex).not.toHaveBeenCalled();
  });

  it('excluded vehicle in another org is not captured', async () => {
    applyVsi03P2cCapturePilotEnv({
      organizationId: baseFetch.organizationId,
      vehicleId: baseFetch.vehicleId,
    });
    const writer = writerWithEligibilityMocks();
    writer.allocateObservationIndex = jest.fn();
    await expect(
      writer.recordProviderFetch({
        ...baseFetch,
        organizationId: '00000000-0000-4000-8000-000000000099',
      }),
    ).resolves.toBeNull();
    expect(writer.allocateObservationIndex).not.toHaveBeenCalled();
  });

  it('offboarded registry lifecycle abstains', async () => {
    applyVsi03P2cCapturePilotEnv({
      organizationId: baseFetch.organizationId,
      vehicleId: baseFetch.vehicleId,
    });
    const writer = new VsiProviderSourceObservationWriterService({
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: baseFetch.vehicleId,
          registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
        }),
      },
      vehicleDataSourceLink: { findFirst: jest.fn() },
    } as never);
    writer.allocateObservationIndex = jest.fn();
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
  });

  it('persistence failure still does not throw when gates pass', async () => {
    applyVsi03P2cCapturePilotEnv({
      organizationId: baseFetch.organizationId,
      vehicleId: baseFetch.vehicleId,
    });
    const writer = new VsiProviderSourceObservationWriterService({
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: baseFetch.vehicleId,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        }),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({ id: baseFetch.providerBindingId, provider: 'DIMO' }),
      },
      vehicleProviderSourceObservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ allocated: 1n }]),
    } as never);
    writer.allocateObservationIndex = jest.fn().mockResolvedValue(1n);
    await expect(writer.recordProviderFetch(baseFetch)).resolves.toBeNull();
  });
});
