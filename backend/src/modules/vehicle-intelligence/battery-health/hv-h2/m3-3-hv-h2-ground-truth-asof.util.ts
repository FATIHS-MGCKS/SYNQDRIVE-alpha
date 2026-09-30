import type { BatteryGroundTruthVerificationStatus } from '@prisma/client';

export interface HvH2GroundTruthAsOfRow {
  verificationStatus: BatteryGroundTruthVerificationStatus;
  createdAt: Date;
  revocations: readonly { revokedAt: Date }[];
  supersededByGroundTruthEvents: readonly { createdAt: Date }[];
}

/** GT row must exist in DB knowledge by evaluation time (not future persistence). */
export function isHvH2GroundTruthKnowableAtEvaluationAt(
  row: Pick<HvH2GroundTruthAsOfRow, 'createdAt'>,
  evaluationAt: Date,
): boolean {
  return row.createdAt.getTime() <= evaluationAt.getTime();
}

/**
 * Historical active-state at evaluationAt — does not use current-only G1 active helper.
 * Termination (revocation/supersession) applies only when knowable by evaluationAt.
 */
export function isHvH2GroundTruthActiveAtEvaluationAt(
  row: HvH2GroundTruthAsOfRow,
  evaluationAt: Date,
): boolean {
  if (!isHvH2GroundTruthKnowableAtEvaluationAt(row, evaluationAt)) {
    return false;
  }
  const evalMs = evaluationAt.getTime();
  const revokedByEval = row.revocations.some((r) => r.revokedAt.getTime() <= evalMs);
  if (revokedByEval) {
    return false;
  }
  const supersededByEval = row.supersededByGroundTruthEvents.some(
    (s) => s.createdAt.getTime() <= evalMs,
  );
  if (supersededByEval) {
    return false;
  }
  if (row.verificationStatus !== 'CONFIRMED') {
    const terminatedAfterEval =
      row.revocations.some((r) => r.revokedAt.getTime() > evalMs) ||
      row.supersededByGroundTruthEvents.some((s) => s.createdAt.getTime() > evalMs);
    if (terminatedAfterEval) {
      return true;
    }
    return false;
  }
  return true;
}
