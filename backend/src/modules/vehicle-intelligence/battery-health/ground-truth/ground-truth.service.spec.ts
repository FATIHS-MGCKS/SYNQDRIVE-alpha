import { BatteryGroundTruthVerificationStatus } from '@prisma/client';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';
import { BatteryGroundTruthSourceResolver } from './ground-truth-source.resolver';

describe('BatteryGroundTruthService atomicity', () => {
  it('PG-G unit — revocation rolls back when status update fails', async () => {
    const tx = {
      batteryGroundTruthRevocation: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
      batteryGroundTruthEvent: { update: jest.fn().mockRejectedValue(new Error('mark failed')) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };
    const repo = new BatteryGroundTruthRepository(prisma as never);
    jest.spyOn(repo, 'findById').mockResolvedValue({
      id: 'gt-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
      revocations: [],
    } as never);
    const appendSpy = jest.spyOn(repo, 'appendRevocation');
    const markSpy = jest.spyOn(repo, 'markRevoked');

    const svc = new BatteryGroundTruthService(
      prisma as never,
      repo,
      {} as BatteryGroundTruthSourceResolver,
    );

    await expect(
      svc.revokeGroundTruth({
        organizationId: 'org-1',
        groundTruthEventId: 'gt-1',
        reasonCode: 'OPERATOR_REVOKE',
      }),
    ).rejects.toThrow('mark failed');

    expect(appendSpy).toHaveBeenCalledWith(expect.any(Object), tx);
    expect(markSpy).toHaveBeenCalledWith('gt-1', tx);
  });

  it('PG-H unit — supersession does not persist replacement when prior mark fails', async () => {
    const preparedPayload = {
      candidate: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'LV',
        sourceAuthority: 'WORKSHOP',
        pointers: { sourceBatteryEvidenceId: 'ev-2' },
      },
      admission: {
        contractVersion: 'M3_3G_GROUND_TRUTH_ADMISSION_V1',
        level: 'ADMIT_VALIDATION_GROUND_TRUTH',
        reasons: ['ADMITTED'],
      },
      effectiveAt: new Date('2026-05-01T10:00:00.000Z'),
      fingerprint: 'fp-2',
      createInput: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'LV',
        effectiveAt: new Date('2026-05-01T10:00:00.000Z'),
        sourceAuthority: 'WORKSHOP',
        sourceContentFingerprint: 'fp-2',
        sourceBatteryEvidenceId: 'ev-2',
      },
    };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      batteryGroundTruthEvent: {
        update: jest.fn().mockRejectedValue(new Error('supersede failed')),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const repo = new BatteryGroundTruthRepository(prisma as never);
    const svc = new BatteryGroundTruthService(
      prisma as never,
      repo,
      {} as BatteryGroundTruthSourceResolver,
    );
    jest.spyOn(svc, 'prepareAdmitPayload').mockResolvedValue(preparedPayload as never);
    jest.spyOn(repo, 'findById').mockResolvedValue({
      id: 'prior-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
      revocations: [],
    } as never);
    jest.spyOn(repo, 'findConfirmedByFingerprint').mockResolvedValue(null);
    jest.spyOn(repo, 'lockGroundTruthRowForUpdate').mockResolvedValue(undefined);
    const createSpy = jest.spyOn(repo, 'createConfirmedEvent').mockResolvedValue({ id: 'new-1' } as never);
    jest.spyOn(repo, 'markSuperseded').mockRejectedValue(new Error('supersede failed'));

    await expect(
      svc.supersedeGroundTruth({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        priorGroundTruthEventId: 'prior-1',
        replacementCandidate: preparedPayload.candidate as never,
      }),
    ).rejects.toThrow('supersede failed');

    expect(createSpy).toHaveBeenCalledWith(expect.any(Object), tx);
  });
});
