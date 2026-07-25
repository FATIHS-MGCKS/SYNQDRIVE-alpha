/**
 * Shared in-flight guard for operator mutations (tasks, bookings, handover submit).
 * Prevents double-submit while an async action is running.
 */
export function isOperatorMutationBlocked(
  orgId: string | null | undefined,
  mutating: boolean,
): boolean {
  return !orgId || mutating;
}
