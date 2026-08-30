import { Icon } from '../ui/Icon';
import { useLanguage } from '../../i18n/LanguageContext';
import type { EnergyEvent } from './timeline.types';
import {
  formatRechargeDurationMinutes,
  formatRefuelSignalChangeMinutes,
  refuelPrimaryFuelDelta,
  refuelSecondaryFuelDelta,
} from './trips-energy-i18n';

export function TripTimelineEnergyCard({ event, isDark }: { event: EnergyEvent; isDark: boolean }) {
  const { t, locale } = useLanguage();
  const isRefuel = event.kind === 'REFUEL';
  const date = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dateLabel = date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = `${date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })} – ${end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const primaryDelta = isRefuel
    ? refuelPrimaryFuelDelta(event)
    : event.socDeltaPercent != null
      ? `+${event.socDeltaPercent.toFixed(0)} % SoC`
      : null;
  const secondaryDelta = isRefuel
    ? refuelSecondaryFuelDelta(event)
    : event.energyDeltaKwh != null
      ? `+${event.energyDeltaKwh.toFixed(1)} kWh`
      : null;

  const refuelSignalChangeMinutes =
    isRefuel && event.fuelLevelRiseDurationSeconds != null
      ? formatRefuelSignalChangeMinutes(event.fuelLevelRiseDurationSeconds)
      : null;

  const rechargeDurationMinutes = !isRefuel
    ? formatRechargeDurationMinutes(event.durationSeconds)
    : null;

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
        ? 'bg-status-info/10 text-status-info'
        : 'bg-muted text-muted-foreground';

  return (
    <div className=" surface-premium">
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
              {isRefuel ? t('trips.energy.refuel.kindLabel') : t('trips.energy.recharge.kindLabel')}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${confidenceTint}`}>
              {event.confidence}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] font-medium text-muted-foreground">
            {isRefuel && (
              <span className={`font-semibold ${accentText}`}>
                {t('trips.energy.refuel.detected')}
              </span>
            )}
            {primaryDelta && <span className={`font-semibold ${accentText}`}>{primaryDelta}</span>}
            {secondaryDelta && <span>{secondaryDelta}</span>}
            {refuelSignalChangeMinutes != null && (
              <span>
                {t('trips.energy.refuel.signalChangeMinutes', {
                  minutes: refuelSignalChangeMinutes,
                })}
              </span>
            )}
            {rechargeDurationMinutes != null && (
              <span>
                {t('trips.energy.recharge.durationMinutes', {
                  minutes: rechargeDurationMinutes,
                })}
              </span>
            )}
            {isRefuel && (
              <span className="text-[9px] text-muted-foreground/80">
                {t('trips.energy.refuel.detectionWindow', {
                  from: date.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  to: end.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </span>
            )}
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
