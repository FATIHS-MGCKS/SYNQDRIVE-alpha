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
