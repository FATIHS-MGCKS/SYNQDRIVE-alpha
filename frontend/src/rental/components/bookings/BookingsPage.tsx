import { useMemo, useState } from 'react';
import { PageHeader, EmptyState } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { BookingUiRow } from '../../lib/entityMappers';
import { useSendDocumentsEmailLauncher } from '../send-documents-email/SendDocumentsEmailLauncherProvider';
import { BOOKING_PACKAGE_TYPES } from '../send-documents-email/send-documents-email.utils';
import type { VehicleData } from '../../data/vehicles';
import type { BookingFiltersState, BookingPlannerView } from './bookingTypes';
import { BookingsToolbar } from './BookingsToolbar';
import { BookingsTimelineView } from './BookingsTimelineView';
import { BookingsTableView } from './BookingsTableView';
import { BookingsCalendarView } from './BookingsCalendarView';
import { filterBookings } from './bookingUtils';

interface StationOption {
  id: string;
  name: string;
}

export interface BookingsPageProps {
  bookings: BookingUiRow[];
  loading: boolean;
  error: string | null;
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
  error,
  onRetry,
  fleetVehicles,
  stations,
  onCreateNewBooking,
  onOpenDetail,
  onOpenDrawer,
  onCancelBooking,
}: BookingsPageProps) {
  const { openForBooking, opening, canSend } = useSendDocumentsEmailLauncher();
  const [sendingBookingId, setSendingBookingId] = useState<string | null>(null);

  const handleSendDocuments = async (row: BookingUiRow) => {
    setSendingBookingId(row.id);
    try {
      await openForBooking({
        bookingId: row.id,
        customer: {
          email: row.customerEmail,
          fullName: row.customer,
        },
        booking: { id: row.id, bookingNumber: row.bookingRef },
        documentTypes: [...BOOKING_PACKAGE_TYPES],
        sourceContext: 'BOOKING_DOCUMENTS',
      });
    } finally {
      setSendingBookingId(null);
    }
  };

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
            onClick={onRetry}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-current"
          >
            Erneut laden
          </button>
        </div>
      )}

      {loading && !error ? (
        <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
          <Icon name="loader-2" className="w-8 h-8 animate-spin" />
          <p className="text-xs">Buchungen werden geladen…</p>
        </div>
      ) : !error && filtered.length === 0 ? (
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
              rows={filtered}
              loading={loading}
              onRowClick={onOpenDrawer}
              onEdit={onOpenDetail}
              onCancel={onCancelBooking}
              onSendDocuments={handleSendDocuments}
              canSendDocuments={canSend}
              sendingBookingId={opening ? sendingBookingId : null}
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
            />
          )}
        </>
      ) : null}

      <p className="text-[10px] text-muted-foreground text-right">
        {filtered.length} Buchung{filtered.length === 1 ? '' : 'en'} · Klick öffnet Detail-Drawer
      </p>
    </div>
  );
}
