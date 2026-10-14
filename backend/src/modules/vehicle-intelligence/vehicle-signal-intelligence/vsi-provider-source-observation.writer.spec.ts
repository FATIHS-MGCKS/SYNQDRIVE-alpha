import { VehicleProviderSourceObservationOutcome } from '@prisma/client';
import {
  buildDimoSnapshotSourceObservationIdempotencyKey,
  VsiProviderSourceObservationWriterService,
} from './vsi-provider-source-observation.writer.service';

describe('VsiProviderSourceObservationWriterService', () => {
  const baseInput = {
    organizationId: 'org',
    vehicleId: 'veh',
    provider: 'DIMO',
    providerBindingId: 'link',
    providerTokenReference: '123',
    pollJobId: 'job-1',
    idempotencyKey: buildDimoSnapshotSourceObservationIdempotencyKey('job-1'),
    providerFetchedAt: new Date('2026-10-14T12:00:00.000Z'),
    providerSourceTimestamp: new Date('2026-10-14T11:59:00.000Z'),
    observationOutcome: VehicleProviderSourceObservationOutcome.VLS_APPLIED,
  };

  it('11 duplicate worker retry does not duplicate evidence', async () => {
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
    const create = jest.fn();
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const aggregate = jest.fn().mockResolvedValue({ _max: { observationIndex: 0n } });
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({ vehicleProviderSourceObservation: { findUnique, aggregate, create } }),
    };
    const writer = new VsiProviderSourceObservationWriterService(prisma as never);
    await writer.recordObservation(baseInput);
    await writer.recordObservation(baseInput);
    expect(create).toHaveBeenCalledTimes(1);
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
  });

  it('13 persistence failure does not throw', async () => {
    process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED = 'true';
    const prisma = {
      $transaction: async () => {
        throw new Error('db down');
      },
    };
    const writer = new VsiProviderSourceObservationWriterService(prisma as never);
    await expect(writer.recordObservation(baseInput)).resolves.toBeUndefined();
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
  });

  it('15 capture flag off is no-op', async () => {
    delete process.env.VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED;
    const prisma = { $transaction: jest.fn() };
    const writer = new VsiProviderSourceObservationWriterService(prisma as never);
    await writer.recordObservation(baseInput);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
