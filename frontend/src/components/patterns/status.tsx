import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import {
  TONE_CHIP,
  TONE_DOT,
  HEALTH_TONE,
  HEALTH_LABEL,
  PRIORITY_TONE,
  PRIORITY_LABEL,
  normalizeHealthState,
  normalizePriority,
  type StatusTone,
  type HealthState,
  type TaskPriority,
} from './status-utils';

/* ════════════════════════════════════════════════════════════════════
   Status primitives — the single semantic colour vocabulary for SynqDrive.
   Every module (health, tasks, bookings, finance, telemetry) maps its
   domain states onto the one tone scale defined in `status-utils`, so
   colour always means the same thing across the product.
   ════════════════════════════════════════════════════════════════════ */

/* ── StatusDot — a tiny solid indicator, optionally live-pulsing ── */
export interface StatusDotProps {
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ tone = 'neutral', pulse, className }: StatusDotProps) {
  return (
    <span
      className={cn('sq-dot', TONE_DOT[tone], pulse && 'animate-online-pulse', className)}
      aria-hidden
    />
  );
}

/* ── StatusChip — the canonical pill ── */
export interface StatusChipProps {
  tone?: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}

export function StatusChip({
  tone = 'neutral',
  children,
  icon,
  dot = false,
  className,
  title,
}: StatusChipProps) {
  return (
    <span className={cn('sq-chip', TONE_CHIP[tone], className)} title={title}>
      {dot && <StatusDot tone={tone} />}
      {icon}
      {children}
    </span>
  );
}

/* ── HealthStatusChip — shared 5-state vehicle-health scale ── */
export interface HealthStatusChipProps {
  /** Canonical state, or any backend string (normalised automatically). */
  state: HealthState | string;
  label?: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}

export function HealthStatusChip({
  state,
  label,
  icon,
  dot = true,
  className,
  title,
}: HealthStatusChipProps) {
  const canonical = (HEALTH_TONE as Record<string, StatusTone>)[state as string]
    ? (state as HealthState)
    : normalizeHealthState(state as string);
  return (
    <StatusChip tone={HEALTH_TONE[canonical]} icon={icon} dot={dot} className={className} title={title}>
      {label ?? HEALTH_LABEL[canonical]}
    </StatusChip>
  );
}

/* ── PriorityBadge — low · medium · high · urgent · critical ── */
export interface PriorityBadgeProps {
  priority: TaskPriority | string;
  label?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function PriorityBadge({ priority, label, icon, className }: PriorityBadgeProps) {
  const canonical = (PRIORITY_TONE as Record<string, StatusTone>)[priority as string]
    ? (priority as TaskPriority)
    : normalizePriority(priority as string);
  return (
    <StatusChip tone={PRIORITY_TONE[canonical]} icon={icon} className={className}>
      {label ?? PRIORITY_LABEL[canonical]}
    </StatusChip>
  );
}
