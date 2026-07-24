import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, EmptyState } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { VehicleData } from '../../data/vehicles';
import type {
  BookingFiltersState,
  BookingPlannerView,
  BookingTableSortBy,
  BookingTableSortOrder,
} from './bookingTypes';
import { BookingsToolbar } from './BookingsToolbar';
import { BookingsTimelineView } from './BookingsTimelineView';
import { BookingsTableView } from './BookingsTableView';
import { BookingsCalendarView } from './BookingsCalendarView';
import {
  defaultTimelineAnchorDateOnly,
  useBookingsPlannerData,
} from '../../hooks/useBookingsPlannerData';
import { useOrgTimezone } from '../../hooks/useOrgTimezone';
import {
  orgCalendarMonthYear,
  resolveWeekStartsOn,
  shiftDateOnlyByMonths,
  shiftDateOnlyByWeeks,
} from '../../../lib/datetime';

interface StationOption {
  id: string;
  name: string;
}

export interface BookingsPageProps {
  orgId: string | null | undefined;
  fleetVehicles: VehicleData[];
  stations: StationOption[];
  onCreateNewBooking?: () => void;
  onOpenDetail: (bookingId: string) => void;
  onOpenDrawer: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
  refreshToken?: number;
}

function formatTimelineRangeLabel(
  fromIso: string,
  toIso: string,
  timeZone: string,
  locale: string,
  mode: 'week' | 'month',
): string {
  const from = new Date(fromIso);
  const toExclusive = new Date(toIso);
  const toInclusive = new Date(toExclusive.getTime() - 1);
  if (mode === 'month') {
    return from.toLocaleDateString(locale, { timeZone, month: 'long', year: 'numeric' });
  }
  const fromLabel = from.toLocaleDateString(locale, { timeZone, day: '2-digit', month: '2-digit' });
  const toLabel = toInclusive.toLocaleDateString(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${fromLabel} – ${toLabel}`;
}

export function BookingsPage({
  orgId,
  fleetVehicles,
  stations,
  onCreateNewBooking,
  onOpenDetail,
  onOpenDrawer,
  onCancelBooking,
  refreshToken = 0,
}: BookingsPageProps) {
  const { timezone, locale } = useOrgTimezone(orgId);
  const weekStartsOn = resolveWeekStartsOn(locale);
  const initialOrgCalendar = orgCalendarMonthYear(timezone);
  const [view, setView] = useState<BookingPlannerView>('timeline');
  const [timelineRange, setTimelineRange] = useState<'week' | 'month'>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => initialOrgCalendar.month);
  const [calendarYear, setCalendarYear] = useState(() => initialOrgCalendar.year);
  const [timelineAnchorDateOnly, setTimelineAnchorDateOnly] = useState(() =>
    defaultTimelineAnchorDateOnly(timezone),
  );
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [sortBy, setSortBy] = useState<BookingTableSortBy>('startDate');
  const [sortOrder, setSortOrder] = useState<BookingTableSortOrder>('desc');
  const [filters, setFilters] = useState<BookingFiltersState>({
    search: '',
    status: 'all',
    vehicleId: null,
    stationId: null,
    dateFrom: null,
    dateTo: null,
    showTerminal: false,
  });

  const { rows, meta, loading, error, truncated, refresh, tablePageSize, visibleRange } =
    useBookingsPlannerData({
      orgId,
      timeZone: timezone,
      locale,
      weekStartsOn,
      view,
      filters,
      timelineRange,
      calendarMonth,
      calendarYear,
      timelineAnchorDateOnly,
      tablePage,
      sortBy,
      sortOrder,
      refreshToken,
    });

  useEffect(() => {
    setTablePage(1);
  }, [filters, view, sortBy, sortOrder]);

  useEffect(() => {
    setSelectedCalendarDay(null);
    setSelectedBookingId(null);
  }, [calendarMonth, calendarYear]);

  const handleSortChange = (nextSortBy: BookingTableSortBy) => {
    if (sortBy === nextSortBy) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(nextSortBy);
    setSortOrder(nextSortBy === 'startDate' ? 'desc' : 'asc');
  };

  const rangeStart = useMemo(() => new Date(visibleRange.from), [visibleRange.from]);
  const rangeEnd = useMemo(() => new Date(visibleRange.to), [visibleRange.to]);

  const timelineRangeLabel = useMemo(
    () =>
      view === 'timeline'
        ? formatTimelineRangeLabel(visibleRange.from, visibleRange.to, timezone, locale, timelineRange)
        : undefined,
    [view, visibleRange.from, visibleRange.to, timezone, locale, timelineRange],
  );

  const navigateTimeline = useCallback(
    (direction: -1 | 1) => {
      setTimelineAnchorDateOnly((current) => {
        if (timelineRange === 'week') {
          return shiftDateOnlyByWeeks(current, direction, timezone);
        }
        return shiftDateOnlyByMonths(current, direction, timezone);
      });
    },
    [timelineRange, timezone],
  );

  const handleMonthChange = useCallback((month: number, year: number) => {
    setCalendarMonth(month);
    setCalendarYear(year);
    setSelectedCalendarDay(null);
    setSelectedBookingId(null);
  }, []);

  const handleDayClick = useCallback((day: number | null) => {
    setSelectedCalendarDay(day);
    setSelectedBookingId(null);
  }, []);

  const handleBookingClick = useCallback(
    (bookingId: string) => {
      setSelectedBookingId(bookingId);
      onOpenDrawer(bookingId);
    },
    [onOpenDrawer],
  );

  const vehiclesForTimeline = useMemo(() => {
    if (filters.vehicleId) {
      return fleetVehicles.filter((v) => v.id === filters.vehicleId);
    }
    return fleetVehicles;
  }, [fleetVehicles, filters.vehicleId]);

  const showEmpty = !loading && !error && rows.length === 0;
  const showContent = !error && rows.length > 0;

  return (
    <div className="max-w-[1800px] mx-auto space-y-4">
      <PageHeader title="Buchungen" />

      <BookingsToolbar
        filters={filters}
        onFiltersChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        view={view}
        onViewChange={setView}
        vehicles={fleetVehicles}
        stations={stations}
        onCreateNewBooking={onCreateNewBooking}
        timelineRange={timelineRange}
        onTimelineRangeChange={setTimelineRange}
      />

      {error && (
        <div className="rounded-xl p-4 sq-tone-critical flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium flex-1">
            <Icon name="alert-circle" className="w-5 h-5 shrink-0" />
            {error}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-current"
          >
            Erneut laden
          </button>
        </div>
      )}

      {truncated && !error && (
        <div className="rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 text-xs text-foreground">
          Es gibt mehr Buchungen im gewählten Zeitraum ({meta?.total ?? 0} gesamt). Bitte Filter
          verfeinern oder zur Tabellenansicht wechseln.
        </div>
      )}

      {loading && rows.length === 0 && !error ? (
        <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
          <Icon name="loader-2" className="w-8 h-8 animate-spin" />
          <p className="text-xs">Buchungen werden geladen…</p>
        </div>
      ) : showEmpty ? (
        <EmptyState
          icon={<Icon name="calendar" className="w-6 h-6" />}
          title="Keine Buchungen für die aktuellen Filter"
          description="Passen Sie Filter an oder legen Sie eine neue Buchung an."
          action={
            onCreateNewBooking ? (
              <button type="button" onClick={onCreateNewBooking} className="text-xs font-semibold sq-tone-brand px-3 py-1.5 rounded-lg">
                Neue Buchung
              </button>
            ) : undefined
          }
        />
      ) : showContent ? (
        <>
          {view === 'timeline' && (
            <BookingsTimelineView
              vehicles={vehiclesForTimeline}
              bookings={rows}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              timeZone={timezone}
              locale={locale}
              rangeLabel={timelineRangeLabel}
              onNavigatePrev={() => navigateTimeline(-1)}
              onNavigateNext={() => navigateTimeline(1)}
              onSelectBooking={handleBookingClick}
            />
          )}
          {view === 'table' && (
            <BookingsTableView
              rows={rows}
              loading={loading}
              onRowClick={onOpenDrawer}
              onEdit={onOpenDetail}
              onCancel={onCancelBooking}
              page={meta?.page ?? tablePage}
              pageSize={tablePageSize}
              total={meta?.total ?? rows.length}
              hasNextPage={meta?.hasNextPage ?? false}
              onPageChange={setTablePage}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
            />
          )}
          {view === 'calendar' && (
            <BookingsCalendarView
              rows={rows}
              month={calendarMonth}
              year={calendarYear}
              timeZone={timezone}
              locale={locale}
              weekStartsOn={weekStartsOn}
              selectedDay={selectedCalendarDay}
              selectedBookingId={selectedBookingId}
              onDayClick={handleDayClick}
              onBookingClick={handleBookingClick}
              onMonthChange={handleMonthChange}
            />
          )}
        </>
      ) : null}

      {!error && (
        <p className="text-[10px] text-muted-foreground text-right">
          {meta?.total ?? rows.length} Buchung{(meta?.total ?? rows.length) === 1 ? '' : 'en'}{' '}
          {view === 'table' && meta
            ? `· Seite ${meta.page}/${meta.totalPages}`
            : ''}{' '}
          · Klick öffnet Detail-Drawer
        </p>
      )}
    </div>
  );
}
