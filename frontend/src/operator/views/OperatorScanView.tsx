import { useEffect, useRef, useState } from 'react';
import { ScanLine, Search } from 'lucide-react';
import { EmptyState, SkeletonRows } from '../../components/patterns';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorScanSearch } from '../hooks/useOperatorScanSearch';
import { OperatorBookingDetailSheet } from '../components/OperatorBookingDetailSheet';
import { OperatorScanBookingCard } from '../components/OperatorScanBookingCard';
import { OperatorScanVehicleCard } from '../components/OperatorScanVehicleCard';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { OperatorVehicleQuickView } from '../components/OperatorVehicleQuickView';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import type { OperatorScanBookingHit } from '../hooks/useOperatorScanSearch';
import { mapScanBookingToDetailItem, toHandoverBookingSeed } from '../lib/operatorData';
import type { OperatorTodayBookingItem } from '../lib/operatorData';

export function OperatorScanView() {
  const {
    scanQuery,
    setScanQuery,
    selectedVehicleId,
    setSelectedVehicleId,
    focusedBookingId,
    setFocusedBookingId,
    refreshToken,
  } = useOperatorShell();
  const { tasksByVehicleId } = useOperatorData();
  const { openHandover } = useOperatorHandover();
  const isTablet = useOperatorTabletLayout();
  const [detailItem, setDetailItem] = useState<OperatorTodayBookingItem | null>(null);
  const autoOpenedBookingRef = useRef<string | null>(null);

  const {
    vehicles,
    healthMap,
    bookings,
    focusedBooking,
    loading,
    bookingsError,
    hasQuery,
  } = useOperatorScanSearch(scanQuery, focusedBookingId, refreshToken);

  useEffect(() => {
    if (focusedBooking?.vehicleId && !selectedVehicleId) {
      setScanQuery(focusedBooking.plate || focusedBooking.vehicleName || focusedBooking.bookingId);
    }
  }, [focusedBooking, selectedVehicleId, setScanQuery]);

  useEffect(() => {
    if (!focusedBookingId || !focusedBooking) return;
    if (autoOpenedBookingRef.current === focusedBookingId) return;
    autoOpenedBookingRef.current = focusedBookingId;
    setDetailItem(mapScanBookingToDetailItem(focusedBooking));
  }, [focusedBookingId, focusedBooking]);

  useEffect(() => {
    if (!focusedBookingId) {
      autoOpenedBookingRef.current = null;
    }
  }, [focusedBookingId]);

  useEffect(() => {
    if (vehicles.length === 1 && scanQuery.trim().length >= 3 && !focusedBookingId) {
      setSelectedVehicleId(vehicles[0]!.id);
    }
  }, [vehicles, scanQuery, focusedBookingId, setSelectedVehicleId]);

  const openBookingVehicle = (booking: OperatorScanBookingHit) => {
    if (booking.vehicleId) {
      setFocusedBookingId(null);
      setSelectedVehicleId(booking.vehicleId);
    }
  };

  const openBookingDetails = (booking: OperatorScanBookingHit) => {
    setDetailItem(mapScanBookingToDetailItem(booking));
  };

  const startBookingHandover = (booking: OperatorScanBookingHit, kind: 'PICKUP' | 'RETURN') => {
    const item = mapScanBookingToDetailItem(booking);
    openHandover({
      bookingId: booking.bookingId,
      kind,
      booking: toHandoverBookingSeed(item),
    });
  };

  const listContent = (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <div className="shrink-0 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Kennzeichen, Fahrzeug oder Buchungs-ID"
            value={scanQuery}
            onChange={(e) => {
              setScanQuery(e.target.value);
              setFocusedBookingId(null);
            }}
            className="h-14 w-full rounded-2xl border border-border/70 surface-premium pl-12 pr-4 text-lg shadow-[var(--shadow-1)] outline-none focus:border-[color:var(--brand)]/40"
          />
        </div>

        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-center">
          <ScanLine className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">Kennzeichen eingeben</p>
          <p className="mt-1 text-xs text-muted-foreground">
            QR-Scanner später verfügbar — WebApp/PWA ohne native Scanner-Library im MVP.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3">
        {loading && hasQuery && <SkeletonRows rows={4} />}

        {!loading && bookingsError && (
          <p className="text-xs text-[color:var(--status-critical)]">{bookingsError}</p>
        )}

        {!loading && !hasQuery && (
          <EmptyState
            compact
            icon={<ScanLine className="h-5 w-5" />}
            title="Fahrzeug oder Buchung suchen"
            description="Kennzeichen, Modell oder Buchungs-ID eingeben — oder Deep-Link öffnen."
          />
        )}

        {!loading && hasQuery && bookings.length === 0 && vehicles.length === 0 && (
          <EmptyState
            compact
            icon={<Search className="h-5 w-5" />}
            title="Kein Treffer"
            description="Anderes Kennzeichen, Fahrzeugname oder Buchungs-ID versuchen."
          />
        )}

        {bookings.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Buchungen</p>
            {bookings.map((b) => (
              <OperatorScanBookingCard
                key={b.bookingId}
                booking={b}
                highlighted={focusedBookingId === b.bookingId}
                onDetails={() => openBookingDetails(b)}
                onOpenVehicle={() => openBookingVehicle(b)}
                onPickup={() => startBookingHandover(b, 'PICKUP')}
                onReturn={() => startBookingHandover(b, 'RETURN')}
              />
            ))}
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Fahrzeuge</p>
            {vehicles.map((v) => (
              <OperatorScanVehicleCard
                key={v.id}
                vehicle={v}
                health={healthMap.get(v.id)}
                openTaskCount={tasksByVehicleId.get(v.id) ?? 0}
                onOpenVehicle={() => {
                  setFocusedBookingId(null);
                  setSelectedVehicleId(v.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const detail = selectedVehicleId ? (
    <OperatorVehicleQuickView
      vehicleId={selectedVehicleId}
      onClose={() => setSelectedVehicleId(null)}
    />
  ) : (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      Fahrzeug aus der Suche wählen
    </div>
  );

  return (
    <>
      {isTablet ? (
        <OperatorTabletFrame list={listContent} detail={detail} showDetail={Boolean(selectedVehicleId)} />
      ) : selectedVehicleId ? (
        <div className="space-y-4">
          <button
            type="button"
            className="min-h-[44px] text-sm font-semibold text-[color:var(--brand-ink)]"
            onClick={() => setSelectedVehicleId(null)}
          >
            ← Zurück zur Suche
          </button>
          <OperatorVehicleQuickView vehicleId={selectedVehicleId} />
        </div>
      ) : (
        listContent
      )}
      <OperatorBookingDetailSheet
        item={detailItem}
        onClose={() => {
          setDetailItem(null);
          if (focusedBookingId) setFocusedBookingId(null);
        }}
        onPickupStart={(item) => startBookingHandover(
          {
            bookingId: item.bookingId,
            vehicleId: item.vehicleId,
            vehicleName: item.vehicleName,
            plate: item.plate,
            customerName: item.customerName,
            status: item.status,
            startDate: item.raw.startDate,
            endDate: item.raw.endDate,
          },
          'PICKUP',
        )}
        onReturnStart={(item) => startBookingHandover(
          {
            bookingId: item.bookingId,
            vehicleId: item.vehicleId,
            vehicleName: item.vehicleName,
            plate: item.plate,
            customerName: item.customerName,
            status: item.status,
            startDate: item.raw.startDate,
            endDate: item.raw.endDate,
          },
          'RETURN',
        )}
      />
    </>
  );
}
