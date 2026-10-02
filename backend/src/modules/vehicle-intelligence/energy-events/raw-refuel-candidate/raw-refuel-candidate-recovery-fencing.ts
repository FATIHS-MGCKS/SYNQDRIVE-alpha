import type { Prisma, RawRefuelCandidate } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { RawRefuelCandidateRecoveryOutcome } from './raw-refuel-candidate-recovery-backoff';

/**
 * Durable recovery-claim identity (generation + lease expectations).
 * Mutation time is evaluated separately at each DB boundary — never snapshotted here.
 */
export interface RawRefuelCandidateRecoveryClaimIdentity {
  expectedClaimGeneration: number;
  /** Batch-claimed rows must hold a non-expired lease before mutating/completing. */
  requireActiveLease: boolean;
  leaseExpiresAt?: Date | null;
}

/** @deprecated Use RawRefuelCandidateRecoveryClaimIdentity + fresh mutationTime parameter. */
export type RawRefuelCandidateRecoveryClaimFence = RawRefuelCandidateRecoveryClaimIdentity;

export interface RawRefuelCandidateRecoveryMutationContext {
  claim: RawRefuelCandidateRecoveryClaimIdentity;
  /** Invoked after any blocking lock acquisition so lease checks use current time. */
  mutationClock: () => Date;
}

export type RawRefuelCandidateRecoveryCompletionResult = 'APPLIED' | 'STALE_CLAIM';

export async function lockRecoveryClaimForMutation(
  tx: Prisma.TransactionClient,
  candidateId: string,
  claim: RawRefuelCandidateRecoveryClaimIdentity,
  mutationTime: Date,
): Promise<RawRefuelCandidate | null> {
  let lockedIds: Array<{ id: string }>;
  if (claim.requireActiveLease) {
    lockedIds = await tx.$queryRaw`
      SELECT id
      FROM raw_refuel_candidates
      WHERE id = ${candidateId}
        AND recovery_attempt_count = ${claim.expectedClaimGeneration}
        AND recovery_lease_expires_at IS NOT NULL
        AND recovery_lease_expires_at > ${mutationTime}
      FOR UPDATE
    `;
  } else {
    lockedIds = await tx.$queryRaw`
      SELECT id
      FROM raw_refuel_candidates
      WHERE id = ${candidateId}
        AND recovery_attempt_count = ${claim.expectedClaimGeneration}
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
  claim: RawRefuelCandidateRecoveryClaimIdentity,
  mutationTime: Date,
  data: {
    recoveryNextAttemptAt: Date | null;
    recoveryLastOutcome: RawRefuelCandidateRecoveryOutcome;
  },
): Promise<RawRefuelCandidateRecoveryCompletionResult> {
  const where: Prisma.RawRefuelCandidateWhereInput = {
    id: candidateId,
    recoveryAttemptCount: claim.expectedClaimGeneration,
  };
  if (claim.requireActiveLease) {
    where.recoveryLeaseExpiresAt = { gt: mutationTime };
  }

  const result = await prisma.rawRefuelCandidate.updateMany({
    where,
    data: {
      recoveryNextAttemptAt: data.recoveryNextAttemptAt,
      recoveryLastOutcome: data.recoveryLastOutcome,
      recoveryLeaseExpiresAt: null,
    },
  });
  return result.count === 1 ? 'APPLIED' : 'STALE_CLAIM';
}
