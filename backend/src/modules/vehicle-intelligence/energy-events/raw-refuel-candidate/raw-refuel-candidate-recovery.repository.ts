import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES } from './raw-refuel-candidate.constants';
import type { RawRefuelCandidateRecoveryOutcome } from './raw-refuel-candidate-recovery-backoff';

export interface ClaimedRawRefuelCandidateRecoveryRow {
  id: string;
  vehicleId: string;
  organizationId: string;
  lifecycleState: string;
  signalChannel: string;
  recoveryAttemptCount: number;
}

const RECOVERY_ELIGIBLE_STATES = [...RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES];

export class RawRefuelCandidateRecoveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claimDueCandidates(
    limit: number,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<ClaimedRawRefuelCandidateRecoveryRow[]> {
    return this.prisma.$queryRaw<ClaimedRawRefuelCandidateRecoveryRow[]>`
      UPDATE raw_refuel_candidates AS c
      SET
        recovery_last_attempt_at = ${now},
        recovery_attempt_count = c.recovery_attempt_count + 1,
        recovery_lease_expires_at = ${leaseExpiresAt}
      WHERE c.id IN (
        SELECT id
        FROM raw_refuel_candidates
        WHERE lifecycle_state::text = ANY(ARRAY[${Prisma.join(RECOVERY_ELIGIBLE_STATES)}]::text[])
          AND (
            recovery_next_attempt_at IS NULL
            OR recovery_next_attempt_at <= ${now}
          )
          AND (
            recovery_lease_expires_at IS NULL
            OR recovery_lease_expires_at <= ${now}
          )
        ORDER BY recovery_next_attempt_at ASC NULLS FIRST, first_observed_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING
        c.id,
        c.vehicle_id AS "vehicleId",
        c.organization_id AS "organizationId",
        c.lifecycle_state::text AS "lifecycleState",
        c.signal_channel::text AS "signalChannel",
        c.recovery_attempt_count AS "recoveryAttemptCount"
    `;
  }

  async completeRecoveryAttempt(
    candidateId: string,
    data: {
      recoveryNextAttemptAt: Date | null;
      recoveryLastOutcome: RawRefuelCandidateRecoveryOutcome;
    },
  ): Promise<void> {
    await this.prisma.rawRefuelCandidate.update({
      where: { id: candidateId },
      data: {
        recoveryNextAttemptAt: data.recoveryNextAttemptAt,
        recoveryLastOutcome: data.recoveryLastOutcome,
        recoveryLeaseExpiresAt: null,
      },
    });
  }

  async countDueCandidates(now: Date): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM raw_refuel_candidates
      WHERE lifecycle_state::text = ANY(ARRAY[${Prisma.join(RECOVERY_ELIGIBLE_STATES)}]::text[])
        AND (recovery_next_attempt_at IS NULL OR recovery_next_attempt_at <= ${now})
        AND (recovery_lease_expires_at IS NULL OR recovery_lease_expires_at <= ${now})
    `;
    return Number(result[0]?.count ?? 0n);
  }
}
