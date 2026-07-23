import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import type {
  HandoverDialogBookingInfo,
  HandoverDialogKind,
} from '../../rental/components/handover/HandoverProtocolDialog';
import { OperatorHandoverFlow } from './OperatorHandoverFlow';
import { invalidateVehicleOperationalState } from '../../rental/lib/vehicle-operational-query';

export interface OperatorHandoverOpenArgs {
  bookingId: string;
  kind: HandoverDialogKind;
  booking?: Partial<HandoverDialogBookingInfo>;
}

interface OperatorHandoverContextValue {
  openHandover: (args: OperatorHandoverOpenArgs) => void;
}

const OperatorHandoverCtx = createContext<OperatorHandoverContextValue>({
  openHandover: () => {},
});

export function useOperatorHandover() {
  return useContext(OperatorHandoverCtx);
}

/** Drop-in for rental `useHandover` inside Operator shell. */
export function useHandover() {
  return useOperatorHandover();
}

export function OperatorHandoverProvider({
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
      .then((rows: unknown[]) => {
        if (cancelled) return;
        const mapped = (Array.isArray(rows) ? rows : [])
          .map((u) => {
            const row = u as Record<string, unknown>;
            const first = String(row.firstName ?? row.first_name ?? '');
            const last = String(row.lastName ?? row.last_name ?? '');
            const email = String(row.email ?? '');
            const name = `${first} ${last}`.trim() || email;
            return { id: String(row.id), name };
          })
          .filter((o) => o.name);
        setStaffOptions(mapped);
      })
      .catch(() => setStaffOptions([]));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const openHandover = useCallback(
    async ({ bookingId, kind: nextKind, booking: seed }: OperatorHandoverOpenArgs) => {
      setKind(nextKind);
      setIsOpen(true);

      if (seed?.id && seed.vehicleId) {
        setBooking({
          id: seed.id ?? bookingId,
          vehicleId: seed.vehicleId ?? '',
          customerId: seed.customerId ?? null,
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
          updatedAt: seed.updatedAt,
        });
      } else {
        setBooking(null);
      }

      if (!orgId) return;
      try {
        const detail = await api.bookings.detail(orgId, bookingId);
        if (!detail) return;
        const pickupKm =
          nextKind === 'RETURN' && detail.handover.pickup
            ? detail.handover.pickup.odometerKm
            : null;
        setBooking({
          id: detail.core.bookingId,
          vehicleId: detail.vehicle.vehicleId,
          customerId: detail.customer.customerId,
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
          updatedAt: detail.core.updatedAt,
        });
      } catch {
        try {
          const full = await api.bookings.get(orgId, bookingId);
          if (!full) return;
          const pickupKm =
            nextKind === 'RETURN' && full.pickupProtocol
              ? full.pickupProtocol.odometerKm
              : null;
          setBooking({
            id: full.id,
            vehicleId: full.vehicleId,
            customerId: full.customerId ?? null,
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
            updatedAt: full.updatedAt ?? undefined,
          });
        } catch {
          /* keep seed */
        }
      }
    },
    [orgId],
  );

  const handleSuccess = useCallback(() => {
    if (orgId && booking?.vehicleId) {
      void invalidateVehicleOperationalState({
        orgId,
        vehicleIds: [booking.vehicleId],
        reason: kind === 'PICKUP' ? 'handover-pickup' : 'handover-return',
        optimistic: kind === 'PICKUP' ? 'pickup' : 'return',
        bookingContext: {
          bookingId: booking.id,
          customerName: booking.customerName,
          returnAt: booking.endDate,
          returnStationName: booking.returnLocation ?? null,
        },
      });
    }
    window.dispatchEvent(new CustomEvent('handover:completed'));
  }, [booking, orgId, kind]);

  const value = useMemo(() => ({ openHandover }), [openHandover]);

  return (
    <OperatorHandoverCtx.Provider value={value}>
      {children}
      <OperatorHandoverFlow
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        kind={kind}
        orgId={orgId}
        booking={booking}
        staffOptions={staffOptions}
        isDarkMode={isDarkMode}
        onSuccess={handleSuccess}
      />
    </OperatorHandoverCtx.Provider>
  );
}
