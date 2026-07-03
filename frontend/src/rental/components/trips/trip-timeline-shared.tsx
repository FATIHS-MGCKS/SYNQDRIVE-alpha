import { Icon } from '../ui/Icon';
import type { EnergyEvent } from './timeline.types';
import { formatEnergyEventLocationForDisplay } from './energy-event-location';

export function TripTimelineEnergyCard({ event, isDark }: { event: EnergyEvent; isDark: boolean }) {
  const isRefuel = event.kind === 'REFUEL';
  const date = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dateLabel = date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = `${date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })} – ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

  const durationMin = Math.max(1, Math.round(event.durationSeconds / 60));

  let primaryDelta: string | null = null;
  let secondaryDelta: string | null = null;
  if (isRefuel) {
    if (event.fuelDeltaLiters != null) {
      primaryDelta = `+${event.fuelDeltaLiters.toFixed(1)} L`;
    }
    if (event.fuelDeltaPercent != null) {
      secondaryDelta = `+${event.fuelDeltaPercent.toFixed(0)} %`;
    }
  } else {
    if (event.socDeltaPercent != null) {
      primaryDelta = `+${event.socDeltaPercent.toFixed(0)} % SoC`;
    }
    if (event.energyDeltaKwh != null) {
      secondaryDelta = `+${event.energyDeltaKwh.toFixed(1)} kWh`;
    }
  }

  const accentBg = isRefuel
    ? isDark
      ? 'bg-amber-500/15'
      : 'bg-amber-100'
    : isDark
      ? 'bg-emerald-500/15'
      : 'bg-emerald-100';
  const accentText = isRefuel
    ? isDark
      ? 'text-amber-300'
      : 'text-amber-700'
    : isDark
      ? 'text-emerald-300'
      : 'text-emerald-700';
  const pillBg = isRefuel ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500';

  const confidenceTint =
    event.confidence === 'HIGH'
      ? 'bg-emerald-500/10 text-emerald-500'
      : event.confidence === 'MEDIUM'
        ? 'bg-blue-500/10 text-blue-500'
        : 'bg-muted text-muted-foreground';

  const locationLabel = formatEnergyEventLocationForDisplay(event, 'de');
  const hasCoordinates = event.startLatitude != null && event.startLongitude != null;

  return (
    <div className="rounded-xl border border-border bg-card/40 shadow-sm">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${accentBg}`}>
          {isRefuel ? (
            <Icon name="fuel" className={`w-4 h-4 ${accentText}`} />
          ) : (
            <Icon name="battery-charging" className={`w-4 h-4 ${accentText}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-bold text-foreground">{dateLabel}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{timeLabel}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${pillBg}`}>
              {isRefuel ? 'Tanken' : 'Laden'}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${confidenceTint}`}>
              {event.confidence}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] font-medium text-muted-foreground">
            {primaryDelta && <span className={`font-semibold ${accentText}`}>{primaryDelta}</span>}
            {secondaryDelta && <span>{secondaryDelta}</span>}
            <span>{durationMin} min</span>
            {event.odometerEndKm != null && (
              <span>@ {Math.round(event.odometerEndKm).toLocaleString()} km</span>
            )}
            {(hasCoordinates || locationLabel) && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <Icon name="map-pin" className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
