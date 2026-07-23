import { useEffect, useMemo, useState } from 'react';
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
import { useBookingsPlannerData } from '../../hooks/useBookingsPlannerData';
import { useOrgTimezone } from '../../hooks/useOrgTimezone';
import {
  orgCalendarMonthYear,
  zonedCalendarMonthRange,
  zonedWeekRange,
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
  const { timezone } = useOrgTimezone(orgId);
  const initialOrgCalendar = orgCalendarMonthYear(timezone);
  const [view, setView] = useState<BookingPlannerView>('timeline');
  const [timelineRange, setTimelineRange] = useState<'week' | 'month'>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => initialOrgCalendar.month);
  const [calendarYear, setCalendarYear] = useState(() => initialOrgCalendar.year);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
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

  const { rows, meta, loading, error, truncated, refresh, tablePageSize } = useBookingsPlannerData({
    orgId,
    timeZone: timezone,
    view,
    filters,
    timelineRange,
    calendarMonth,
    calendarYear,
    tablePage,
    sortBy,
    sortOrder,
    refreshToken,
  });

  useEffect(() => {
    setTablePage(1);
  }, [filters, view, sortBy, sortOrder]);

  const handleSortChange = (nextSortBy: BookingTableSortBy) => {
    if (sortBy === nextSortBy) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(nextSortBy);
    setSortOrder(nextSortBy === 'startDate' ? 'desc' : 'asc');
  };

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'calendar') {
      const range = zonedCalendarMonthRange(calendarYear, calendarMonth, timezone);
      return {
        rangeStart: new Date(range.from),
        rangeEnd: new Date(range.to),
      };
    }
    if (timelineRange === 'week') {
      const range = zonedWeekRange(new Date(), timezone);
      return {
        rangeStart: new Date(range.from),
        rangeEnd: new Date(range.to),
      };
    }
    const { month, year } = orgCalendarMonthYear(timezone);
    const range = zonedCalendarMonthRange(year, month, timezone);
    return {
      rangeStart: new Date(range.from),
      rangeEnd: new Date(range.to),
    };
  }, [view, timelineRange, calendarMonth, calendarYear, timezone]);

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
              onSelectBooking={onOpenDrawer}
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
              selectedDay={selectedCalendarDay}
              onDayClick={setSelectedCalendarDay}
              onBookingClick={onOpenDrawer}
              onMonthChange={(month, year) => {
                setCalendarMonth(month);
                setCalendarYear(year);
              }}
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
