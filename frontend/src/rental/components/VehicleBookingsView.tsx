import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { fetchAllBookingsInRange, isAbortError } from '../../lib/bookings-pagination';
import { BOOKINGS_LIST_INVALIDATED_EVENT } from '../lib/bookings-invalidation';
import {
  buildTimelineHorizon,
  resolveHorizonAnchorForMode,
  resolveRangeDays,
  shiftTimelineAnchor,
  type TimelineRangeMode,
} from '../lib/vehicle-availability-timeline.utils';
import { useRentalOrg } from '../RentalContext';
import type { VehicleData } from '../data/vehicles';
import {
  normalizeBookingStatus,
  type BookingUiStatus,
} from './bookings/bookingStatus';
import { Icon } from './ui/Icon';
import { VehicleAvailabilityTimeline } from './vehicle-bookings/VehicleAvailabilityTimeline';
import { VehicleBookingQuickDrawer } from './vehicle-bookings/VehicleBookingQuickDrawer';
import { VehicleBookingsAgenda } from './vehicle-bookings/VehicleBookingsAgenda';
import { VehicleBookingReadinessStrip } from './vehicle-bookings/VehicleBookingReadinessStrip';
import { VehicleBookingsOperatorHeader } from './vehicle-bookings/VehicleBookingsOperatorHeader';
import { vb, vbActionClass } from './vehicle-bookings/vehicle-bookings-ui';
import type { VehicleAgendaBooking } from '../lib/vehicle-booking-agenda.utils';
import {
  detectSystemConflicts,
  getTimelineConflictBookingIds,
} from '../lib/vehicle-booking-risk.utils';

interface VehicleBookingsViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
  vehicleName?: string;
  onCreateBooking?: () => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenVehicleTasks?: () => void;
}

interface VehicleBookingRow extends VehicleAgendaBooking {}

const MS_DAY = 24 * 60 * 60 * 1000;
const VEHICLE_BOOKINGS_PAGE_SIZE = 100;
const DEFAULT_RANGE_MODE: TimelineRangeMode = 14;

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function buildBooking(raw: Record<string, unknown>): VehicleBookingRow | null {
  const start = parseDate(raw.startDate ?? raw.pickupAt ?? raw.startAt);
  const end = parseDate(raw.endDate ?? raw.returnAt ?? raw.endAt);
  if (!start || !end) return null;

  const status = normalizeBookingStatus(
    raw.statusEnum as string | undefined,
    raw.status as string | undefined,
  );
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_DAY));
  const totalPriceCents =
    typeof raw.totalPriceCents === 'number' && Number.isFinite(raw.totalPriceCents)
      ? raw.totalPriceCents
      : null;

  const pickupProtocol = raw.pickupProtocol as Record<string, unknown> | null | undefined;
  const returnProtocol = raw.returnProtocol as Record<string, unknown> | null | undefined;
  const hasPickup = Boolean(pickupProtocol && (pickupProtocol.id || pickupProtocol.kind));
  const hasReturn = Boolean(returnProtocol && (returnProtocol.id || returnProtocol.kind));

  return {
    id: String(raw.id ?? ''),
    customerName: String(
      raw.customerName ?? (raw.customer as { name?: string } | undefined)?.name ?? 'Unbekannter Kunde',
    ),
    status,
    startDate: start,
    endDate: end,
    pickupLocation: String(
      raw.pickupLocation ?? raw.pickupStationName ?? (raw.pickupStation as { name?: string } | undefined)?.name ?? 'Abholung offen',
    ),
    returnLocation: String(
      raw.returnLocation ?? raw.returnStationName ?? (raw.returnStation as { name?: string } | undefined)?.name ?? 'Rückgabe offen',
    ),
    totalPriceCents,
    days,
    hasPickup,
    hasReturn,
    isOverdue: false,
    needsPickup: false,
    needsReturn: false,
  };
}

export function VehicleBookingsView({
  vehicle,
  vehicleName,
  onCreateBooking,
  onOpenBooking,
  onOpenVehicleTasks,
}: VehicleBookingsViewProps) {
  const { orgId } = useRentalOrg();
  const [bookings, setBookings] = useState<VehicleBookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [rangeMode, setRangeMode] = useState<TimelineRangeMode>(DEFAULT_RANGE_MODE);
  const [rangeAnchor, setRangeAnchor] = useState(() => resolveHorizonAnchorForMode(DEFAULT_RANGE_MODE));
  const [drawerBookingId, setDrawerBookingId] = useState<string | null>(null);
  const [drawerFallback, setDrawerFallback] = useState<VehicleAgendaBooking | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const horizon = useMemo(
    () => buildTimelineHorizon(rangeAnchor, rangeMode),
    [rangeAnchor, rangeMode],
  );

  const loadBookings = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    if (!orgId || !vehicle?.id) {
      setBookings([]);
      setError(null);
      setTruncated(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setTruncated(false);

    try {
      const result = await fetchAllBookingsInRange(
        orgId,
        {
          vehicleId: vehicle.id,
          from: horizon.fromIso,
          to: horizon.toIso,
          sortBy: 'startDate',
          sortOrder: 'asc',
          limit: VEHICLE_BOOKINGS_PAGE_SIZE,
        },
        { signal: controller.signal },
      );

      if (requestId !== requestIdRef.current) return;

      setTruncated(result.meta.hasNextPage);

      const parsed = result.data
        .map((row) => buildBooking(row as Record<string, unknown>))
        .filter((b): b is VehicleBookingRow => !!b)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      setBookings(parsed);
    } catch (err: unknown) {
      if (isAbortError(err) || requestId !== requestIdRef.current) return;
      setBookings([]);
      setError('Buchungen für dieses Fahrzeug konnten nicht geladen werden.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [horizon.fromIso, horizon.toIso, orgId, vehicle?.id]);

  const handleRangeModeChange = useCallback((mode: TimelineRangeMode) => {
    setRangeMode(mode);
    setRangeAnchor(resolveHorizonAnchorForMode(mode));
  }, []);

  const handleTimelineNavigate = useCallback(
    (direction: -1 | 0 | 1) => {
      if (direction === 0) {
        setRangeAnchor(resolveHorizonAnchorForMode(rangeMode));
        return;
      }
      setRangeAnchor((prev) => shiftTimelineAnchor(prev, rangeMode, direction));
    },
    [rangeMode],
  );

  useEffect(() => {
    void loadBookings();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadBookings]);

  useEffect(() => {
    const onRefresh = () => void loadBookings();
    window.addEventListener('handover:completed', onRefresh as EventListener);
    window.addEventListener(BOOKINGS_LIST_INVALIDATED_EVENT, onRefresh);
    return () => {
      window.removeEventListener('handover:completed', onRefresh as EventListener);
      window.removeEventListener(BOOKINGS_LIST_INVALIDATED_EVENT, onRefresh);
    };
  }, [loadBookings]);

  const handleSelectBooking = useCallback(
    (bookingId: string) => {
      const row = bookings.find((b) => b.id === bookingId);
      if (!row) return;
      setDrawerBookingId(bookingId);
      setDrawerFallback(row);
    },
    [bookings],
  );

  const handleDrawerOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setDrawerBookingId(null);
      setDrawerFallback(null);
    }
  }, []);

  const horizonDays = resolveRangeDays(rangeMode);

  const systemRisks = useMemo(() => detectSystemConflicts(bookings), [bookings]);
  const conflictBookingIds = useMemo(
    () => getTimelineConflictBookingIds(bookings),
    [bookings],
  );

  const vehicleLabel = vehicle
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.license
    : vehicleName || 'Fahrzeug';

  if (error && !loading && bookings.length === 0) {
    return (
      <ErrorState
        title="Buchungsplan nicht verfügbar"
        description="Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut."
        onRetry={() => void loadBookings()}
        retryLabel="Erneut laden"
        className={`${vb.section} ${vb.sectionBody}`}
      />
    );
  }

  return (
    <div className={vb.page} aria-label="Fahrzeug-Buchungen">
      <VehicleBookingsOperatorHeader
        vehicle={vehicle}
        vehicleLabel={vehicleLabel}
        bookings={bookings}
        horizon={{ start: horizon.start, end: horizon.end, totalMs: horizon.totalMs }}
        loading={loading}
        horizonDays={horizonDays}
        systemRisks={systemRisks}
      />

      {!vehicle?.id ? (
        <div className={`${vb.section} ${vb.sectionBody} text-center`} role="status">
          <p className="text-[13px] font-semibold text-foreground">Kein Fahrzeug ausgewählt</p>
          <p className={`${vb.subtitle} mt-1`}>
            Wählen Sie ein Fahrzeug, um Buchungen und Verfügbarkeit zu sehen.
          </p>
        </div>
      ) : (
        <>
          <VehicleBookingReadinessStrip
            bookings={bookings}
            loading={loading}
            onOpenFullBooking={onOpenBooking}
            onOpenVehicleTasks={onOpenVehicleTasks}
          />
          <VehicleAvailabilityTimeline
            horizon={horizon}
            bookings={bookings}
            rangeMode={rangeMode}
            onRangeModeChange={handleRangeModeChange}
            onNavigate={handleTimelineNavigate}
            loading={loading}
            conflictBookingIds={conflictBookingIds}
            onSelectBooking={handleSelectBooking}
            onCreateBooking={onCreateBooking}
          />
        </>
      )}

      <VehicleBookingQuickDrawer
        open={Boolean(drawerBookingId)}
        onOpenChange={handleDrawerOpenChange}
        bookingId={drawerBookingId}
        fallback={drawerFallback}
        onOpenFullBooking={onOpenBooking}
      />

      {truncated && !loading && (
        <p className="text-[11px] text-[color:var(--status-attention)] px-1" role="status">
          Hinweis: Es gibt mehr Buchungen im Zeitraum als geladen werden konnten.
        </p>
      )}

      {error && bookings.length > 0 && (
        <div
          className={`${vb.inset} px-3 py-2.5 text-[11px] border-[color:var(--status-attention)]/25 bg-[color:var(--status-attention-soft)]/30`}
          role="alert"
        >
          Aktualisierung fehlgeschlagen — zuletzt geladene Daten werden angezeigt.{' '}
          <button
            type="button"
            onClick={() => void loadBookings()}
            className={`font-semibold underline ${vb.focusRing}`}
          >
            Erneut laden
          </button>
        </div>
      )}

      <section className={vb.section} aria-labelledby="vb-agenda-title">
        <header className={`${vb.sectionHeader} flex items-start justify-between gap-3`}>
          <div>
            <p className="sq-section-label">Historie &amp; Plan</p>
            <h3 id="vb-agenda-title" className={vb.titleSm}>
              Buchungsagenda
            </h3>
            <p className={`${vb.subtitle} mt-0.5`}>
              Gruppiert nach operativem Status im gewählten Zeitraum.
            </p>
          </div>
        </header>

        <div className={vb.sectionBody}>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : bookings.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="calendar" className="w-5 h-5" aria-hidden />}
              title="Keine Buchungen im Zeitraum"
              description="Dieses Fahrzeug ist im gewählten Horizont vollständig frei."
              action={
                onCreateBooking ? (
                  <button
                    type="button"
                    onClick={onCreateBooking}
                    className={`sq-cta mt-2 ${vbActionClass(true)}`}
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" aria-hidden />
                    Neue Buchung anlegen
                  </button>
                ) : undefined
              }
            />
          ) : (
            <VehicleBookingsAgenda bookings={bookings} onSelectBooking={handleSelectBooking} />
          )}
        </div>
      </section>
    </div>
  );
}
