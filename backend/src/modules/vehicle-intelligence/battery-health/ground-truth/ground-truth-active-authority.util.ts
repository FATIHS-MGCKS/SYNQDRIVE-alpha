import type { BatteryGroundTruthVerificationStatus } from '@prisma/client';

/** Shared active Ground Truth authority (G1) — CONFIRMED, not revoked, not superseded. */
export function isActiveGroundTruthEvent(row: {
  verificationStatus: BatteryGroundTruthVerificationStatus;
  revocations: readonly unknown[];
}): boolean {
  if (row.verificationStatus !== 'CONFIRMED') {
    return false;
  }
  if (row.revocations.length > 0) {
    return false;
  }
  return true;
}
