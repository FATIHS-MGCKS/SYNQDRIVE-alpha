import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { RawRefuelCandidateRecoveryOutcome } from './raw-refuel-candidate-recovery-backoff';

/** Post-claim recoveryAttemptCount — monotonic claim generation. */
export interface RawRefuelCandidateRecoveryClaimFence {
  expectedClaimGeneration: number;
  now: Date;
  /** Batch-claimed rows must hold a non-expired lease before mutating. */
  requireActiveLease: boolean;
  /** When requireActiveLease, used for pre-mutation fail-closed checks after network I/O. */
  leaseExpiresAt?: Date | null;
}

export type RawRefuelCandidateRecoveryCompletionResult = 'APPLIED' | 'STALE_CLAIM';

export async function lockRecoveryClaimForMutation(
  tx: Prisma.TransactionClient,
  candidateId: string,
  fence: RawRefuelCandidateRecoveryClaimFence,
): Promise<RawRefuelCandidate | null> {
  let lockedIds: Array<{ id: string }>;
  if (fence.requireActiveLease) {
    lockedIds = await tx.$queryRaw`
      SELECT id
      FROM raw_refuel_candidates
      WHERE id = ${candidateId}
        AND recovery_attempt_count = ${fence.expectedClaimGeneration}
        AND recovery_lease_expires_at IS NOT NULL
        AND recovery_lease_expires_at > ${fence.now}
      FOR UPDATE
    `;
  } else {
    lockedIds = await tx.$queryRaw`
      SELECT id
      FROM raw_refuel_candidates
      WHERE id = ${candidateId}
        AND recovery_attempt_count = ${fence.expectedClaimGeneration}
      FOR UPDATE
    `;
  }
  if (lockedIds.length !== 1) {
    return null;
  }
  return tx.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
}

export async function completeRecoveryAttemptFenced(
  prisma: PrismaService,
  candidateId: string,
  expectedClaimGeneration: number,
  data: {
    recoveryNextAttemptAt: Date | null;
    recoveryLastOutcome: RawRefuelCandidateRecoveryOutcome;
  },
): Promise<RawRefuelCandidateRecoveryCompletionResult> {
  const result = await prisma.rawRefuelCandidate.updateMany({
    where: {
      id: candidateId,
      recoveryAttemptCount: expectedClaimGeneration,
    },
    data: {
      recoveryNextAttemptAt: data.recoveryNextAttemptAt,
      recoveryLastOutcome: data.recoveryLastOutcome,
      recoveryLeaseExpiresAt: null,
    },
  });
  return result.count === 1 ? 'APPLIED' : 'STALE_CLAIM';
}
