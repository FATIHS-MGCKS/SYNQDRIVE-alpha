import { ReferenceCaptureObservationWriterService } from './reference-capture-observation-writer.service';
import { ReferenceCaptureBackpressureError, ReferenceCapturePersistenceError } from './reference-capture-observation-writer.service';
import { ReferenceCaptureObservationKind } from '@prisma/client';
import { REFERENCE_CAPTURE_ENVELOPE_VERSION } from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';

function makeWriter(batchSize = 2, maxPending = 4) {
  const config = {
    getBatchSize: () => batchSize,
    getMaxPendingObservations: () => maxPending,
  };
  const repo = {
    appendMany: jest.fn().mockResolvedValue({ count: 0 }),
    appendManyIdempotent: jest.fn().mockResolvedValue({ insertedCount: 0, durablyRepresentedFingerprints: [] }),
  };
  return {
    writer: new ReferenceCaptureObservationWriterService(config as never, repo as never),
    repo,
  };
}

describe('ReferenceCaptureObservationWriterService (RP-010)', () => {
  const envelope = {
    envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
    observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
    provider: 'DIMO',
    connectionProfile: 'DIMO_LTE_R1',
    providerField: 'speed',
    canonicalKey: 'CAN_VEHICLE_SPEED',
    rawIdentity: buildRawIdentity('speed'),
    rawValue: { value: 1 },
    synqReceivedAt: new Date(),
  };

  it('flushes in configured batch sizes', async () => {
    const { writer, repo } = makeWriter(2, 10);
    await writer.enqueueAndMaybeFlush('s1', 'org', 'veh', envelope);
    await writer.enqueueAndMaybeFlush('s1', 'org', 'veh', envelope);
    expect(repo.appendManyIdempotent).toHaveBeenCalledTimes(1);
    expect(repo.appendManyIdempotent.mock.calls[0][0]).toHaveLength(2);
  });

  it('applies backpressure when pending cap exceeded', () => {
    const { writer } = makeWriter(100, 2);
    writer.enqueue('s1', 'org', 'veh', envelope);
    writer.enqueue('s1', 'org', 'veh', envelope);
    expect(() => writer.enqueue('s1', 'org', 'veh', envelope)).toThrow(
      ReferenceCaptureBackpressureError,
    );
  });

  it('accepts duplicate and out-of-order observations without deduplication', async () => {
    const { writer, repo } = makeWriter(10, 10);
    const late = { ...envelope, synqReceivedAt: new Date('2026-08-31T12:00:02.000Z') };
    const early = { ...envelope, synqReceivedAt: new Date('2026-08-31T12:00:01.000Z') };
    writer.enqueue('s1', 'org', 'veh', late);
    writer.enqueue('s1', 'org', 'veh', early);
    writer.enqueue('s1', 'org', 'veh', envelope);
    await writer.flush('s1');
    expect(repo.appendManyIdempotent).toHaveBeenCalledTimes(1);
    expect(repo.appendManyIdempotent.mock.calls[0][0]).toHaveLength(3);
  });

  it('does not lose pending batch when appendMany fails (TEST G)', async () => {
    const { writer, repo } = makeWriter(2, 10);
    repo.appendManyIdempotent.mockRejectedValue(new Error('db unavailable'));
    writer.enqueue('s1', 'org', 'veh', envelope);
    writer.enqueue('s1', 'org', 'veh', envelope);
    await expect(writer.flush('s1', { maxAttempts: 2 })).rejects.toThrow(ReferenceCapturePersistenceError);
    expect(writer.getPendingCount('s1')).toBe(2);
  });

  it('PARTIAL_BATCH_FAILURE_RETRY: earlier batches durably persisted, failed batch retried without duplication', async () => {
    const { writer, repo } = makeWriter(1, 10);
    const fingerprints = ['fp-1', 'fp-2', 'fp-3'];
    let callCount = 0;
    repo.appendManyIdempotent.mockImplementation(async (batch) => {
      callCount += 1;
      const fp = batch[0]?.physicalSampleFingerprint ?? `fp-${callCount}`;
      if (callCount === 3) {
        throw new Error('batch 3 transient failure');
      }
      return { insertedCount: 1, durablyRepresentedFingerprints: [fp] };
    });

    for (const fp of fingerprints) {
      writer.enqueue('s1', 'org', 'veh', { ...envelope, physicalSampleFingerprint: fp } as never);
    }

    await expect(writer.flush('s1', { maxAttempts: 1 })).rejects.toThrow(ReferenceCapturePersistenceError);
    expect(callCount).toBe(3);
    expect(writer.getPendingCount('s1')).toBe(1);

    repo.appendManyIdempotent.mockResolvedValue({
      insertedCount: 1,
      durablyRepresentedFingerprints: ['fp-3'],
    });
    const retry = await writer.flushIdempotent('s1');
    expect(retry.inserted).toBe(1);
    expect(writer.getPendingCount('s1')).toBe(0);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });
});
