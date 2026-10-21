import { randomUUID } from 'crypto';
import type { HvChargeSession } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { M3_3HvH4ChargeSessionEvidenceMaterializationRepository } from './m3-3-hv-h4-a3-charge-session-evidence-materialization.repository';
import { buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.mapper.v1';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';

describe('M3.3-HV-H4-A3 evidence materialization repository (unit)', () => {
  const baseSession = (): HvChargeSession =>
    ({
      id: randomUUID(),
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      measurementSessionId: null,
      segmentFingerprint: 'seg-fp-1',
      dimoSegmentId: 'dimo-1',
      source: 'DIMO_RECHARGE',
      startAt: new Date('2026-05-01T08:00:00.000Z'),
      endAt: new Date('2026-05-01T10:00:00.000Z'),
      startSocPercent: null,
      endSocPercent: null,
      startEnergyKwh: null,
      endEnergyKwh: null,
      energyAddedKwh: 12,
      deltaSocPercent: null,
      isOngoing: false,
      quality: null,
      idempotencyKey: 'idem-1',
      providerObservedAt: new Date('2026-05-01T10:00:00.000Z'),
      receivedAt: new Date('2026-05-01T10:00:00.000Z'),
      metadata: {
        providerSegmentId: 'prov-1',
        addedEnergyProvenance: 'SEGMENT_EXTREMA',
        qualityStatus: 'QUALIFIED',
      },
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    }) as HvChargeSession;

  it('rejects persistence input when fingerprint disagrees with projection', async () => {
    const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(baseSession());
    const repo = new M3_3HvH4ChargeSessionEvidenceMaterializationRepository({
      batteryHvChargeSessionEvidenceRevision: {} as never,
      batteryHvChargeSessionEvidenceAck: {} as never,
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    });
    await expect(
      repo.persistIdempotent({
        ...input,
        sourceRevisionFingerprint: 'a'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(H4EvidenceRevisionStoredFingerprintMismatchError);
  });

  it('rolls back when ACK stage fails inside transaction', async () => {
    const input = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(baseSession());
    const revisionRow = {
      id: randomUUID(),
      ...input.mirror,
      organizationId: input.projection.organizationId,
      vehicleId: input.projection.vehicleId,
      sourceHvChargeSessionId: input.projection.sourceHvChargeSessionId,
      segmentFingerprint: input.projection.segmentFingerprint,
      evidenceContractVersion: input.projection.evidenceContractVersion,
      sourceRevisionFingerprint: input.sourceRevisionFingerprint,
      scientificEvidenceJson: input.projection,
      capturedAt: new Date(),
      createdAt: new Date(),
    };

    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: revisionRow.id }])
        .mockRejectedValueOnce(new Error('simulated ack insert failure')),
      batteryHvChargeSessionEvidenceRevision: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(revisionRow),
        findFirst: jest.fn(),
      },
      batteryHvChargeSessionEvidenceAck: {
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const $transaction = jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    const repo = new M3_3HvH4ChargeSessionEvidenceMaterializationRepository({
      batteryHvChargeSessionEvidenceRevision: {} as never,
      batteryHvChargeSessionEvidenceAck: {} as never,
      $transaction: $transaction as never,
      $queryRaw: jest.fn(),
    });

    await expect(repo.persistIdempotent(input)).rejects.toThrow('simulated ack insert failure');
    expect($transaction).toHaveBeenCalled();
  });

  it('maps typed conflict errors for verification failures', () => {
    expect(new H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError()).toBeInstanceOf(
      Error,
    );
    expect(new H4EvidenceRevisionMirrorIncoherenceError()).toBeInstanceOf(Error);
    expect(new H4EvidenceAckIdentityMismatchError()).toBeInstanceOf(Error);
  });
});
