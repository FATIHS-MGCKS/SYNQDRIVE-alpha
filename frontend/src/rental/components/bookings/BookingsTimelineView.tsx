import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BookingUiRow } from '../../lib/entityMappers';
import type { VehicleData } from '../../data/vehicles';
import { BookingStatusBadge, bookingTimelineSolidBarClass, type BookingUiStatus } from './bookingStatus';
import { bookingEndIso, bookingRef, bookingStartIso, parseIso, rowStatus } from './bookingUtils';

const MS_DAY = 86_400_000;

function vehicleLabel(v: VehicleData): string {
  const head = [v.make, v.model].filter(Boolean).join(' ').trim();
  return head || v.model;
}

interface BookingsTimelineViewProps {
  vehicles: VehicleData[];
  bookings: BookingUiRow[];
  rangeStart: Date;
  rangeEnd: Date;
  onSelectBooking: (id: string) => void;
}

export function BookingsTimelineView({
  vehicles,
  bookings,
  rangeStart,
  rangeEnd,
  onSelectBooking,
}: BookingsTimelineViewProps) {
  const { t, locale } = useLanguage();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const totalMs = Math.max(MS_DAY, rangeEnd.getTime() - rangeStart.getTime());
  const dayMarkers = useMemo(() => {
    const out: { left: number; label: string }[] = [];
    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= rangeEnd) {
      const left = ((cursor.getTime() - rangeStart.getTime()) / totalMs) * 100;
      out.push({
        left,
        label: cursor.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [rangeStart, rangeEnd, totalMs, locale]);

  const nowLeft = useMemo(() => {
    const now = Date.now();
    if (now < rangeStart.getTime() || now > rangeEnd.getTime()) return null;
    return ((now - rangeStart.getTime()) / totalMs) * 100;
  }, [rangeStart, rangeEnd, totalMs]);

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

  const agendaRows = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const sa = parseIso(bookingStartIso(a))?.getTime() ?? 0;
      const sb = parseIso(bookingStartIso(b))?.getTime() ?? 0;
      return sa - sb;
    });
  }, [bookings]);

  if (vehicles.length === 0) {
    return (
      <p className="text-xs text-muted-foreground p-6 text-center">
        {t('bookings.planner.noVehicles')}
      </p>
    );
  }

  if (narrow) {
    return (
      <div className="surface-premium rounded-2xl shadow-[var(--shadow-1)] divide-y divide-border/40">
        {agendaRows.length === 0 ? (
          <p className="text-xs text-muted-foreground p-6 text-center">{t('bookings.planner.emptyTimeline')}</p>
        ) : (
          agendaRows.map((booking) => {
            const start = parseIso(bookingStartIso(booking));
            const end = parseIso(bookingEndIso(booking));
            const vehicle = vehicles.find((v) => v.id === booking.vehicleId);
            const status = rowStatus(booking);
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => onSelectBooking(booking.id)}
                className="w-full text-left px-3 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate">
                      {bookingRef(booking.id)} · {booking.customer}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {vehicle ? vehicleLabel(vehicle) : booking.vehicle} · {vehicle?.license ?? booking.plate}
                    </p>
                    {start && end && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {start.toLocaleDateString(locale)} – {end.toLocaleDateString(locale)}
                      </p>
                    )}
                  </div>
                  <BookingStatusBadge status={status} />
                </div>
              </button>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="surface-premium rounded-2xl shadow-[var(--shadow-1)] overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-0 sm:min-w-[640px] lg:min-w-[900px]">
          <div className="grid grid-cols-[200px_1fr] border-b border-border/60 bg-muted/30">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
              {t('bookings.vehicle')}
            </div>
            <div className="relative h-8 border-l border-border/40">
              {dayMarkers.map((m) => (
                <span
                  key={m.label + m.left}
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
              <div key={vehicle.id} className="grid grid-cols-[200px_1fr] border-b border-border/40 min-h-[52px]">
                <div className="px-3 py-2 sticky left-0 surface-premium z-10 border-r border-border/40">
                  <p className="text-[11px] font-semibold text-foreground truncate">{vehicleLabel(vehicle)}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{vehicle.license}</p>
                </div>
                <div className="relative py-2 pr-2">
                  {nowLeft != null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-[color:var(--status-critical)] z-20"
                      style={{ left: `${nowLeft}%` }}
                    />
                  )}
                  {rows.map((booking) => {
                    const start = parseIso(bookingStartIso(booking));
                    const end = parseIso(bookingEndIso(booking));
                    if (!start || !end) return null;
                    const clipStart = Math.max(start.getTime(), rangeStart.getTime());
                    const clipEnd = Math.min(end.getTime(), rangeEnd.getTime());
                    if (clipEnd <= clipStart) return null;
                    const left = ((clipStart - rangeStart.getTime()) / totalMs) * 100;
                    const width = Math.max(1.5, ((clipEnd - clipStart) / totalMs) * 100);
                    const status = rowStatus(booking);
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => onSelectBooking(booking.id)}
                        className={`absolute top-2 h-7 rounded-md px-1.5 text-[9px] font-semibold text-white truncate shadow-sm hover:opacity-90 ${bookingTimelineSolidBarClass(status)}`}
                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '48px' }}
                        title={`${bookingRef(booking.id)} · ${booking.customer}`}
                      >
                        {bookingRef(booking.id)}
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
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--brand)]" /> {t('bookings.active')}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--status-attention)]" /> {t('bookings.confirmed')}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {t('bookings.planner.pending')}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--status-success)]" /> {t('bookings.completed')}</span>
      </div>
    </div>
  );
}
