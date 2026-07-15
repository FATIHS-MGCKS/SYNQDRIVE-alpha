/* ════════════════════════════════════════════════════════════════════
   Status vocabulary — pure helpers + tone maps (no JSX).
   Kept in a separate module from status.tsx so the component file can
   stay fast-refresh friendly (components-only export).
   ════════════════════════════════════════════════════════════════════ */

export type StatusTone =
  | 'success'
  | 'watch'
  | 'warning'
  | 'critical'
  | 'info'
  | 'neutral'
  | 'ai'
  | 'noData';

export const TONE_CHIP: Record<StatusTone, string> = {
  success: 'sq-chip-success',
  watch: 'sq-chip-watch',
  warning: 'sq-chip-warning',
  critical: 'sq-chip-critical',
  info: 'sq-chip-info',
  neutral: 'sq-chip-neutral',
  ai: 'sq-chip-ai',
  noData: 'sq-chip-nodata',
};

export const TONE_DOT: Record<StatusTone, string> = {
  success: 'sq-dot-success',
  watch: 'sq-dot-watch',
  warning: 'sq-dot-warning',
  critical: 'sq-dot-critical',
  info: 'sq-dot-info',
  neutral: 'sq-dot-nodata',
  ai: 'sq-dot-ai',
  noData: 'sq-dot-nodata',
};

/** Resolve the chip class for a tone — handy for one-off bespoke chips. */
export function chipClassForTone(tone: StatusTone): string {
  return TONE_CHIP[tone];
}

/** Resolve the dot class for a tone. */
export function dotClassForTone(tone: StatusTone): string {
  return TONE_DOT[tone];
}

/* ── Health: shared 5-state vehicle-health scale ── */

export type HealthState = 'good' | 'watch' | 'warning' | 'critical' | 'no_data' | 'unknown';

export const HEALTH_TONE: Record<HealthState, StatusTone> = {
  good: 'success',
  watch: 'watch',
  warning: 'warning',
  critical: 'critical',
  no_data: 'noData',
  unknown: 'neutral',
};

export const HEALTH_LABEL: Record<HealthState, string> = {
  good: 'Good',
  watch: 'Watch',
  warning: 'Warning',
  critical: 'Critical',
  no_data: 'No data',
  unknown: 'Unknown',
};

/** Fold any backend health string into the canonical 5-state scale. */
export function normalizeHealthState(value: string | null | undefined): HealthState {
  if (value == null) return 'no_data';
  const s = String(value).toLowerCase().trim();
  if (['good', 'healthy', 'ok', 'excellent', 'good_health'].includes(s)) return 'good';
  if (['watch', 'monitor', 'attention', 'due_soon', 'duesoon', 'check_soon'].includes(s)) return 'watch';
  if (['warning', 'warn', 'plan_service', 'imminent'].includes(s)) return 'warning';
  if (['critical', 'fault', 'overdue', 'replace', 'blocked', 'error'].includes(s)) return 'critical';
  if (['no_data', 'nodata', 'none', 'insufficient', 'insufficient_data', 'untracked', ''].includes(s))
    return 'no_data';
  return 'unknown';
}

export function healthTone(state: HealthState): StatusTone {
  return HEALTH_TONE[state] ?? 'neutral';
}

/* ── Task / alert priority ── */

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';

export const PRIORITY_TONE: Record<TaskPriority, StatusTone> = {
  low: 'neutral',
  medium: 'watch',
  high: 'warning',
  urgent: 'critical',
  critical: 'critical',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
  critical: 'Critical',
};

export function normalizePriority(value: string | null | undefined): TaskPriority {
  const s = String(value ?? '').toLowerCase().trim();
  if (s === 'urgent') return 'urgent';
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium' || s === 'normal') return 'medium';
  return 'low';
}

/**
 * Generic status string → tone. Consolidates the legacy `statusColor()`
 * rainbow into the semantic scale so ad-hoc status strings stay on-system.
 */
export function toneForStatus(status: string | null | undefined): StatusTone {
  const s = String(status ?? '').toLowerCase().trim().replace(/_/g, ' ');
  if (['active', 'available', 'connected', 'paid', 'good', 'clean', 'completed', 'resolved', 'done', 'online', 'success'].includes(s))
    return 'success';
  if (['rented', 'confirmed', 'in progress', 'in service', 'qualified', 'business', 'reserved'].includes(s))
    return 'info';
  if (['pending', 'trial', 'new', 'open', 'waiting', 'needs cleaning', 'standby', 'due soon', 'watch', 'contacted', 'negotiation'].includes(s))
    return 'watch';
  if (['warning', 'attention', 'maintenance', 'past due'].includes(s)) return 'warning';
  if (['suspended', 'blocked', 'cancelled', 'critical', 'error', 'urgent', 'overdue', 'out of service', 'offline', 'failed'].includes(s))
    return 'critical';
  if (['inactive', 'disconnected', 'archived', 'converted', 'no data', 'unknown', 'disabled'].includes(s))
    return 'noData';
  return 'neutral';
}

/* ── Master Admin / platform-specific tone maps (no per-page Tailwind rainbows) ── */

export function platformRoleTone(role: string): StatusTone {
  const map: Record<string, StatusTone> = {
    'Master Admin': 'critical',
    'Org Admin': 'ai',
    'Sub Admin': 'info',
    Worker: 'watch',
    Driver: 'neutral',
    Customer: 'neutral',
  };
  return map[role] ?? 'neutral';
}

export function userAccountStatusTone(status: string): StatusTone {
  const s = String(status).toLowerCase();
  if (s === 'active') return 'success';
  if (s === 'invited') return 'info';
  return 'neutral';
}

export function fleetVehicleStatusTone(status: string): StatusTone {
  const s = String(status).toLowerCase().replace(/_/g, ' ');
  if (s === 'unknown') return 'neutral';
  if (s === 'available') return 'success';
  if (s === 'rented' || s === 'active rented') return 'info';
  if (s === 'maintenance') return 'warning';
  if (s === 'blocked') return 'critical';
  if (s === 'reserved') return 'watch';
  return toneForStatus(status);
}

export function vehicleHealthLabelTone(health: string): StatusTone {
  const s = String(health).toLowerCase();
  if (s === 'good') return 'success';
  if (s === 'warning') return 'warning';
  return 'critical';
}

export function onlineSignalTone(status: string): StatusTone {
  const s = String(status).toUpperCase();
  if (s === 'ONLINE') return 'success';
  if (s === 'STANDBY') return 'watch';
  return 'neutral';
}

export function hmVehicleStateTone(state: string): StatusTone {
  const s = String(state).toUpperCase();
  if (s === 'LINKED_ACTIVE') return 'success';
  if (s === 'APPROVED') return 'info';
  if (s === 'CLEARANCE_PENDING' || s === 'ELIGIBLE') return 'watch';
  if (s === 'REJECTED' || s === 'REVOKED') return 'critical';
  if (s === 'ERROR') return 'warning';
  return 'neutral';
}

export function hmClearanceTone(status: string): StatusTone {
  const s = String(status).toUpperCase();
  if (s === 'APPROVED') return 'success';
  if (s === 'CLEARANCE_PENDING') return 'watch';
  return 'neutral';
}

export function tokenAuthStatusTone(status: string): StatusTone {
  const s = String(status).toUpperCase();
  if (s === 'VALID') return 'success';
  if (s === 'EXPIRED') return 'watch';
  if (s === 'ERROR') return 'critical';
  return 'noData';
}

export function workerMonitoringTone(status: string): StatusTone {
  const s = String(status).toLowerCase();
  if (s === 'healthy' || s === 'ok') return 'success';
  if (s === 'idle') return 'neutral';
  if (s === 'degraded') return 'watch';
  if (s === 'warning') return 'warning';
  if (['failed', 'critical', 'offline'].includes(s)) return 'critical';
  if (s === 'busy') return 'info';
  return 'neutral';
}

export function monitoringSystemHealthTone(health: string): StatusTone {
  const s = String(health).toLowerCase();
  if (s === 'healthy') return 'success';
  if (s === 'degraded') return 'watch';
  if (s === 'warning') return 'warning';
  return 'critical';
}

export function pollLogStatusTone(status: string): StatusTone {
  const s = String(status).toUpperCase();
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILURE' || s === 'TIMEOUT') return 'critical';
  return 'neutral';
}

export function prospectStatusTone(status: string): StatusTone {
  const map: Record<string, StatusTone> = {
    New: 'neutral',
    Enriched: 'ai',
    'Ready to Contact': 'info',
    Contacted: 'watch',
    Replied: 'info',
    Qualified: 'success',
    'Not Interested': 'critical',
    Converted: 'success',
  };
  return map[status] ?? toneForStatus(status);
}

export function prospectPriorityTone(priority: string): StatusTone {
  return PRIORITY_TONE[normalizePriority(priority)] ?? 'neutral';
}

/* ── Activity log / support / subscriptions (Master Admin) ── */

export function activityActionTone(action: string | null | undefined): StatusTone {
  const s = String(action ?? '').toUpperCase().replace(/_/g, ' ').trim();
  if (['CREATE', 'CREATED', 'REGISTER', 'CONNECT'].includes(s)) return 'success';
  if (['UPDATE', 'UPDATED', 'LOGIN', 'LOGOUT', 'SYNC', 'IMPORT', 'CONVERT'].includes(s)) return 'info';
  if (['DELETE', 'DELETED', 'REMOVE', 'DISCONNECT', 'CANCEL'].includes(s)) return 'critical';
  return 'neutral';
}

/** Entity type chips use a single calm tone — no per-entity rainbow. */
export function activityEntityTone(): StatusTone {
  return 'neutral';
}

export function supportStatusTone(status: string | null | undefined): StatusTone {
  const s = String(status ?? '').toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'open' || s === 'new') return 'info';
  if (s === 'in progress' || s === 'working') return 'watch';
  if (s === 'waiting' || s === 'pending') return 'watch';
  if (s === 'resolved') return 'success';
  if (s === 'closed') return 'noData';
  if (s === 'escalated' || s === 'urgent') return 'critical';
  if (s === 'cancelled') return 'noData';
  return toneForStatus(status);
}

export function subscriptionStatusTone(status: string | null | undefined): StatusTone {
  return toneForStatus(status);
}

export function paymentStatusTone(status: string | null | undefined): StatusTone {
  const s = String(status ?? '').toLowerCase().trim();
  if (s === 'paid') return 'success';
  if (s === 'pending' || s === 'due soon' || s === 'trial') return 'watch';
  if (s === 'overdue' || s === 'failed' || s === 'past due') return 'critical';
  return toneForStatus(status);
}

export function planTone(plan: string | null | undefined): StatusTone {
  const s = String(plan ?? '').toLowerCase().trim();
  if (s === 'enterprise' || s === 'custom') return 'info';
  if (s === 'business') return 'info';
  return 'neutral';
}
