import { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui/Icon';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import type { VehicleData } from '../data/vehicles';

interface VehicleBookingsViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
  vehicleName?: string;
}

type BookingStatus = 'active' | 'upcoming' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  customerName: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  pickupLocation: string;
  returnLocation: string;
  totalPrice: number | null;
  days: number;
}

interface PositionedBooking extends Booking {
  leftPct: number;
  widthPct: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

const MS_DAY = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 14;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeStatus(raw: unknown, start: Date, end: Date): BookingStatus {
  const enumRaw = String((raw as { statusEnum?: string })?.statusEnum ?? '').toUpperCase();
  if (enumRaw === 'NO_SHOW') return 'cancelled';
  const status = String(raw ?? '').toLowerCase();
  if (status.includes('no_show') || status.includes('no show')) return 'cancelled';
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('complete') || status.includes('done') || status.includes('closed')) return 'completed';
  const now = Date.now();
  if (now >= start.getTime() && now <= end.getTime()) return 'active';
  if (start.getTime() > now) return 'upcoming';
  return 'completed';
}

function formatDateTime(date: Date) {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
    ' · ' +
    date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildBooking(raw: any): Booking | null {
  const start = parseDate(raw?.startDate ?? raw?.pickupAt ?? raw?.startAt);
  const end = parseDate(raw?.endDate ?? raw?.returnAt ?? raw?.endAt);
  if (!start || !end) return null;
  const status = normalizeStatus(raw?.status, start, end);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_DAY));
  return {
    id: String(raw?.id ?? ''),
    customerName: String(raw?.customerName ?? raw?.customer ?? raw?.customer?.name ?? 'Unbekannter Kunde'),
    status,
    startDate: start,
    endDate: end,
    pickupLocation: String(raw?.pickupLocation ?? raw?.pickupStationName ?? raw?.pickupStation?.name ?? 'Pickup offen'),
    returnLocation: String(raw?.returnLocation ?? raw?.returnStationName ?? raw?.returnStation?.name ?? 'Return offen'),
    totalPrice: numberValue(raw?.totalPrice ?? raw?.totalAmount ?? raw?.priceTotal ?? raw?.revenue),
    days,
  };
}

function statusTone(status: BookingStatus) {
  if (status === 'active') return { label: 'Aktiv', tone: 'warning' as const, icon: 'clock' };
  if (status === 'upcoming') return { label: 'Geplant', tone: 'success' as const, icon: 'calendar' };
  if (status === 'completed') return { label: 'Abgeschlossen', tone: 'neutral' as const, icon: 'check-circle-2' };
  return { label: 'Storniert', tone: 'critical' as const, icon: 'x-circle' };
}

function toneClass(tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral') {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

export function VehicleBookingsView({ vehicle, vehicleName }: VehicleBookingsViewProps) {
  const { orgId } = useRentalOrg();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!orgId || !vehicle?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    api.bookings
      .list(orgId)
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        setRows(Array.isArray(arr) ? arr : []);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setErrored(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgId, vehicle?.id]);

  const bookings = useMemo(() => {
    const vehicleId = vehicle?.id;
    if (!vehicleId) return [];
    return rows
      .filter((row) => String(row?.vehicleId ?? row?._raw?.vehicleId ?? '') === vehicleId)
      .map(buildBooking)
      .filter((b): b is Booking => !!b)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [rows, vehicle?.id]);

  const horizon = useMemo(() => {
    const start = startOfDay(new Date());
    const end = endOfDay(addDays(start, HORIZON_DAYS - 1));
    const columns = Array.from({ length: HORIZON_DAYS }, (_, idx) => {
      const day = addDays(start, idx);
      return {
        label: day.toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase(),
        sub: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      };
    });
    return { start, end, totalMs: end.getTime() - start.getTime(), columns };
  }, []);

  const positionedBookings = useMemo<PositionedBooking[]>(() => {
    const startMs = horizon.start.getTime();
    const endMs = horizon.end.getTime();
    return bookings
      .filter((booking) => booking.status !== 'cancelled')
      .filter((booking) => booking.endDate.getTime() >= startMs && booking.startDate.getTime() <= endMs)
      .map((booking) => {
        const rawStart = booking.startDate.getTime();
        const rawEnd = booking.endDate.getTime();
        const clampedStart = Math.max(rawStart, startMs);
        const clampedEnd = Math.min(rawEnd, endMs);
        const leftPct = ((clampedStart - startMs) / horizon.totalMs) * 100;
        const widthPct = Math.max(2, ((clampedEnd - clampedStart) / horizon.totalMs) * 100);
        return {
          ...booking,
          leftPct,
          widthPct,
          clippedLeft: rawStart < startMs,
          clippedRight: rawEnd > endMs,
        };
      });
  }, [bookings, horizon]);

  const activeCount = bookings.filter((b) => b.status === 'active').length;
  const upcomingCount = bookings.filter((b) => b.status === 'upcoming').length;
  const revenue = bookings.reduce((sum, b) => sum + (b.totalPrice ?? 0), 0);
  const vehicleLabel = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.license
    : vehicleName || 'Fahrzeug';
  const nextBooking = bookings.find((b) => b.status === 'active') ?? bookings.find((b) => b.status === 'upcoming') ?? null;

  return (
    <div className="space-y-5">
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="sq-tone-info w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="calendar" className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold tracking-[-0.003em] text-foreground">Fahrzeug-Schedule</h3>
              <p className="text-[11px] mt-0.5 text-muted-foreground truncate">{vehicleLabel}</p>
              <p className="text-[10px] mt-1 text-muted-foreground">
                {nextBooking
                  ? `${statusTone(nextBooking.status).label}: ${nextBooking.customerName} · ${formatDateTime(nextBooking.startDate)}`
                  : 'Keine aktive oder kommende Buchung im direkten Fahrzeugplan.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 w-full sm:w-auto sm:min-w-[420px]">
            <ScheduleMetric label="Total" value={String(bookings.length)} tone="neutral" />
            <ScheduleMetric label="Aktiv" value={String(activeCount)} tone={activeCount > 0 ? 'warning' : 'neutral'} />
            <ScheduleMetric label="Geplant" value={String(upcomingCount)} tone={upcomingCount > 0 ? 'success' : 'neutral'} />
            <ScheduleMetric label="Umsatz" value={formatCurrency(revenue)} tone="brand" />
          </div>
        </div>
      </div>

      <div className="sq-card rounded-2xl overflow-hidden shadow-[var(--shadow-1)]">
        <div className="p-4 pb-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="sq-tone-brand w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                <Icon name="calendar-clock" className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">14-Tage Fahrplan</h4>
                <p className="text-[10px] text-muted-foreground">Wie die Dashboard Schedule Box, aber auf dieses Fahrzeug fokussiert.</p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral">
              {positionedBookings.length} im Horizont
            </span>
          </div>
        </div>

        {loading ? (
          <div className="min-h-[240px] flex items-center justify-center">
            <Icon name="loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : errored ? (
          <EmptySchedule title="Schedule konnte nicht geladen werden" subtitle="Die Buchungen erscheinen wieder, sobald die Anfrage erfolgreich ist." tone="critical" />
        ) : !vehicle?.id ? (
          <EmptySchedule title="Kein Fahrzeug ausgewählt" subtitle="Wähle ein Fahrzeug aus, um dessen Buchungsplan zu sehen." tone="neutral" />
        ) : positionedBookings.length === 0 ? (
          <EmptySchedule title="Keine Buchungen im 14-Tage-Horizont" subtitle="Dieses Fahrzeug hat aktuell keine aktive oder geplante Reservierung in der Timeline." tone="info" />
        ) : (
          <div className="p-4 pt-3">
            <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
              <div className="grid border-b border-border/60" style={{ gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(0, 1fr))` }}>
                {horizon.columns.map((col, idx) => (
                  <div key={`${col.sub}-${idx}`} className={`px-1 py-2 text-center ${idx < horizon.columns.length - 1 ? 'border-r border-border/40' : ''}`}>
                    <p className="text-[9px] font-semibold tracking-[0.06em] text-muted-foreground">{col.label}</p>
                    <p className="text-[9px] tabular-nums text-muted-foreground/80 mt-0.5">{col.sub}</p>
                  </div>
                ))}
              </div>
              <div className="relative h-20">
                <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${HORIZON_DAYS}, minmax(0, 1fr))` }}>
                  {horizon.columns.map((_, idx) => (
                    <div key={idx} className={idx < horizon.columns.length - 1 ? 'border-r border-dashed border-border/30' : ''} />
                  ))}
                </div>
                {positionedBookings.map((booking, idx) => {
                  const cfg = statusTone(booking.status);
                  const top = 12 + (idx % 2) * 30;
                  return (
                    <div
                      key={booking.id || idx}
                      title={`${booking.customerName} · ${formatDateTime(booking.startDate)} – ${formatDateTime(booking.endDate)}`}
                      className={`absolute h-6 rounded-full border px-2 flex items-center gap-1.5 overflow-hidden text-[10px] font-semibold ${toneClass(cfg.tone)} ${booking.clippedLeft ? 'rounded-l-none' : ''} ${booking.clippedRight ? 'rounded-r-none' : ''}`}
                      style={{ left: `${booking.leftPct}%`, width: `${booking.widthPct}%`, minWidth: '10px', top }}
                    >
                      <Icon name={cfg.icon} className="w-3 h-3 shrink-0" />
                      <span className="truncate">{booking.customerName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Buchungsagenda</h4>
            <p className="text-[10px] text-muted-foreground">Aktive und kommende Vorgänge zuerst, Historie darunter.</p>
          </div>
        </div>

        {bookings.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 py-10 px-4 text-center">
            <div className="sq-tone-info w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Icon name="calendar" className="w-5 h-5" />
            </div>
            <p className="text-[12px] font-semibold text-foreground">Keine Buchungen für dieses Fahrzeug</p>
            <p className="text-[10px] text-muted-foreground mt-1">Sobald eine Buchung angelegt wird, erscheint sie hier als Agenda-Eintrag.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.slice(0, 12).map((booking) => (
              <BookingAgendaItem key={booking.id || `${booking.customerName}-${booking.startDate.toISOString()}`} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleMetric({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'success' | 'warning' | 'neutral' }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${toneClass(tone)}`}>
      <p className="text-[15px] leading-none font-bold tabular-nums truncate">{value}</p>
      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">{label}</p>
    </div>
  );
}

function EmptySchedule({ title, subtitle, tone }: { title: string; subtitle: string; tone: 'info' | 'critical' | 'neutral' }) {
  return (
    <div className="min-h-[240px] flex flex-col items-center justify-center px-4 text-center">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${toneClass(tone)}`}>
        <Icon name={tone === 'critical' ? 'alert-circle' : 'calendar'} className="w-5 h-5" />
      </div>
      <p className="text-[12px] font-semibold text-foreground">{title}</p>
      <p className="text-[10px] text-muted-foreground mt-1 max-w-[320px]">{subtitle}</p>
    </div>
  );
}

function BookingAgendaItem({ booking }: { booking: Booking }) {
  const cfg = statusTone(booking.status);
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(cfg.tone)}`}>
            <Icon name={cfg.icon} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[12px] font-semibold text-foreground truncate">{booking.customerName}</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${toneClass(cfg.tone)}`}>{cfg.label}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" className="w-3 h-3" />
                {formatDateTime(booking.startDate)} – {formatDateTime(booking.endDate)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="map-pin" className="w-3 h-3" />
                {booking.pickupLocation} → {booking.returnLocation}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-semibold tabular-nums text-foreground">{formatCurrency(booking.totalPrice)}</p>
          <p className="text-[9px] text-muted-foreground">{booking.days} {booking.days === 1 ? 'Tag' : 'Tage'}</p>
        </div>
      </div>
    </div>
  );
}
