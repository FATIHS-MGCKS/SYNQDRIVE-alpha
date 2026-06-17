import { StatusChip } from '../../../components/patterns';
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
  return (
    <StatusChip tone={tone} className="text-[9px] font-semibold uppercase tracking-wide">
      {label}
    </StatusChip>
  );
}
