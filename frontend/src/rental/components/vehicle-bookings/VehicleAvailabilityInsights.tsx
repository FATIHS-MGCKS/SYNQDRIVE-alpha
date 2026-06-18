import { useMemo } from 'react';
import {
  buildAvailabilityInsights,
  type AvailabilityInsight,
} from '../../lib/vehicle-availability-insights.utils';
import {
  calculateUtilization,
  formatFreeDurationLabel,
  formatSlotDurationLabel,
  getNextFreeSlot,
  type AvailabilityBookingInput,
  type AvailabilityRange,
} from '../../lib/vehicle-availability-intelligence.utils';
import { Icon } from '../ui/Icon';
import { vb, vbActionClass } from './vehicle-bookings-ui';

interface VehicleAvailabilityInsightsProps {
  bookings: AvailabilityBookingInput[];
  horizon: AvailabilityRange;
  loading?: boolean;
  embedded?: boolean;
  onCreateBooking?: () => void;
}

export function VehicleAvailabilityInsights({
  bookings,
  horizon,
  loading,
  embedded,
  onCreateBooking,
}: VehicleAvailabilityInsightsProps) {
  const utilization = useMemo(
    () => calculateUtilization(bookings, horizon),
    [bookings, horizon],
  );

  const insights = useMemo(
    () => buildAvailabilityInsights(bookings, horizon, utilization),
    [bookings, horizon, utilization],
  );

  const nextFree = useMemo(
    () => getNextFreeSlot(bookings, horizon),
    [bookings, horizon],
  );

  if (loading) {
    if (embedded) {
      return (
        <div className={`${vb.divider} px-4 py-3 sm:px-5 animate-pulse`} aria-hidden>
          <div className="h-3 w-36 bg-muted rounded mb-2" />
          <div className="h-3 w-full max-w-lg bg-muted/70 rounded" />
        </div>
      );
    }
    return (
      <div className={`${vb.section} ${vb.sectionBodyTight} animate-pulse`} aria-hidden>
        <div className="h-3 w-36 bg-muted rounded mb-2" />
        <div className="h-3 w-full max-w-lg bg-muted/70 rounded" />
      </div>
    );
  }

  if (insights.length === 0 && !nextFree) return null;

  const content = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <p className="sq-section-label">Verfügbarkeit</p>
        <ul className="space-y-1.5" aria-label="Verfügbarkeits-Hinweise">
          {insights.map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
          {insights.length === 0 && nextFree && (
            <InsightRow
              insight={{
                id: 'next-free-fallback',
                tone: 'neutral',
                icon: 'calendar-clock',
                message: `Nächster freier Slot: ${formatSlotDurationLabel(nextFree.durationMs)} ab ${nextFree.start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`,
              }}
            />
          )}
        </ul>
        <p className={vb.meta}>
          Frei im Zeitraum: {formatFreeDurationLabel(utilization.freeDays, utilization.freeHours)}
          {utilization.forecastPct > 0 || utilization.realizedPct > 0 ? (
            <>
              {' '}
              · Forecast {utilization.forecastPct} % · Realisiert {utilization.realizedPct} %
            </>
          ) : null}
        </p>
      </div>

      {onCreateBooking && nextFree && nextFree.durationMs >= 24 * 60 * 60 * 1000 && (
        <button
          type="button"
          onClick={onCreateBooking}
          className={`${vbActionClass(false, true)} shrink-0`}
        >
          <Icon name="plus" className="w-3.5 h-3.5" aria-hidden />
          Buchung für Slot
        </button>
      )}
    </div>
  );

  if (embedded) {
    return (
      <footer className={`${vb.divider} px-4 py-3 sm:px-5 bg-muted/5`} aria-label="Verfügbarkeits-Insights">
        {content}
      </footer>
    );
  }

  return (
    <section className={`${vb.section} ${vb.sectionBodyTight}`} aria-label="Verfügbarkeits-Insights">
      {content}
    </section>
  );
}

function InsightRow({ insight }: { insight: AvailabilityInsight }) {
  const toneClass =
    insight.tone === 'watch'
      ? 'text-foreground'
      : insight.tone === 'info'
        ? 'text-foreground'
        : 'text-muted-foreground';

  return (
    <li className={`flex items-start gap-2 text-[11px] leading-relaxed ${toneClass}`}>
      <Icon name={insight.icon} className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
      <span>{insight.message}</span>
    </li>
  );
}
