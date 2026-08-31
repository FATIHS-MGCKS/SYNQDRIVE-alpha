import { ReferenceCaptureObservationWriterService } from './reference-capture-observation-writer.service';
import { ReferenceCaptureBackpressureError } from './reference-capture-observation-writer.service';
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
    expect(repo.appendMany).toHaveBeenCalledTimes(1);
    expect(repo.appendMany.mock.calls[0][0]).toHaveLength(2);
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
    expect(repo.appendMany).toHaveBeenCalledTimes(1);
    expect(repo.appendMany.mock.calls[0][0]).toHaveLength(3);
  });
});
