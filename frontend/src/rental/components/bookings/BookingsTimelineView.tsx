import { useCallback, useMemo } from 'react';
import type { BookingUiRow } from '../../lib/entityMappers';
import type { VehicleData } from '../../data/vehicles';
import {
  DEFAULT_ORG_TIMEZONE,
  iterHalfOpenZonedDays,
} from '../../../lib/datetime';
import { clipBookingToHalfOpenWindow } from './bookingPlannerOverlap';
import { bookingTimelineSolidBarClass } from './bookingStatus';
import { bookingEndIso, bookingRef, bookingStartIso, parseIso, rowStatus } from './bookingUtils';
import { BOOKING_FOCUS_RING, bookingChipAriaLabel, bookingPlannerNavButtonClass } from './bookings-a11y';

function vehicleLabel(v: VehicleData): string {
  const head = [v.make, v.model].filter(Boolean).join(' ').trim();
  return head || v.model;
}

interface BookingsTimelineViewProps {
  vehicles: VehicleData[];
  bookings: BookingUiRow[];
  rangeStart: Date;
  rangeEnd: Date;
  timeZone?: string;
  locale?: string;
  rangeLabel?: string;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  onSelectBooking: (id: string) => void;
}

export function BookingsTimelineView({
  vehicles,
  bookings,
  rangeStart,
  rangeEnd,
  timeZone = DEFAULT_ORG_TIMEZONE,
  locale = 'de-DE',
  rangeLabel,
  onNavigatePrev,
  onNavigateNext,
  onSelectBooking,
}: BookingsTimelineViewProps) {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const totalMs = Math.max(1, rangeEndMs - rangeStartMs);

  const dayMarkers = useMemo(() => {
    const days = iterHalfOpenZonedDays(rangeStart.toISOString(), rangeEnd.toISOString(), timeZone);
    return days.map((day) => ({
      left: ((day.start.getTime() - rangeStartMs) / totalMs) * 100,
      label: day.start.toLocaleDateString(locale, {
        timeZone,
        day: '2-digit',
        month: '2-digit',
      }),
    }));
  }, [rangeStart, rangeEnd, rangeStartMs, totalMs, timeZone, locale]);

  const nowLeft = useMemo(() => {
    const now = Date.now();
    if (now < rangeStartMs || now >= rangeEndMs) return null;
    return ((now - rangeStartMs) / totalMs) * 100;
  }, [rangeStartMs, rangeEndMs, totalMs]);

  const byVehicle = useMemo(() => {
    const map = new Map<string, BookingUiRow[]>();
    for (const b of bookings) {
      if (!b.vehicleId) continue;
      const list = map.get(b.vehicleId) ?? [];
      list.push(b);
      map.set(b.vehicleId, list);
    }
    return map;
  }, [bookings]);

  const handleHeaderKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onNavigatePrev?.();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNavigateNext?.();
      }
    },
    [onNavigatePrev, onNavigateNext],
  );

  if (vehicles.length === 0) {
    return (
      <p className="text-xs text-muted-foreground p-6 text-center">
        Keine Fahrzeuge in der Flotte — Timeline benötigt Fahrzeugdaten.
      </p>
    );
  }

  return (
    <div className="surface-premium rounded-2xl shadow-[var(--shadow-1)] overflow-hidden">
      {(rangeLabel || onNavigatePrev || onNavigateNext) && (
        <div
          className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/60"
          tabIndex={onNavigatePrev || onNavigateNext ? 0 : undefined}
          onKeyDown={handleHeaderKeyDown}
          aria-label="Zeitraum Navigation"
        >
          <div className="flex gap-1" role="group" aria-label="Zeitraum wechseln">
            {onNavigatePrev && (
              <button type="button" className={bookingPlannerNavButtonClass()} aria-label="Vorheriger Zeitraum" onClick={onNavigatePrev}>
                ‹
              </button>
            )}
            {onNavigateNext && (
              <button type="button" className={bookingPlannerNavButtonClass()} aria-label="Nächster Zeitraum" onClick={onNavigateNext}>
                ›
              </button>
            )}
          </div>
          {rangeLabel && <p className="text-[11px] font-semibold text-foreground">{rangeLabel}</p>}
        </div>
      )}
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <div className="min-w-[900px] isolate">
          <div className="grid grid-cols-[200px_1fr] border-b border-border/60 bg-muted/30">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground sticky left-0 z-20 surface-premium border-r border-border/40">
              Fahrzeug
            </div>
            <div className="relative h-8 border-l border-border/40">
              {dayMarkers.map((m, index) => (
                <span
                  key={`${m.label}-${index}`}
                  className="absolute top-1 text-[9px] text-muted-foreground -translate-x-1/2"
                  style={{ left: `${m.left}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {vehicles.map((vehicle) => {
            const rows = byVehicle.get(vehicle.id) ?? [];
            return (
              <div key={vehicle.id} className="grid grid-cols-[200px_1fr] border-b border-border/40 min-h-[56px] sm:min-h-[52px]">
                <div className="px-3 py-2 sticky left-0 z-20 surface-premium border-r border-border/40">
                  <p className="text-[11px] font-semibold text-foreground truncate">{vehicleLabel(vehicle)}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{vehicle.license}</p>
                </div>
                <div className="relative py-2 pr-2 min-h-[56px] sm:min-h-[52px]">
                  {nowLeft != null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[color:var(--status-critical)] z-20 pointer-events-none"
                      style={{ left: `${nowLeft}%` }}
                      aria-hidden
                    />
                  )}
                  {rows.map((booking) => {
                    const start = parseIso(bookingStartIso(booking));
                    const end = parseIso(bookingEndIso(booking));
                    if (!start || !end) return null;
                    const clip = clipBookingToHalfOpenWindow(start, end, rangeStart, rangeEnd);
                    if (!clip) return null;
                    const left = ((clip.clipStart - rangeStartMs) / totalMs) * 100;
                    const width = Math.max(1.5, ((clip.clipEnd - clip.clipStart) / totalMs) * 100);
                    const status = rowStatus(booking);
                    const ref = bookingRef(booking.id);
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onSelectBooking(booking.id)}
                        aria-label={bookingChipAriaLabel(ref, booking.customer)}
                        className={`absolute top-1.5 sm:top-2 min-h-11 sm:min-h-7 h-11 sm:h-7 rounded-md px-1.5 text-[9px] font-semibold text-white truncate shadow-sm hover:opacity-90 ${BOOKING_FOCUS_RING} focus-visible:ring-white/80 ${bookingTimelineSolidBarClass(status)}`}
                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '48px' }}
                      >
                        {ref}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-3 border-t border-border/40 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--brand)]" /> Aktiv</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--status-attention)]" /> Bestätigt</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Ausstehend</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--status-success)]" /> Abgeschlossen</span>
      </div>
    </div>
  );
}
