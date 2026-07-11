import { NotificationSeverity } from './notification.enums';

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  [NotificationSeverity.SUCCESS]: 0,
  [NotificationSeverity.INFO]: 1,
  [NotificationSeverity.WARNING]: 2,
  [NotificationSeverity.CRITICAL]: 3,
};

export function isRecoverySeverity(severity: NotificationSeverity): boolean {
  return severity === NotificationSeverity.SUCCESS;
}

/** Escalate only upward — never auto-deescalate active severities. */
export function escalateSeverity(
  current: NotificationSeverity,
  incoming: NotificationSeverity,
): NotificationSeverity {
  if (isRecoverySeverity(incoming)) {
    return current;
  }
  if (isRecoverySeverity(current)) {
    return incoming;
  }
  return SEVERITY_RANK[incoming] > SEVERITY_RANK[current] ? incoming : current;
}
