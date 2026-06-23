import type { MouseEvent } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { VehicleData } from '../../data/vehicles';
import { getShortModel } from '../../data/vehicles';
import { formatFleetDateTime } from '../../../lib/formatVehicleDisplay';
import { FleetEnergyIndicator } from '../fleet/FleetEnergyIndicator';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import type { FleetVehicleContext } from '../../lib/fleet-operator-panel';

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel].filter(Boolean).join(' ') || model || 'Unknown vehicle';
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? '';
}

/** Station + a single compact appointment fragment (no long mixed chains). */
function buildLocationLine(v: VehicleData): string {
  const station = vehicleStationLabel(v);
  if (v.status === 'Active Rented' && v.activeReturnAt) {
    return [station, `Return ${formatFleetDateTime(v.activeReturnAt)}`].filter(Boolean).join(' · ');
  }
  if (v.status === 'Reserved' && v.reservedPickupAt) {
    return [station, `Pickup ${formatFleetDateTime(v.reservedPickupAt)}`]
      .filter(Boolean)
      .join(' · ');
  }
  return station || '—';
}

export interface FleetOperatorRowProps {
  ctx: FleetVehicleContext;
  selected: boolean;
  onClick: () => void;
  onDetailClick: (e: MouseEvent) => void;
  rowRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isDarkMode?: boolean;
}

export function FleetOperatorRow({
  ctx,
  selected,
  onClick,
  onDetailClick,
  rowRef,
  onMouseEnter,
  onMouseLeave,
}: FleetOperatorRowProps) {
  const { vehicle: v, visual, health } = ctx;
  const display = resolveFleetVehicleDisplayState(v, {
    rentalHealth: health,
    visual,
  });

  // Only genuine connectivity problems (offline / no_signal) dim an Available
  // row. Standby + signal_delayed stay at full opacity (normal/secondary).
  const dimmed = display.showTelemetryWarning && v.status === 'Available';

  // Subtle full-row tint by operational status — no left accent bar.
  const tint =
    display.primaryStatus === 'critical' || display.primaryStatus === 'blocked'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
      : display.primaryStatus === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
        : '';

  const locationLine = buildLocationLine(v);

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group flex cursor-pointer items-center gap-2 px-2.5 py-2 transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
        tint,
        selected && 'bg-[color:color-mix(in_srgb,var(--brand)_8%,transparent)]',
      )}
    >
      <div className={cn('min-w-0 flex-1 space-y-1', dimmed && 'opacity-75')}>
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {v.license}
            </span>
            <span className="truncate text-[10.5px] leading-snug text-muted-foreground">
              {fleetVehicleTitle(v)}
            </span>
          </div>
          <StatusChip
            tone={display.primaryTone}
            className="shrink-0 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
          >
            {display.primaryLabel}
          </StatusChip>
        </div>

        <p className="truncate text-[10px] text-muted-foreground" title={locationLine}>
          {locationLine}
        </p>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          {display.energy.percent != null && (
            <FleetEnergyIndicator
              percent={display.energy.percent}
              isElectric={display.energy.kind === 'battery'}
              tone={display.energy.tone}
            />
          )}
          <>
            {display.energy.percent != null && <span aria-hidden>·</span>}
            <span
              className={cn(
                display.showTelemetryWarning && 'text-[color:var(--status-watch)]',
              )}
            >
              {display.telemetryLabel}
            </span>
          </>
          {display.odometerLabel && (
            <>
              <span aria-hidden>·</span>
              <span>{display.odometerLabel}</span>
            </>
          )}
        </div>

        {display.criticalHint && (
          <p className="line-clamp-1 text-[10px] font-medium leading-snug text-[color:var(--status-critical)] text-pretty">
            {display.criticalHint}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onDetailClick}
        aria-label="Open vehicle details"
        className="sq-press inline-flex min-h-9 shrink-0 items-center gap-1 self-center rounded-md px-2 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        Open
        <Icon name="arrow-right" className="h-3 w-3" />
      </button>
    </div>
  );
}
