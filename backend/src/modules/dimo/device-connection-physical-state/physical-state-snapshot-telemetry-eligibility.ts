/**
 * Snapshot OBD physical evidence may mutate current connectivity projection only when
 * the signal timestamp strictly advances beyond the stored VLS source observation (VW-F-008).
 *
 * A cached connectivity value is not fresh merely because the poller emitted it again;
 * evidence at or before the stored VLS sourceTimestamp is historical context only.
 */
export function isSnapshotObdEvidenceTelemetryEligible(
  obdEvidenceObservedAt: Date | null | undefined,
  existingVlsSourceTimestamp: Date | null | undefined,
): boolean {
  if (!obdEvidenceObservedAt || Number.isNaN(obdEvidenceObservedAt.getTime())) {
    return false;
  }
  if (
    !existingVlsSourceTimestamp ||
    Number.isNaN(existingVlsSourceTimestamp.getTime())
  ) {
    return true;
  }
  return obdEvidenceObservedAt.getTime() > existingVlsSourceTimestamp.getTime();
}
