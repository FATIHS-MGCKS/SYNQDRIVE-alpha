import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { useAddress } from '../../../lib/useAddress';
import type { EnergyEvent, TripTimelineTrip } from './timeline.types';

export function TripTechnicalData({ trip }: { trip: TripTimelineTrip; isDark?: boolean }) {
  const hasRoad =
    trip.citySharePercent != null ||
    trip.highwaySharePercent != null ||
    trip.countrySharePercent != null;
  const hasSpeed = trip.avgSpeedKmh != null || trip.maxSpeedKmh != null;
  if (!hasRoad && !hasSpeed) return null;

  return (
    <div className="rounded-xl border p-3 bg-card border-border">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon name="route" className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Technische Fahrtdaten
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        {trip.avgSpeedKmh != null && (
          <span className="text-muted-foreground">
            Ø Tempo{' '}
            <span className="text-foreground font-bold tabular-nums">
              {Math.round(trip.avgSpeedKmh)} km/h
            </span>
          </span>
        )}
        {trip.maxSpeedKmh != null && (
          <span className="text-muted-foreground">
            Max.{' '}
            <span className="text-foreground font-bold tabular-nums">
              {Math.round(trip.maxSpeedKmh)} km/h
            </span>
          </span>
        )}
        {trip.citySharePercent != null && (
          <span className="text-muted-foreground">
            Stadt{' '}
            <span className="text-foreground font-bold tabular-nums">
              {Math.round(trip.citySharePercent)}%
            </span>
          </span>
        )}
        {trip.countrySharePercent != null && (
          <span className="text-muted-foreground">
            Land{' '}
            <span className="text-foreground font-bold tabular-nums">
              {Math.round(trip.countrySharePercent)}%
            </span>
          </span>
        )}
        {trip.highwaySharePercent != null && (
          <span className="text-muted-foreground">
            Autobahn{' '}
            <span className="text-foreground font-bold tabular-nums">
              {Math.round(trip.highwaySharePercent)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export function TripAddresses({ trip, isDark }: { trip: TripTimelineTrip; isDark: boolean }) {
  const { address: startAddr, loading: startLoading } = useAddress(trip.startLatitude, trip.startLongitude);
  const { address: endAddr, loading: endLoading } = useAddress(trip.endLatitude, trip.endLongitude);

  if (!trip.startLatitude && !trip.endLatitude) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted">
        <Icon
          name="map-pin"
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-green-400' : 'text-green-600'}`}
        />
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground">
            Start
          </div>
          {startLoading ? (
            <Icon name="loader-2" className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-[10px] font-medium truncate text-foreground">
              {startAddr?.formatted ?? '—'}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted">
        <Icon
          name="map-pin"
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-600'}`}
        />
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground">
            Ziel
          </div>
          {endLoading ? (
            <Icon name="loader-2" className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-[10px] font-medium truncate text-foreground">
              {endAddr?.formatted ?? '—'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EventDetail({
  isDark: _isDark,
  label,
  value,
  highlight,
  icon,
}: {
  isDark: boolean;
  label: string;
  value: string;
  highlight?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold ${highlight ? 'text-orange-500' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

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
            {event.startLatitude != null && event.startLongitude != null && (
              <span className="inline-flex items-center gap-1">
                <Icon name="map-pin" className="w-2.5 h-2.5" />
                {event.startLatitude.toFixed(3)}, {event.startLongitude.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
