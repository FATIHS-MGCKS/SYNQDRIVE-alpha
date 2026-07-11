/**
 * Receipt field semantics — per-user overlay on org-wide notification lifecycle.
 */
export function isUserSnoozeActive(
  snoozedUntil: Date | null | undefined,
  referenceNow: Date = new Date(),
): boolean {
  return !!snoozedUntil && snoozedUntil.getTime() > referenceNow.getTime();
}

export function isPersonallyAcknowledged(
  acknowledgedAt: Date | null | undefined,
): boolean {
  return acknowledgedAt != null;
}

export function isUnreadForUser(readAt: Date | null | undefined): boolean {
  return readAt == null;
}
