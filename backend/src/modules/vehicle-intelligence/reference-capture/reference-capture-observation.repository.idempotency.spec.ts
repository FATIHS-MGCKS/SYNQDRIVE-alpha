import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import { ReferenceCaptureObservationKind } from '@prisma/client';
import { REFERENCE_CAPTURE_ENVELOPE_VERSION } from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';

function makeObservation(sessionId: string, fingerprint: string, value: number) {
  return {
    sessionId,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
    observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
    provider: 'DIMO',
    connectionProfile: 'DIMO_LTE_R1',
    providerField: 'speed',
    canonicalKey: 'CAN_VEHICLE_SPEED',
    rawIdentity: buildRawIdentity('speed'),
    rawValue: { value },
    normalizedValue: value,
    synqReceivedAt: new Date('2026-09-01T10:00:01.000Z'),
    physicalSampleFingerprint: fingerprint,
  };
}

describe('ReferenceCaptureObservationRepository idempotency', () => {
  it('uses createMany skipDuplicates and resolves durably represented fingerprints', async () => {
    const fp = 'fp-speed-1';
    const prisma = {
      referenceCaptureObservation: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          { physicalSampleFingerprint: fp, normalizedValueJson: 10, providerField: 'speed', providerTimestamp: new Date() },
        ]),
      },
    };
    const repo = new ReferenceCaptureObservationRepository(prisma as never);
    const result = await repo.appendManyIdempotent([makeObservation('sess-1', fp, 10)]);

    expect(prisma.referenceCaptureObservation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(result.insertedCount).toBe(0);
    expect(result.durablyRepresentedFingerprints).toEqual([fp]);
  });

  it('reports inserted count separately from durably represented fingerprints', async () => {
    const fp = 'fp-speed-2';
    const prisma = {
      referenceCaptureObservation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          { physicalSampleFingerprint: fp, normalizedValueJson: 11, providerField: 'speed', providerTimestamp: new Date() },
        ]),
      },
    };
    const repo = new ReferenceCaptureObservationRepository(prisma as never);
    const result = await repo.appendManyIdempotent([makeObservation('sess-1', fp, 11)]);
    expect(result.insertedCount).toBe(1);
    expect(result.durablyRepresentedFingerprints).toEqual([fp]);
  });
});
