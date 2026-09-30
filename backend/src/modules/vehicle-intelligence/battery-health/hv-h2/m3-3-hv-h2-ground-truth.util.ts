import { isActiveGroundTruthEvent } from '../ground-truth/ground-truth-active-authority.util';

/** HV-H2 lifecycle / validation anchor — active, not revoked, not superseded. */
export function isHvH2LifecycleGroundTruthEvent(row: {
  verificationStatus: Parameters<typeof isActiveGroundTruthEvent>[0]['verificationStatus'];
  revocations: readonly unknown[];
  supersededByGroundTruthEvents: readonly unknown[];
}): boolean {
  if (!isActiveGroundTruthEvent(row)) {
    return false;
  }
  if (row.supersededByGroundTruthEvents.length > 0) {
    return false;
  }
  return true;
}
