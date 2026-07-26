import type { NotificationSeverity } from '../notificationQueueModel';

export type CanonicalNotificationSeverity = 'critical' | 'warning' | 'info' | 'success';

/** Maps queue/group severities (incl. legacy overdue/attention) to canonical tokens. */
export function normalizeNotificationSeverity(
  severity: string,
  resolved = false,
): CanonicalNotificationSeverity {
  if (resolved || severity === 'success') return 'success';
  if (severity === 'critical' || severity === 'overdue') return 'critical';
  if (severity === 'warning' || severity === 'attention') return 'warning';
  return 'info';
}

export function severityBadgeTone(
  severity: CanonicalNotificationSeverity | NotificationSeverity,
  resolved: boolean,
): string {
  const canonical = normalizeNotificationSeverity(severity, resolved);
  if (canonical === 'success') {
    return 'bg-[color:color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[color:var(--status-success)]';
  }
  if (canonical === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_12%,transparent)] text-[color:var(--status-critical)]';
  }
  if (canonical === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted/60 text-muted-foreground';
}

export function severityIconTone(
  severity: CanonicalNotificationSeverity | NotificationSeverity,
  resolved: boolean,
): string {
  const canonical = normalizeNotificationSeverity(severity, resolved);
  if (canonical === 'success') return 'sq-tone-success';
  if (canonical === 'critical') return 'sq-tone-critical';
  if (canonical === 'warning') return 'sq-tone-watch';
  return 'bg-muted/50 text-muted-foreground';
}

export function severityEntrySurface(
  severity: CanonicalNotificationSeverity | NotificationSeverity,
  resolved: boolean,
): string {
  const canonical = normalizeNotificationSeverity(severity, resolved);
  if (canonical === 'success') {
    return 'border-border/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-success)_6%,transparent),transparent)]';
  }
  if (canonical === 'critical') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
  }
  if (canonical === 'warning') {
    return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
  }
  return 'border-border/30 bg-card/40';
}
