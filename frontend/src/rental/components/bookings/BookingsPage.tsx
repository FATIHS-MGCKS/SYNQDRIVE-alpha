import { useMemo, useState } from 'react';
import { PageHeader, EmptyState, ErrorState, SkeletonRows } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { BookingUiRow } from '../../lib/entityMappers';
import type { VehicleData } from '../../data/vehicles';
import type { BookingFiltersState, BookingPlannerView } from './bookingTypes';
import { BookingsToolbar } from './BookingsToolbar';
import { BookingsTimelineView } from './BookingsTimelineView';
import { BookingsTableView } from './BookingsTableView';
import { BookingsCalendarView } from './BookingsCalendarView';
import { filterBookings } from './bookingUtils';
import {
  bookingsPlannerEmptyVariant,
  bookingsPlannerFatalError,
  bookingsPlannerInitialLoading,
  bookingsPlannerPartialError,
  bookingsPlannerShowViews,
} from './bookingsPageState.utils';

interface StationOption {
  id: string;
  name: string;
}

export interface BookingsPageProps {
  bookings: BookingUiRow[];
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  listTruncated?: boolean;
  onRetry: () => void;
  fleetVehicles: VehicleData[];
  stations: StationOption[];
  onCreateNewBooking?: () => void;
  onOpenDetail: (bookingId: string) => void;
  onOpenDrawer: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
}

export function BookingsPage({
  bookings,
  loading,
  refreshing = false,
  error,
  listTruncated = false,
  onRetry,
  fleetVehicles,
  stations,
  onCreateNewBooking,
  onOpenDetail,
  onOpenDrawer,
  onCancelBooking,
}: BookingsPageProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<BookingPlannerView>('timeline');
  const [timelineRange, setTimelineRange] = useState<'week' | 'month'>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [filters, setFilters] = useState<BookingFiltersState>({
    search: '',
    status: 'all',
    vehicleId: null,
    stationId: null,
    dateFrom: null,
    dateTo: null,
    showTerminal: false,
  });

  const filtered = useMemo(() => filterBookings(bookings, filters), [bookings, filters]);
  const hasCachedBookings = bookings.length > 0;
  const initialLoading = bookingsPlannerInitialLoading({ loading, hasCachedBookings });
  const fatalError = bookingsPlannerFatalError({ error, hasCachedBookings });
  const partialError = bookingsPlannerPartialError({ error, hasCachedBookings });
  const emptyVariant = bookingsPlannerEmptyVariant({
    loading: initialLoading,
    error: fatalError ? error : null,
    totalCount: bookings.length,
    filteredCount: filtered.length,
  });
  const showViews = bookingsPlannerShowViews({
    initialLoading,
    fatalError,
    filteredCount: filtered.length,
  });

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
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
  }, [timelineRange]);

  const vehiclesForTimeline = useMemo(() => {
    if (filters.vehicleId) {
      return fleetVehicles.filter((v) => v.id === filters.vehicleId);
    }
    return fleetVehicles;
  }, [fleetVehicles, filters.vehicleId]);

  const timelineBookings = useMemo(() => {
    return filtered.filter((b) => {
      const raw = b._raw as { startDate?: string; endDate?: string } | undefined;
      const start = raw?.startDate ? new Date(raw.startDate) : null;
      const end = raw?.endDate ? new Date(raw.endDate) : null;
      if (!start || !end) return false;
      return start < rangeEnd && end > rangeStart;
    });
  }, [filtered, rangeStart, rangeEnd]);

  const shiftCalendarMonth = (delta: number) => {
    const next = new Date(calendarYear, calendarMonth + delta, 1);
    setCalendarYear(next.getFullYear());
    setCalendarMonth(next.getMonth());
    setSelectedCalendarDay(null);
  };

  const emptyTitle =
    emptyVariant === 'dataset' ? t('bookings.noBookings') : t('bookings.planner.emptyTitle');
  const emptyDescription =
    emptyVariant === 'dataset'
      ? t('bookings.planner.emptyDatasetDescription')
      : t('bookings.planner.emptyDescription');

  return (
    <div className="max-w-[1800px] mx-auto space-y-4">
      <PageHeader title={t('bookings.title')} />

      {listTruncated && !initialLoading && (
        <p className="text-[11px] text-[color:var(--status-attention)] px-1" role="status">
          {t('bookings.planner.truncated')}
        </p>
      )}

      {refreshing && hasCachedBookings && (
        <p className="text-[11px] text-muted-foreground px-1" role="status" aria-live="polite">
          {t('bookings.planner.loading')}
        </p>
      )}

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

      {partialError && (
        <ErrorState
          compact
          surface="solid"
          title={t('bookings.title')}
          error={error}
          onRetry={onRetry}
          retryLabel={t('bookings.planner.retry')}
        />
      )}

      {fatalError && (
        <ErrorState
          title={t('bookings.title')}
          error={error}
          onRetry={onRetry}
          retryLabel={t('bookings.planner.retry')}
        />
      )}

      {initialLoading && <SkeletonRows rows={6} className="py-4" />}

      {emptyVariant !== 'none' && (
        <EmptyState
          icon={<Icon name="calendar" className="w-6 h-6" />}
          title={emptyTitle}
          description={emptyDescription}
          action={
            onCreateNewBooking ? (
              <button
                type="button"
                onClick={onCreateNewBooking}
                className="text-xs font-semibold sq-tone-brand px-3 py-1.5 rounded-lg"
              >
                {t('bookings.newBooking')}
              </button>
            ) : undefined
          }
        />
      )}

      {showViews && (
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
              rows={filtered}
              loading={refreshing}
              onRowClick={onOpenDrawer}
              onEdit={onOpenDetail}
              onCancel={onCancelBooking}
            />
          )}
          {view === 'calendar' && (
            <BookingsCalendarView
              rows={filtered}
              month={calendarMonth}
              year={calendarYear}
              selectedDay={selectedCalendarDay}
              onDayClick={setSelectedCalendarDay}
              onBookingClick={onOpenDrawer}
              onPrevMonth={() => shiftCalendarMonth(-1)}
              onNextMonth={() => shiftCalendarMonth(1)}
            />
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground text-right">
        {t('bookings.planner.footer', { count: filtered.length })}
      </p>
    </div>
  );
}