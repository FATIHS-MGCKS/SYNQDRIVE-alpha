/**
 * VLS monotonic sourceTimestamp guard (VW-F-008).
 * Reject provider snapshots older than the stored observation time.
 */
export function isIncomingVlsSourceTimestampStale(
  incoming: Date | null | undefined,
  existing: Date | null | undefined,
): boolean {
  if (!incoming || !existing) return false;
  return incoming.getTime() < existing.getTime();
}

export function shouldApplyVlsTelemetryUpdate(
  incoming: Date | null | undefined,
  existing: Date | null | undefined,
): boolean {
  return !isIncomingVlsSourceTimestampStale(incoming, existing);
}
