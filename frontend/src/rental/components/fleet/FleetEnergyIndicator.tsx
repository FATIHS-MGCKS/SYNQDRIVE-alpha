import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import {
  fleetEnergyTone,
  fleetEnergyToneColor,
  type FleetEnergyTone,
} from '../../lib/fleetVehicleDisplay';

interface FleetEnergyIndicatorProps {
  percent: number | null;
  isElectric: boolean;
  /** Pre-resolved tone; derived from `percent` when omitted. */
  tone?: FleetEnergyTone;
  className?: string;
}

/**
 * Compact, inline fuel/battery indicator shared by the Dashboard Fleet State
 * Board and the Fleet Page rows: small icon + short colored bar + percentage.
 * The word "Fuel"/"Battery" is intentionally omitted — the icon carries it.
 */
export function FleetEnergyIndicator({
  percent,
  isElectric,
  tone,
  className,
}: FleetEnergyIndicatorProps) {
  if (percent == null || !Number.isFinite(percent)) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-muted-foreground', className)}>
        <Icon
          name={isElectric ? 'battery' : 'fuel'}
          className="h-3 w-3 shrink-0 opacity-60"
          aria-hidden
        />
        <span className="text-[10px]">—</span>
      </span>
    );
  }

  const clamped = Math.max(0, Math.min(100, percent));
  const color = fleetEnergyToneColor(tone ?? fleetEnergyTone(clamped));

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon
        name={isElectric ? 'battery' : 'fuel'}
        className="h-3 w-3 shrink-0 opacity-70"
        aria-hidden
      />
      <span className="h-1.5 w-7 overflow-hidden rounded-full bg-muted/70" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: `color-mix(in srgb, ${color} 85%, transparent)`,
          }}
        />
      </span>
      <span className="font-medium tabular-nums text-foreground/85">{Math.ceil(clamped)}%</span>
    </span>
  );
}
