import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useRentalOrg } from './RentalContext';
import { api } from '../lib/api';
import {
  HandoverProtocolDialog,
  HandoverDialogKind,
  HandoverDialogBookingInfo,
} from './components/handover/HandoverProtocolDialog';

// V4.6.75 — Global handover context.
// Any component inside the rental app can call `openHandover({ bookingId,
// kind, booking? })` to open the canonical pickup / return dialog. The
// provider resolves the full booking + pickup-odometer if only an id is
// passed, fetches the org staff list for the "performed by" dropdown, and
// broadcasts a `handover:completed` CustomEvent on success so sibling
// surfaces (BookingsView, DashboardView tile, RightSidebar) can refresh.

interface HandoverContextValue {
  openHandover: (args: {
    bookingId: string;
    kind: HandoverDialogKind;
    booking?: Partial<HandoverDialogBookingInfo>;
  }) => void;
}

const HandoverCtx = createContext<HandoverContextValue>({
  openHandover: () => {},
});

export function useHandover() {
  return useContext(HandoverCtx);
}

export function HandoverProvider({
  children,
  isDarkMode,
}: {
  children: ReactNode;
  isDarkMode: boolean;
}) {
  const { orgId } = useRentalOrg();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<HandoverDialogKind>('PICKUP');
  const [booking, setBooking] = useState<HandoverDialogBookingInfo | null>(null);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.users
      .listByOrg(orgId)
      .then((rows: any[]) => {
        if (cancelled) return;
        const mapped = (Array.isArray(rows) ? rows : [])
          .map((u: any) => {
            const first = u.firstName ?? u.first_name ?? '';
            const last = u.lastName ?? u.last_name ?? '';
            const email = u.email ?? '';
            const name = `${first} ${last}`.trim() || email;
            return { id: String(u.id), name };
          })
          .filter((o) => o.name);
        setStaffOptions(mapped);
      })
      .catch(() => setStaffOptions([]));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const openHandover: HandoverContextValue['openHandover'] = useCallback(
    async ({ bookingId, kind, booking: seed }) => {
      setKind(kind);
      setIsOpen(true);
      // Optimistically hydrate with whatever the caller passed so the
      // dialog can render a header immediately — then refine with full
      // server data (so pickup odometer / station are accurate).
      if (seed && seed.id && seed.vehicleId) {
        setBooking({
          id: seed.id ?? bookingId,
          vehicleId: seed.vehicleId ?? '',
          vehicleName: seed.vehicleName ?? '—',
          plate: seed.plate ?? '',
          customerName: seed.customerName ?? '',
          startDate: seed.startDate ?? '',
          endDate: seed.endDate ?? '',
          pickupLocation: seed.pickupLocation ?? '',
          returnLocation: seed.returnLocation,
          pickupStationId: seed.pickupStationId,
          returnStationId: seed.returnStationId,
          handoverInstructions: seed.handoverInstructions,
          returnInstructions: seed.returnInstructions,
          status: seed.status,
          includedKm: seed.includedKm,
          pickupOdometerKm: seed.pickupOdometerKm ?? null,
        });
      } else {
        setBooking(null);
      }
      if (!orgId) return;
      try {
        const detail = await api.bookings.detail(orgId, bookingId);
        if (!detail) return;
        const pickupKm =
          kind === 'RETURN' && detail.handover.pickup
            ? detail.handover.pickup.odometerKm
            : null;
        setBooking({
          id: detail.core.bookingId,
          vehicleId: detail.vehicle.vehicleId,
          vehicleName: detail.vehicle.displayName,
          plate: detail.vehicle.licensePlate ?? '',
          customerName: detail.customer.fullName ?? '',
          startDate: detail.core.startDate,
          endDate: detail.core.endDate,
          pickupLocation:
            detail.stations?.pickup?.name ?? detail.core.pickupStationName ?? '',
          returnLocation:
            detail.stations?.return?.name ?? detail.core.returnStationName ?? '',
          pickupStationId: detail.core.pickupStationId,
          returnStationId: detail.core.returnStationId,
          handoverInstructions: detail.stations?.pickup?.handoverInstructions ?? null,
          returnInstructions: detail.stations?.return?.returnInstructions ?? null,
          status: detail.core.status,
          includedKm: detail.core.kmIncluded ?? undefined,
          pickupOdometerKm: pickupKm,
        });
      } catch {
        try {
          const full = await api.bookings.get(orgId, bookingId);
          if (!full) return;
          const pickupKm =
            kind === 'RETURN' && full.pickupProtocol
              ? full.pickupProtocol.odometerKm
              : null;
          setBooking({
            id: full.id,
            vehicleId: full.vehicleId,
            vehicleName: full.vehicleName,
            plate: full.vehicleLicense ?? '',
            customerName: full.customerName ?? '',
            startDate: full.startDate,
            endDate: full.endDate,
            pickupLocation: full.pickupStationName ?? full.station ?? '',
            returnLocation: full.returnStationName ?? full.station ?? '',
            pickupStationId: full.pickupStationId ?? null,
            returnStationId: full.returnStationId ?? null,
            status: full.status,
            includedKm: full.kmIncluded,
            pickupOdometerKm: pickupKm,
          });
        } catch {
          // keep seed data
        }
      }
    },
    [orgId],
  );

  const handleSuccess = useCallback(() => {
    window.dispatchEvent(new CustomEvent('handover:completed'));
  }, []);

  const value = useMemo(() => ({ openHandover }), [openHandover]);

  return (
    <HandoverCtx.Provider value={value}>
      {children}
      <HandoverProtocolDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        kind={kind}
        orgId={orgId}
        booking={booking}
        staffOptions={staffOptions}
        isDarkMode={isDarkMode}
        onSuccess={handleSuccess}
      />
    </HandoverCtx.Provider>
  );
}
