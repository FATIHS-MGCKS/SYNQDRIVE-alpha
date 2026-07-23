import { useEffect, useMemo, useState } from 'react';
import { PageHeader, EmptyState } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { BookingUiRow } from '../../lib/entityMappers';
import type { VehicleData } from '../../data/vehicles';
import type { BookingFiltersState, BookingPlannerView } from './bookingTypes';
import { BookingsToolbar } from './BookingsToolbar';
import { BookingsTimelineView } from './BookingsTimelineView';
import { BookingsTableView } from './BookingsTableView';
import { BookingsCalendarView } from './BookingsCalendarView';
import { useBookingsPlannerData } from '../../hooks/useBookingsPlannerData';

interface StationOption {
  id: string;
  name: string;
}

export interface BookingsPageProps {
  orgId: string | null | undefined;
  additionalBookings?: BookingUiRow[];
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
  additionalBookings = [],
  fleetVehicles,
  stations,
  onCreateNewBooking,
  onOpenDetail,
  onOpenDrawer,
  onCancelBooking,
  refreshToken = 0,
}: BookingsPageProps) {
  const [view, setView] = useState<BookingPlannerView>('timeline');
  const [timelineRange, setTimelineRange] = useState<'week' | 'month'>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [tablePage, setTablePage] = useState(1);
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
    view,
    filters,
    timelineRange,
    calendarMonth,
    calendarYear,
    tablePage,
  });

  useEffect(() => {
    if (refreshToken > 0) void refresh();
  }, [refreshToken, refresh]);

  useEffect(() => {
    setTablePage(1);
  }, [filters, view]);

  const bookings = useMemo(() => {
    const apiIds = new Set(rows.map((b) => b.id));
    const extras = additionalBookings.filter((b) => b?.id && !apiIds.has(b.id));
    return [...rows, ...extras];
  }, [rows, additionalBookings]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (view === 'calendar') {
      const start = new Date(calendarYear, calendarMonth, 1);
      const end = new Date(calendarYear, calendarMonth + 1, 0, 23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    if (timelineRange === 'week') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { rangeStart: start, rangeEnd: end };
  }, [view, timelineRange, calendarMonth, calendarYear]);

  const vehiclesForTimeline = useMemo(() => {
    if (filters.vehicleId) {
      return fleetVehicles.filter((v) => v.id === filters.vehicleId);
    }
    return fleetVehicles;
  }, [fleetVehicles, filters.vehicleId]);

  const timelineBookings = bookings;

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

      {loading && !error ? (
        <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
          <Icon name="loader-2" className="w-8 h-8 animate-spin" />
          <p className="text-xs">Buchungen werden geladen…</p>
        </div>
      ) : !error && bookings.length === 0 ? (
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
      ) : !error ? (
        <>
          {view === 'timeline' && (
            <BookingsTimelineView
              vehicles={vehiclesForTimeline}
              bookings={timelineBookings}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onSelectBooking={onOpenDrawer}
            />
          )}
          {view === 'table' && (
            <BookingsTableView
              rows={bookings}
              loading={loading}
              onRowClick={onOpenDrawer}
              onEdit={onOpenDetail}
              onCancel={onCancelBooking}
              page={meta?.page ?? tablePage}
              pageSize={tablePageSize}
              total={meta?.total ?? bookings.length}
              hasNextPage={meta?.hasNextPage ?? false}
              onPageChange={setTablePage}
            />
          )}
          {view === 'calendar' && (
            <BookingsCalendarView
              rows={bookings}
              month={calendarMonth}
              year={calendarYear}
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

      <p className="text-[10px] text-muted-foreground text-right">
        {meta?.total ?? bookings.length} Buchung{(meta?.total ?? bookings.length) === 1 ? '' : 'en'}{' '}
        {view === 'table' && meta
          ? `· Seite ${meta.page}/${meta.totalPages}`
          : ''}{' '}
        · Klick öffnet Detail-Drawer
      </p>
    </div>
  );
}
