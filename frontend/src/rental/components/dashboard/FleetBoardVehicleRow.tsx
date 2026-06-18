import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
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
  const dimmed = item.isOffline || item.isStale;
  const accent =
    item.severity === 'critical'
      ? 'border-l-[color:var(--status-critical)] bg-[color:color-mix(in_srgb,var(--status-critical)_6%,transparent)]'
      : item.severity === 'warning'
        ? 'border-l-[color:var(--status-watch)] bg-[color:color-mix(in_srgb,var(--status-watch)_5%,transparent)]'
        : item.severity === 'healthy'
          ? 'border-l-[color:var(--status-positive)]'
          : 'border-l-border/60';

  return (
    <div
      className={[
        'group flex flex-col gap-1.5 rounded-xl border border-border/50 border-l-[3px] px-2.5 py-2 transition-all',
        'hover:border-border hover:shadow-[var(--shadow-1)]',
        accent,
        dimmed ? 'opacity-80' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold tabular-nums text-foreground">{item.license}</span>
            <StatusChip tone={severityChipTone(item.severity)} className="text-[8px] uppercase">
              {item.statusLabel}
            </StatusChip>
            {item.isOffline && (
              <StatusChip tone="neutral" className="text-[8px]">
                {de ? 'Offline' : 'Offline'}
              </StatusChip>
            )}
            {item.isStale && !item.isOffline && (
              <StatusChip tone="watch" className="text-[8px]">
                {de ? 'Stale' : 'Stale'}
              </StatusChip>
            )}
          </div>

          {item.makeModel && (
            <p className="truncate text-[10px] text-muted-foreground">{item.makeModel}</p>
          )}

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
            {item.station ? <span className="truncate">{item.station}</span> : (
              <span className="italic">{de ? 'Keine Station' : 'No station'}</span>
            )}
            {item.nextAppointment && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{item.nextAppointment}</span>
              </>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] tabular-nums text-muted-foreground">
            {item.fuelLabel && (
              <span className="inline-flex items-center gap-1">
                <Icon name="fuel" className="h-3 w-3 opacity-70" />
                {item.fuelLabel}
              </span>
            )}
            {item.lastSeenLabel && (
              <span className="inline-flex items-center gap-1">
                <Icon name="signal" className="h-3 w-3 opacity-70" />
                {item.lastSeenLabel}
              </span>
            )}
          </div>

          {item.criticalHint && (
            <p className="mt-1 line-clamp-2 text-[9px] font-medium text-[color:var(--status-critical)]">
              {item.criticalHint}
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="sq-btn sq-btn-secondary shrink-0 self-center text-[10px] opacity-90 transition-opacity group-hover:opacity-100"
        >
          {de ? 'Öffnen' : 'Open'}
          <Icon name="arrow-right" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
