import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { FleetEnergyIndicator } from '../fleet/FleetEnergyIndicator';
import { severityChipTone } from './fleetStateBuilder';
import type { FleetBoardItem } from './dashboardTypes';

interface FleetBoardVehicleRowProps {
  item: FleetBoardItem;
  locale: string;
  vehicleName?: string;
  onOpen: () => void;
}

export function FleetBoardVehicleRow({ item, locale, onOpen }: FleetBoardVehicleRowProps) {
  const de = locale === 'de';
  // Only genuine connectivity problems (offline / no_signal) dim the row.
  // Standby + signal_delayed are normal/secondary states shown calmly.
  const dimmed = item.showTelemetryWarning;

  // Subtle full-row tint by severity — no left accent bar anymore.
  const tint =
    item.severity === 'critical'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
      : item.severity === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
        : '';

  // Central telemetry-freshness label — identical logic to the Fleet Page rows.
  const telemetryLabel = item.telemetryLabel;
  const telemetryWarn = item.showTelemetryWarning;

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2.5 py-2 transition-colors hover:bg-muted/20',
        tint,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn('min-w-0 flex-1 space-y-1 text-left', dimmed && 'opacity-75')}
      >
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {item.license}
            </span>
            {item.makeModel && (
              <span className="truncate text-[10.5px] leading-snug text-muted-foreground">
                {item.makeModel}
              </span>
            )}
          </div>
          <StatusChip
            tone={severityChipTone(item.severity)}
            className="shrink-0 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
          >
            {item.statusLabel}
          </StatusChip>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {item.station ? (
            <span className="truncate">{item.station}</span>
          ) : (
            <span className="italic">{de ? 'Keine Station' : 'No station'}</span>
          )}
          {item.nextAppointment && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{item.nextAppointment}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          {item.fuelPercent != null && (
            <FleetEnergyIndicator percent={item.fuelPercent} isElectric={item.isElectric} />
          )}
          {telemetryLabel && (
            <>
              {item.fuelPercent != null && <span aria-hidden>·</span>}
              <span className={cn(telemetryWarn && 'text-[color:var(--status-watch)]')}>
                {telemetryLabel}
              </span>
            </>
          )}
        </div>

        {item.criticalHint && (
          <p className="line-clamp-1 text-[10px] font-medium leading-snug text-[color:var(--status-critical)] text-pretty">
            {item.criticalHint}
          </p>
        )}
      </button>

      <button
        type="button"
        onClick={onOpen}
        aria-label={de ? `Fahrzeug ${item.license} öffnen` : `Open vehicle ${item.license}`}
        className="sq-press inline-flex min-h-9 shrink-0 items-center gap-1 self-center rounded-md px-2 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        {de ? 'Öffnen' : 'Open'}
        <Icon name="arrow-right" className="h-3 w-3" />
      </button>
    </div>
  );
}
