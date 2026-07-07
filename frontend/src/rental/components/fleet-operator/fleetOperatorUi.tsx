import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import {
  getFleetMapToneHex,
  type FleetChipTone,
  type FleetMapTone,
} from '../../lib/fleetVisualState';

export function FleetVisualDot({ mapTone }: { mapTone: FleetMapTone }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: getFleetMapToneHex(mapTone) }}
    />
  );
}

export function fleetChipToneToStatusChip(
  tone: FleetChipTone,
): 'success' | 'info' | 'warning' | 'critical' | 'neutral' {
  if (tone === 'danger') return 'critical';
  if (tone === 'muted') return 'neutral';
  return tone;
}

export function fleetRowClassName(selected: boolean, extra?: string): string {
  return [
    'sq-card-elevated p-2 cursor-pointer transition-all duration-150',
    selected
      ? 'ring-2 ring-[color:var(--brand)] ring-offset-1 ring-offset-background shadow-[var(--shadow-2)]'
      : 'hover:shadow-[var(--shadow-1)]',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function CommandCountBadge({
  count,
  tone = 'neutral',
  active,
}: {
  count: number;
  tone?: 'success' | 'brand' | 'warning' | 'critical' | 'neutral';
  active?: boolean;
}) {
  const toneCls = tone === 'neutral' ? 'bg-muted text-muted-foreground' : `sq-tone-${tone}`;
  return (
    <span
      className={`text-[10px] min-w-[18px] h-[17px] px-1 flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 ${toneCls} ${
        active ? 'ring-1 ring-[color:color-mix(in_srgb,currentColor_35%,transparent)]' : ''
      }`}
    >
      {count}
    </span>
  );
}

export function PanelStatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'critical' | 'warning' | 'neutral';
}) {
  const statusTone = tone === 'warning' ? 'watch' : tone;
  const softClass =
    tone === 'critical'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_9%,transparent)] text-[color:var(--status-critical)] ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_14%,transparent)]'
      : tone === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_9%,transparent)] text-[color:var(--status-watch)] ring-1 ring-[color:color-mix(in_srgb,var(--status-watch)_14%,transparent)]'
        : 'bg-muted/40 text-muted-foreground ring-1 ring-border/40';

  return (
    <StatusChip
      tone={statusTone}
      className={cn('px-2 py-0.5 text-[9.5px] font-semibold tabular-nums', softClass)}
    >
      {label}
    </StatusChip>
  );
}

/** Subtle row background aligned with Notifications / ActionQueue gradients. */
export function fleetCommandRowSurfaceClass(
  severity: 'critical' | 'warning' | 'good',
): string {
  if (severity === 'critical') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),color-mix(in_srgb,var(--status-critical)_2%,transparent))]';
  }
  if (severity === 'warning') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_7%,transparent),color-mix(in_srgb,var(--status-watch)_2%,transparent))]';
  }
  return '';
}

export function fleetCommandReasonChipClass(tone: 'critical' | 'watch' | 'warning' | 'neutral'): string {
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch' || tone === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted/60 text-muted-foreground';
}
