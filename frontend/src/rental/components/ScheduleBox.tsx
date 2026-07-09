
import { Icon } from './ui/Icon';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useFleetVehicles } from '../FleetContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';

// V4.6.94 — `Schedule` widget for the dashboard. A compact Gantt-style
// timeline that lives next to "Today's Activity" and answers a single
// question for the dispatcher: which cars are out, and for how long, in
// the immediate horizon? Range can be flipped between Day (next 7 days),
// Week (next 4 weeks) and Month (next 4 months); inside each range every
// non-cancelled booking is rendered as an absolutely-positioned pill on
// the vehicle's row. Active rentals get the warning tone, future ones get
// the success tone — same pair the rest of the dashboard already uses.
//
// Implementation notes:
//   * Bookings come from `api.bookings.list(orgId)` (paginated). We only
//     hit the API once per org, then filter/recompute locally when the
//     viewMode flips, so switching tabs is instant.
//   * Pills are positioned via `left% / width%` against the visible range
//     so the layout stays resolution-independent (no canvas / no chart
//     library), and pills that extend past the range are clipped at the
//     edges with a small fade so the user knows there's more.
//   * `now` is rendered as a thin vertical line plus a small dot so the
//     "where are we today" reference is visually obvious — directly
//     mirroring the inspiration screenshot the design references.

type ViewMode = 'day' | 'week' | 'month';

interface ScheduleBookingApi {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleLicense: string;
  customerName: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface ScheduleRow {
  vehicleId: string;
  vehicleName: string;
  vehicleLicense: string;
  bookings: ScheduleBookingPositioned[];
}

interface ScheduleBookingPositioned {
  id: string;
  customerName: string;
  status: string;
  leftPct: number;
  widthPct: number;
  isActive: boolean;
  clippedLeft: boolean;
  clippedRight: boolean;
}

interface ScheduleBoxProps {
  isDarkMode: boolean;
  onOpenBookingById?: (bookingId: string) => void;
  /**
   * V4.6.95 — Active station filter from the dashboard's station picker.
   * `null`/`undefined` ⇒ no filter („All Stations"). When set, the lane
   * chart drops every row whose vehicle is not assigned to that station,
   * so the dispatcher only sees bookings relevant to the selected site.
   */
  stationFilter?: string | null;
}

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const MS_DAY = 24 * 60 * 60 * 1000;

// V4.6.96 — vehicle label column width. Trimmed from 140px → 116px so the
// Week/Month timelines (which only get `1fr` of a ~272px-wide narrow card)
// have ~22px more horizontal room for booking pills to actually be legible.
const LABEL_COL_W = 116;

/**
 * V4.6.96 — Decide what to render inside a booking pill based on the visible
 * width (in % of the timeline) and the active view mode. Customer names like
 * "Yeter Serin" simply do not fit inside a 4–8% wide pill in Week / Month
 * mode — instead of clipping them to a single character we step down through
 * "first name" → "initials" → "no text, just a colored bar". The icon is
 * dropped first because it eats ~16px of horizontal space (icon + gap).
 */
function buildPillContent(name: string, mode: ViewMode, widthPct: number): { label: string; showIcon: boolean } {
  const cleaned = (name || '').trim();
  const parts = cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
  const first = parts[0] ?? '';
  const initials = parts.slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()
    || cleaned.slice(0, 2).toUpperCase();

  // Below ~4% the pill is a tiny bar — no text, no icon, just a colored sliver
  // so the dispatcher can still see "there is a booking here". They can hover
  // for the title tooltip with the full customer name + status.
  if (widthPct < 4) return { label: '', showIcon: false };
  if (widthPct < 8) return { label: initials, showIcon: false };
  if (widthPct < 16) return { label: mode === 'day' ? first : initials, showIcon: true };
  if (mode === 'day') return { label: cleaned || initials, showIcon: true };
  if (mode === 'week') return { label: first || initials, showIcon: true };
  // Month view: only show the full first name once we have plenty of room.
  return { label: widthPct >= 24 ? (first || initials) : initials, showIcon: true };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfIsoWeek(d: Date): Date {
  const day = d.getDay();
  // Convert Sun(0) → 6 days back; Mon(1) → 0; Tue(2) → 1; …
  const offset = (day + 6) % 7;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

interface RangeColumn {
  label: string;
  sub: string | null;
  startMs: number;
  endMs: number;
}

interface RangeDef {
  startMs: number;
  endMs: number;
  totalMs: number;
  columns: RangeColumn[];
}

function buildRange(mode: ViewMode, locale: string): RangeDef {
  const now = new Date();
  if (mode === 'day') {
    // 7 days starting today, columns = each weekday.
    const start = startOfDay(now);
    const end = endOfDay(addDays(start, 6));
    const cols: RangeColumn[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      cols.push({
        label: d.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase(),
        sub: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
        startMs: startOfDay(d).getTime(),
        endMs: endOfDay(d).getTime(),
      });
    }
    return { startMs: start.getTime(), endMs: end.getTime(), totalMs: end.getTime() - start.getTime(), columns: cols };
  }
  if (mode === 'week') {
    // 4 weeks starting current ISO week's Monday.
    const start = startOfIsoWeek(now);
    const end = endOfDay(addDays(start, 27));
    const cols: RangeColumn[] = [];
    for (let i = 0; i < 4; i++) {
      const wkStart = addDays(start, i * 7);
      const wkEnd = endOfDay(addDays(wkStart, 6));
      // V4.6.96 — header now reads "WK 1" on top with the concrete start date
      // (e.g. "21 Apr") underneath, so the dispatcher can locate the week on
      // the calendar without having to translate "WK 2" into a real date.
      cols.push({
        label: `WK ${i + 1}`,
        sub: wkStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        startMs: wkStart.getTime(),
        endMs: wkEnd.getTime(),
      });
    }
    return { startMs: start.getTime(), endMs: end.getTime(), totalMs: end.getTime() - start.getTime(), columns: cols };
  }
  // 4 months starting current month's first day.
  const start = startOfMonth(now);
  const end = new Date(addMonths(start, 4).getTime() - 1);
  const cols: RangeColumn[] = [];
  for (let i = 0; i < 4; i++) {
    const m = addMonths(start, i);
    const next = addMonths(m, 1);
    cols.push({
      label: m.toLocaleDateString(locale, { month: 'short', year: '2-digit' }).toUpperCase(),
      sub: null,
      startMs: m.getTime(),
      endMs: next.getTime() - 1,
    });
  }
  return { startMs: start.getTime(), endMs: end.getTime(), totalMs: end.getTime() - start.getTime(), columns: cols };
}

function clampPositive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

export function ScheduleBox({ isDarkMode: _isDarkMode, onOpenBookingById, stationFilter }: ScheduleBoxProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const { locale } = useLanguage();
  // V4.6.95 — When the dashboard's station picker has an active selection,
  // build a Set of vehicle IDs assigned to that station so the per-booking
  // loop below can drop any booking whose vehicle is out of scope. The Set
  // is `null` when the filter is inactive (every booking passes).
  const stationVehicleIds = useMemo<Set<string> | null>(() => {
    if (!stationFilter) return null;
    const ids = new Set<string>();
    for (const v of fleetVehicles) {
      if (
        v.stationId === stationFilter ||
        v.homeStationId === stationFilter ||
        v.currentStationId === stationFilter
      ) {
        ids.add(v.id);
      }
    }
    return ids;
  }, [fleetVehicles, stationFilter]);
  const intlLocale = useMemo(() => {
    const lm: Record<string, string> = {
      en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL',
      es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ',
    };
    return lm[locale] || 'en-US';
  }, [locale]);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [bookings, setBookings] = useState<ScheduleBookingApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    api.bookings
      .list(orgId)
      .then((rows) => {
        if (cancelled) return;
        // Backend returns a paginated envelope `{ data, pagination }`.
        const arr = Array.isArray(rows) ? (rows as any[]) : ((rows as any)?.data ?? []);
        setBookings(arr as ScheduleBookingApi[]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  const range = useMemo(() => buildRange(viewMode, intlLocale), [viewMode, intlLocale]);

  const rows = useMemo<ScheduleRow[]>(() => {
    const nowMs = Date.now();
    const byVehicle = new Map<string, ScheduleRow>();

    // Seed with vehicles in fleet so vehicle-name + license formatting stays
    // consistent with the rest of the dashboard.
    const vehicleMeta = new Map<string, { name: string; license: string }>();
    for (const v of fleetVehicles) {
      vehicleMeta.set(v.id, {
        name: `${v.make ?? ''} ${v.model ?? ''}`.trim() || v.license || v.id.slice(0, 6),
        license: v.license || '',
      });
    }

    for (const b of bookings) {
      if (!b || !b.vehicleId || !b.startDate || !b.endDate) continue;
      // V4.6.95 — Apply the dashboard station filter at the booking level
      // so rows for vehicles outside the selected station never enter the
      // lane chart's row map (and therefore don't show up as empty rows).
      if (stationVehicleIds && !stationVehicleIds.has(b.vehicleId)) continue;
      const status = (b.status || '').toLowerCase();
      if (status === 'cancelled') continue;
      const startMs = Date.parse(b.startDate);
      const endMs = Date.parse(b.endDate);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      // Skip bookings entirely outside the visible range.
      if (endMs < range.startMs || startMs > range.endMs) continue;

      const meta = vehicleMeta.get(b.vehicleId);
      const vehicleName = meta?.name || b.vehicleName || 'Vehicle';
      const vehicleLicense = meta?.license || b.vehicleLicense || '';

      const clampedStart = Math.max(startMs, range.startMs);
      const clampedEnd = Math.min(endMs, range.endMs);
      const leftPct = ((clampedStart - range.startMs) / range.totalMs) * 100;
      const widthPct = clampPositive(((clampedEnd - clampedStart) / range.totalMs) * 100);

      const positioned: ScheduleBookingPositioned = {
        id: b.id,
        customerName: (b.customerName || '').trim() || '—',
        status: b.status || '',
        leftPct,
        widthPct: Math.max(widthPct, 1.5), // never collapse to 0 width
        isActive: nowMs >= startMs && nowMs <= endMs,
        clippedLeft: startMs < range.startMs,
        clippedRight: endMs > range.endMs,
      };

      let row = byVehicle.get(b.vehicleId);
      if (!row) {
        row = { vehicleId: b.vehicleId, vehicleName, vehicleLicense, bookings: [] };
        byVehicle.set(b.vehicleId, row);
      }
      row.bookings.push(positioned);
    }

    return [...byVehicle.values()].sort((a, b) => a.vehicleName.localeCompare(b.vehicleName));
  }, [bookings, fleetVehicles, range, stationVehicleIds]);

  const nowPct = useMemo(() => {
    const now = Date.now();
    if (now < range.startMs || now > range.endMs) return null;
    return ((now - range.startMs) / range.totalMs) * 100;
  }, [range]);

  const totalBookingCount = rows.reduce((acc, r) => acc + r.bookings.length, 0);
  const numColumns = range.columns.length;
  const gridTemplate = `repeat(${numColumns}, minmax(0, 1fr))`;

  return (
    <div className="surface-premium overflow-hidden animate-fade-up flex flex-col">
      {/* ─── Header ─── */}
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="sq-tone-info w-7 h-7 rounded-xl flex items-center justify-center shrink-0">
              <Icon name="calendar" className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground">Schedule</h3>
              <p className="text-[10.5px] text-muted-foreground truncate">
                {totalBookingCount > 0
                  ? `${totalBookingCount} ${totalBookingCount === 1 ? 'booking' : 'bookings'} in view`
                  : 'Current and upcoming bookings'}
              </p>
            </div>
          </div>
          <div className="sq-tab-bar p-1 flex items-stretch shrink-0">
            {VIEW_MODES.map((tab) => {
              const isActive = viewMode === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`px-2.5 py-1 rounded-[calc(var(--radius-md)-2px)] text-[11.5px] leading-[16.1px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? 'surface-premium text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Body ─── */}
      {loading ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center">
          <Icon name="loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : errored ? (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center px-4 text-center">
          <p className="text-[12px] font-semibold text-foreground">Could not load schedule</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Bookings will appear once the request succeeds.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center px-4 text-center">
          <div className="sq-tone-info w-9 h-9 rounded-xl flex items-center justify-center mb-2">
            <Icon name="calendar" className="w-4.5 h-4.5" />
          </div>
          <p className="text-[12px] font-semibold text-foreground">No bookings in this range</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Switch to {viewMode === 'day' ? 'Week' : viewMode === 'week' ? 'Month' : 'Day'} to widen the horizon.</p>
        </div>
      ) : (
        <div className="px-2 pb-2 pt-2">
          <div className="relative rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            {/* Header row with column labels. */}
            <div className="grid border-b border-border/60" style={{ gridTemplateColumns: `${LABEL_COL_W}px 1fr` }}>
              <div className="px-3 py-2 border-r border-border/60 surface-premium">
                <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">Vehicle</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                {range.columns.map((col, idx) => (
                  <div
                    key={`hdr-${idx}`}
                    className={`px-1.5 py-1.5 text-center ${idx < range.columns.length - 1 ? 'border-r border-border/40' : ''}`}
                  >
                    <div className="text-[9.5px] font-semibold tracking-[0.06em] uppercase text-muted-foreground truncate">
                      {col.label}
                    </div>
                    {col.sub && (
                      <div className="text-[9px] tabular-nums text-muted-foreground/80 mt-0.5 truncate">{col.sub}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Body rows. The whole timeline body is wrapped in a relative
                container so the "now" line can overlay every row at once. */}
            <div className="relative max-h-[360px] overflow-y-auto">
              {rows.map((row, rowIdx) => (
                <Fragment key={row.vehicleId}>
                  <div
                    className={`grid items-stretch ${rowIdx < rows.length - 1 ? 'border-b border-border/40' : ''}`}
                    style={{ gridTemplateColumns: `${LABEL_COL_W}px 1fr` }}
                  >
                    {/* Vehicle label cell */}
                    <div className="px-2.5 py-1.5 border-r border-border/60 surface-premium min-w-0">
                      <div className="text-[10px] font-semibold text-foreground truncate" title={row.vehicleName}>
                        {row.vehicleName}
                      </div>
                      {row.vehicleLicense && (
                        <div className="text-[10px] font-semibold text-[color:var(--brand)] tabular-nums truncate flex items-center gap-0.5">
                          {row.vehicleLicense}
                          <Icon name="chevron-right" className="w-2.5 h-2.5 opacity-70 shrink-0" />
                        </div>
                      )}
                    </div>

                    {/* Timeline cell — column dividers via grid background, pills layered on top.
                        V4.6.96 — row height tightened from h-12 → h-11 so more vehicles fit
                        inside the same scroll viewport without sacrificing pill legibility. */}
                    <div className="relative h-11">
                      <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: gridTemplate }}>
                        {range.columns.map((_, idx) => (
                          <div
                            key={`grid-${rowIdx}-${idx}`}
                            className={idx < range.columns.length - 1 ? 'border-r border-dashed border-border/30' : ''}
                          />
                        ))}
                      </div>

                      {row.bookings.map((b) => {
                        const isClickable = !!onOpenBookingById && !!b.id;
                        // V4.6.96 — saturated fills (200/25 instead of 50/10) so
                        // even tiny pills in Week / Month view register at a
                        // glance. Active bookings keep amber, future use emerald.
                        const tone = b.isActive
                          ? {
                              bg: 'bg-amber-200/70 dark:bg-amber-500/25',
                              border: 'border-amber-400/80 dark:border-amber-500/50',
                              text: 'text-amber-900 dark:text-amber-100',
                              icon: 'text-amber-700 dark:text-amber-300',
                            }
                          : {
                              bg: 'bg-emerald-200/65 dark:bg-emerald-500/22',
                              border: 'border-emerald-400/75 dark:border-emerald-500/45',
                              text: 'text-emerald-900 dark:text-emerald-100',
                              icon: 'text-emerald-700 dark:text-emerald-300',
                            };
                        const { label, showIcon } = buildPillContent(b.customerName, viewMode, b.widthPct);
                        const isMicro = b.widthPct < 4;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            disabled={!isClickable}
                            onClick={isClickable ? () => onOpenBookingById!(b.id) : undefined}
                            title={`${b.customerName}${b.status ? ` · ${b.status}` : ''}`}
                            className={`absolute top-1 bottom-1 flex items-center justify-center gap-1 ${isMicro ? 'px-0' : 'px-1.5'} rounded-full border ${tone.bg} ${tone.border} ${tone.text} text-[10.5px] font-semibold whitespace-nowrap overflow-hidden transition-all hover:shadow-[var(--shadow-1)] hover:-translate-y-[0.5px] hover:z-10 ${
                              isClickable ? 'cursor-pointer' : 'cursor-default'
                            } ${b.clippedLeft ? 'rounded-l-none' : ''} ${b.clippedRight ? 'rounded-r-none' : ''}`}
                            // V4.6.96 — `minWidth: 6px` ensures one-day bookings in Month
                            // view stay visible as a colored sliver (otherwise a 0.8% pill
                            // collapses to ~1px and is effectively invisible).
                            style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%`, minWidth: '6px' }}
                          >
                            {showIcon && <Icon name="user-circle-2" className={`w-3 h-3 shrink-0 ${tone.icon}`} />}
                            {label && <span className="truncate">{label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Fragment>
              ))}

              {/* "Now" line — overlays the body so the dispatcher can see at
                  a glance which side of the schedule is past vs. future. */}
              {nowPct !== null && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `calc(${LABEL_COL_W}px + (100% - ${LABEL_COL_W}px) * ${nowPct} / 100)` }}
                >
                  <div className="relative w-px h-full bg-[color:color-mix(in_srgb,var(--status-critical)_70%,transparent)]">
                    <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-[color:var(--status-critical)] ring-2 ring-card" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
