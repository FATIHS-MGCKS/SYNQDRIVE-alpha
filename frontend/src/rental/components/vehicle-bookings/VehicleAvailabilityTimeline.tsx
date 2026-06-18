import { useMemo } from 'react';
import { chipClassForTone } from '../../../components/patterns';
import {
  bookingStatusAriaLabel,
  bookingStatusIcon,
  bookingStatusLabel,
  bookingStatusTone,
  bookingTimelineBarClass,
  bookingTimelineBarEmphasisClass,
  type BookingUiStatus,
} from '../bookings/bookingStatus';
import { bookingRef } from '../bookings/bookingUtils';
import { Icon } from '../ui/Icon';
import {
  computeTimelineFreeSlots,
  formatHorizonRangeLabel,
  positionAndPackTimelineBookings,
  TIMELINE_RANGE_PRESETS,
  timelineNowMarkerPct,
  type TimelineHorizon,
  type TimelineRangeMode,
  type TimelineBookingInput,
} from '../../lib/vehicle-availability-timeline.utils';
import { VehicleAvailabilityInsights } from './VehicleAvailabilityInsights';
import { vb, vbActionClass } from './vehicle-bookings-ui';

const MAX_COMPACT_LANES = 5;
const LANE_HEIGHT = 30;
const LANE_HEIGHT_COMPACT = 22;
const LANE_GAP = 4;

interface VehicleAvailabilityTimelineProps {
  horizon: TimelineHorizon;
  bookings: TimelineBookingInput[];
  rangeMode: TimelineRangeMode;
  onRangeModeChange: (mode: TimelineRangeMode) => void;
  onNavigate: (direction: -1 | 0 | 1) => void;
  loading?: boolean;
  conflictBookingIds?: Set<string>;
  onSelectBooking?: (bookingId: string) => void;
  onCreateBooking?: () => void;
}

export function VehicleAvailabilityTimeline({
  horizon,
  bookings,
  rangeMode,
  onRangeModeChange,
  onNavigate,
  loading,
  conflictBookingIds,
  onSelectBooking,
  onCreateBooking,
}: VehicleAvailabilityTimelineProps) {
  const { items, laneCount } = useMemo(
    () => positionAndPackTimelineBookings(bookings, horizon),
    [bookings, horizon],
  );
  const freeSlots = useMemo(() => computeTimelineFreeSlots(bookings, horizon), [bookings, horizon]);
  const nowLeft = useMemo(() => timelineNowMarkerPct(horizon), [horizon]);

  const compact = laneCount > MAX_COMPACT_LANES;
  const laneHeight = compact ? LANE_HEIGHT_COMPACT : LANE_HEIGHT;
  const trackHeight = Math.max(laneHeight + 8, laneCount * (laneHeight + LANE_GAP) + 12);
  const minTrackWidth = Math.max(640, horizon.dayCount * (horizon.dayCount <= 14 ? 56 : 36));

  const rangeLabel = formatHorizonRangeLabel(horizon);

  return (
    <section className={vb.section} aria-labelledby="vb-timeline-title">
      <header className={`${vb.sectionHeader} space-y-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="sq-tone-brand w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="calendar-clock" className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 id="vb-timeline-title" className={vb.titleSm}>
                Verfügbarkeits-Timeline
              </h3>
              <p className={`${vb.meta} mt-0.5`}>{rangeLabel}</p>
            </div>
          </div>

          <div
            className="sq-tab-bar p-0.5 flex items-stretch flex-wrap gap-0.5"
            role="group"
            aria-label="Zeitraum wählen"
          >
            {TIMELINE_RANGE_PRESETS.map((preset) => (
              <button
                key={String(preset.id)}
                type="button"
                onClick={() => onRangeModeChange(preset.id)}
                className={`${vbActionClass(false, true)} min-w-0 rounded-md border-transparent ${
                  rangeMode === preset.id
                    ? 'sq-tone-brand shadow-[var(--shadow-xs)] border-[color:var(--brand)]/15'
                    : 'border-transparent bg-transparent'
                } transition-all duration-[var(--dur-fast)]`}
                aria-pressed={rangeMode === preset.id}
              >
                <span className="truncate">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate(-1)}
            className={vbActionClass(false, true)}
            aria-label="Vorheriger Zeitraum"
          >
            <Icon name="chevron-left" className="w-3.5 h-3.5" aria-hidden />
            Zurück
          </button>
          <button
            type="button"
            onClick={() => onNavigate(0)}
            className={`${vbActionClass(false, true)} text-foreground`}
            aria-label="Heute"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => onNavigate(1)}
            className={vbActionClass(false, true)}
            aria-label="Nächster Zeitraum"
          >
            Weiter
            <Icon name="chevron-right" className="w-3.5 h-3.5" aria-hidden />
          </button>
          {!loading && (
            <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral tabular-nums">
              {items.length} Buchung{items.length === 1 ? '' : 'en'}
            </span>
          )}
        </div>

        <TimelineLegend />
      </header>

      {loading ? (
        <div className="p-4 animate-pulse">
          <div className="h-8 rounded-lg bg-muted/50 mb-3" />
          <div className="h-24 rounded-xl bg-muted/40" />
        </div>
      ) : items.length === 0 && freeSlots.length === 0 ? (
        <TimelineEmptyState onCreateBooking={onCreateBooking} />
      ) : (
        <>
          <div className="relative">
            <p className="lg:hidden px-4 pt-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Icon name="more-horizontal" className="w-3 h-3 opacity-70" aria-hidden />
              Horizontal scrollen für Details
            </p>
            <div className="overflow-x-auto overscroll-x-contain scroll-smooth">
              <div className="p-4 pt-2 lg:pt-3" style={{ minWidth: `${minTrackWidth}px` }}>
                <div className={`${vb.inset} overflow-hidden`}>
                <DayHeaderRow horizon={horizon} />
                <div className="relative" style={{ height: trackHeight }}>
                  <DayGridColumns horizon={horizon} />
                  {nowLeft != null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[color:var(--status-critical)]/80 z-[30] pointer-events-none"
                      style={{ left: `${nowLeft}%` }}
                      aria-hidden
                    />
                  )}
                  {freeSlots.map((slot, idx) => (
                    <FreeSlotPill key={`free-${idx}`} slot={slot} top={6} />
                  ))}
                  {items.map((booking) => (
                    <TimelineBookingBar
                      key={booking.id || `${booking.customerName}-${booking.startDate.toISOString()}`}
                      booking={booking}
                      laneHeight={laneHeight}
                      laneGap={LANE_GAP}
                      compact={compact}
                      hasConflict={Boolean(booking.id && conflictBookingIds?.has(booking.id))}
                      onSelectBooking={onSelectBooking}
                    />
                  ))}
                </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 lg:hidden" aria-label="Buchungsliste kompakt">
            <p className="sq-section-label mb-2">Kompakt</p>
            <div className="space-y-2">
              {items.slice(0, 8).map((booking) => (
                <MobileBookingCard
                  key={`m-${booking.id}`}
                  booking={booking}
                  hasConflict={Boolean(booking.id && conflictBookingIds?.has(booking.id))}
                  onSelectBooking={onSelectBooking}
                />
              ))}
            </div>
          </div>

          <VehicleAvailabilityInsights
            bookings={bookings}
            horizon={{ start: horizon.start, end: horizon.end, totalMs: horizon.totalMs }}
            loading={loading}
            embedded
            onCreateBooking={onCreateBooking}
          />
        </>
      )}
    </section>
  );
}

function DayHeaderRow({ horizon }: { horizon: TimelineHorizon }) {
  const step = horizon.dayCount <= 14 ? 1 : horizon.dayCount <= 30 ? 2 : 7;
  return (
    <div
      className="grid border-b border-border/60 bg-muted/25"
      style={{ gridTemplateColumns: `repeat(${horizon.dayCount}, minmax(0, 1fr))` }}
    >
      {horizon.columns.map((col, idx) => {
        const show = idx % step === 0 || col.isToday || idx === horizon.columns.length - 1;
        return (
          <div
            key={`${col.sub}-${idx}`}
            className={`px-0.5 py-2 text-center ${idx < horizon.columns.length - 1 ? 'border-r border-border/30' : ''} ${col.isToday ? 'bg-[color:var(--brand-soft)]/40' : ''}`}
          >
            {show ? (
              <>
                <p className="text-[9px] font-semibold tracking-[0.04em] text-muted-foreground truncate">
                  {col.label}
                </p>
                {horizon.dayCount <= 14 && (
                  <p className="text-[9px] tabular-nums text-muted-foreground/80 mt-0.5">{col.sub}</p>
                )}
              </>
            ) : (
              <span className="inline-block w-1 h-1 rounded-full bg-border/80 mt-2" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayGridColumns({ horizon }: { horizon: TimelineHorizon }) {
  return (
    <div
      className="absolute inset-0 grid pointer-events-none"
      style={{ gridTemplateColumns: `repeat(${horizon.dayCount}, minmax(0, 1fr))` }}
    >
      {horizon.columns.map((col, idx) => (
        <div
          key={idx}
          className={`${idx < horizon.columns.length - 1 ? 'border-r border-dashed border-border/25' : ''} ${col.isToday ? 'bg-[color:var(--brand-soft)]/15' : ''}`}
        />
      ))}
    </div>
  );
}

function FreeSlotPill({ slot, top }: { slot: { leftPct: number; widthPct: number; label: string }; top: number }) {
  if (slot.widthPct < 3) return null;
  return (
    <div
      className="absolute flex items-center justify-center pointer-events-none"
      style={{ left: `${slot.leftPct}%`, width: `${slot.widthPct}%`, top, bottom: 8 }}
      aria-hidden
    >
      <span className="truncate max-w-full px-1.5 py-0.5 rounded-md text-[9px] font-medium text-muted-foreground/70 bg-muted/30 border border-dashed border-border/50">
        Frei · {slot.label}
      </span>
    </div>
  );
}

function TimelineBookingBar({
  booking,
  laneHeight,
  laneGap,
  compact,
  hasConflict,
  onSelectBooking,
}: {
  booking: ReturnType<typeof positionAndPackTimelineBookings>['items'][number];
  laneHeight: number;
  laneGap: number;
  compact: boolean;
  hasConflict?: boolean;
  onSelectBooking?: (bookingId: string) => void;
}) {
  const icon = bookingStatusIcon(booking.status);
  const ref = booking.id ? bookingRef(booking.id) : 'Buchung';
  const aria = `${ref} · ${bookingStatusAriaLabel(booking.status, booking.customerName)} · ${formatTooltipRange(booking.startDate, booking.endDate)} · Abholung ${booking.pickupLocation} · Rückgabe ${booking.returnLocation}`;
  const clickable = Boolean(onSelectBooking && booking.id);
  const top = 8 + booking.lane * (laneHeight + laneGap);
  const showText = booking.widthPct > (compact ? 8 : 5);

  const barClass = [
    bookingTimelineBarClass(booking.status),
    bookingTimelineBarEmphasisClass(booking.status, booking.isOverdue),
    hasConflict ? 'ring-1 ring-[color:var(--status-attention)]/40' : '',
    'absolute flex items-center gap-1 overflow-hidden text-[10px] font-semibold transition-[box-shadow,transform,filter] duration-[var(--dur-fast)]',
    clickable
      ? `cursor-pointer hover:brightness-[1.04] hover:-translate-y-px hover:shadow-[var(--shadow-sm)] sq-press ${vb.focusRing}`
      : '',
    booking.clippedLeft ? 'rounded-l-md' : 'rounded-l-lg',
    booking.clippedRight ? 'rounded-r-md' : 'rounded-r-lg',
  ].join(' ');

  const content = (
    <>
      {!booking.clippedLeft && (
        <span
          className="absolute left-0 top-0 bottom-0 w-1 bg-[color:var(--status-positive)] rounded-l-[inherit]"
          title={`Pickup · ${booking.pickupLocation}`}
          aria-hidden
        />
      )}
      {!booking.clippedRight && (
        <span
          className="absolute right-0 top-0 bottom-0 w-1 bg-[color:var(--status-attention)] rounded-r-[inherit]"
          title={`Return · ${booking.returnLocation}`}
          aria-hidden
        />
      )}
      <Icon name={icon} className="w-3 h-3 shrink-0 ml-1.5" aria-hidden />
      {showText ? (
        <span className="truncate pr-2 pl-0.5">
          <span className="font-mono text-[9px] opacity-80 mr-1">{ref}</span>
          {booking.customerName}
        </span>
      ) : (
        <span className="sr-only">{aria}</span>
      )}
      {!showText && (
        <span className="font-mono text-[9px] truncate pr-1.5 pl-0.5" aria-hidden>
          {ref}
        </span>
      )}
    </>
  );

  const style = {
    left: `${booking.leftPct}%`,
    width: `${booking.widthPct}%`,
    minWidth: '28px',
    top,
    height: laneHeight,
  };

  if (clickable) {
    return (
      <button
        type="button"
        className={barClass}
        style={style}
        aria-label={aria}
        title={`${bookingStatusLabel(booking.status)} · ${booking.customerName}\n${formatTooltipRange(booking.startDate, booking.endDate)}\n↑ ${booking.pickupLocation} → ${booking.returnLocation}`}
        onClick={() => onSelectBooking!(booking.id)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={barClass} style={style} role="img" aria-label={aria} title={aria}>
      {content}
    </div>
  );
}

function MobileBookingCard({
  booking,
  hasConflict,
  onSelectBooking,
}: {
  booking: ReturnType<typeof positionAndPackTimelineBookings>['items'][number];
  hasConflict?: boolean;
  onSelectBooking?: (bookingId: string) => void;
}) {
  const ref = booking.id ? bookingRef(booking.id) : '—';
  const clickable = Boolean(onSelectBooking && booking.id);

  if (!clickable) {
    return (
      <div className={`${vb.inset} p-3`} aria-label={bookingStatusAriaLabel(booking.status, booking.customerName)}>
        <MobileBookingCardContent booking={booking} refLabel={ref} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`w-full text-left ${vb.inset} p-3 transition-colors duration-[var(--dur-fast)] hover:bg-muted/25 ${vb.focusRing} ${
        hasConflict ? 'ring-1 ring-[color:var(--status-attention)]/35' : ''
      }`}
      onClick={() => onSelectBooking!(booking.id)}
      aria-label={bookingStatusAriaLabel(booking.status, booking.customerName)}
    >
      <MobileBookingCardContent booking={booking} refLabel={ref} />
    </button>
  );
}

function MobileBookingCardContent({
  booking,
  refLabel,
}: {
  booking: ReturnType<typeof positionAndPackTimelineBookings>['items'][number];
  refLabel: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold truncate">{booking.customerName}</p>
          <p className={`${vb.meta} font-mono`}>{refLabel}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${chipClassForTone(bookingStatusTone(booking.status))}`}
        >
          <Icon name={bookingStatusIcon(booking.status)} className="w-3 h-3" aria-hidden />
          {bookingStatusLabel(booking.status)}
        </span>
      </div>
      <p className={`${vb.meta} mt-1`}>
        {formatTooltipRange(booking.startDate, booking.endDate)}
      </p>
    </>
  );
}

function TimelineLegend() {
  const items: BookingUiStatus[] = ['active', 'confirmed', 'pending', 'completed', 'no_show', 'cancelled'];
  return (
    <div className="hidden sm:flex flex-wrap gap-1.5" aria-label="Legende">
      {items.map((status) => (
        <span
          key={status}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${chipClassForTone(bookingStatusTone(status))}`}
        >
          <Icon name={bookingStatusIcon(status)} className="w-3 h-3" aria-hidden />
          {bookingStatusLabel(status)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium sq-tone-neutral">
        <span className="w-2 h-2 rounded-sm bg-[color:var(--status-positive)]" aria-hidden />
        Pickup
      </span>
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium sq-tone-neutral">
        <span className="w-2 h-2 rounded-sm bg-[color:var(--status-attention)]" aria-hidden />
        Return
      </span>
    </div>
  );
}

function TimelineEmptyState({ onCreateBooking }: { onCreateBooking?: () => void }) {
  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center px-5 py-10 text-center">
      <div className="sq-tone-neutral w-10 h-10 rounded-xl flex items-center justify-center mb-3">
        <Icon name="calendar" className="w-5 h-5" aria-hidden />
      </div>
      <p className="text-[13px] font-semibold text-foreground">Zeitraum ohne Buchungen</p>
      <p className={`${vb.subtitle} mt-1 max-w-[320px]`}>
        Das Fahrzeug ist im gewählten Horizont frei verfügbar.
      </p>
      {onCreateBooking && (
        <button type="button" onClick={onCreateBooking} className={`sq-cta mt-4 ${vbActionClass(true)}`}>
          <Icon name="plus" className="w-3.5 h-3.5" aria-hidden />
          Neue Buchung anlegen
        </button>
      )}
    </div>
  );
}

function formatTooltipRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}
