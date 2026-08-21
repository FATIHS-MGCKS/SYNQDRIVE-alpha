/** Shared notification-style card surfaces for dashboard quick-view tiles. */

export const NOTIFICATION_CARD_NEUTRAL_SURFACE = 'border-border/30 bg-card/40';

export function notificationCriticalSurface(strength: 'default' | 'strong' = 'default'): string {
  if (strength === 'strong') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_26%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_9%,transparent),transparent)]';
  }
  return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
}

export function notificationWatchSurface(): string {
  return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
}

export function notificationSuccessSurface(): string {
  return 'border-border/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-success)_6%,transparent),transparent)]';
}

export function notificationEntrySurface(resolved: boolean, severity: string): string {
  if (resolved) {
    return notificationSuccessSurface();
  }
  if (severity === 'critical') {
    return notificationCriticalSurface('default');
  }
  if (severity === 'warning') {
    return notificationWatchSurface();
  }
  return NOTIFICATION_CARD_NEUTRAL_SURFACE;
}
