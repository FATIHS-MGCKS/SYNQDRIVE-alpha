import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import type {
  HandoverDialogBookingInfo,
  HandoverDialogKind,
} from '../../rental/components/handover/HandoverProtocolDialog';
import { mapOperatorContextToHandoverBooking, operatorApi } from '../lib/operatorApi';
import {
  buildOperatorBookingUrl,
  buildOperatorHandoverUrl,
  buildOperatorReturnUrl,
  parseOperatorPath,
} from '../lib/operatorRoutes';
import { OperatorHandoverFlow } from './OperatorHandoverFlow';
import { invalidateVehicleOperationalState } from '../../rental/lib/vehicle-operational-query';

export interface OperatorHandoverOpenArgs {
  bookingId: string;
  kind: HandoverDialogKind;
  booking?: Partial<HandoverDialogBookingInfo>;
}

interface OperatorHandoverContextValue {
  openHandover: (args: OperatorHandoverOpenArgs) => void | Promise<void>;
  closeHandover: () => void;
  isHandoverOpen: boolean;
}

const OperatorHandoverCtx = createContext<OperatorHandoverContextValue>({
  openHandover: () => {},
  closeHandover: () => {},
  isHandoverOpen: false,
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
  const navigate = useNavigate();
  const location = useLocation();
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
      const targetPath =
        nextKind === 'RETURN'
          ? buildOperatorReturnUrl(bookingId)
          : buildOperatorHandoverUrl(bookingId);
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }

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
        });
      } else {
        setBooking(null);
      }

      if (!orgId) return;
      try {
        const ctx = await operatorApi.getBookingContext(orgId, bookingId, nextKind);
        setBooking(mapOperatorContextToHandoverBooking(ctx, nextKind));
      } catch {
        /* keep seed */
      }
    },
    [orgId, location.pathname, navigate],
  );

  const closeHandover = useCallback(() => {
    setIsOpen(false);
    const route = parseOperatorPath(location.pathname);
    if (route?.kind === 'draft' && booking?.id) {
      navigate(buildOperatorBookingUrl(booking.id), { replace: true });
      return;
    }
    if (route?.kind === 'booking-handover' || route?.kind === 'booking-return') {
      const bookingId = route.bookingId ?? booking?.id;
      if (bookingId) {
        navigate(buildOperatorBookingUrl(bookingId), { replace: true });
        return;
      }
      navigate('/operator', { replace: true });
    }
  }, [booking?.id, location.pathname, navigate]);

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

  const value = useMemo(
    () => ({ openHandover, closeHandover, isHandoverOpen: isOpen }),
    [openHandover, closeHandover, isOpen],
  );

  return (
    <OperatorHandoverCtx.Provider value={value}>
      {children}
      <OperatorHandoverFlow
        isOpen={isOpen}
        onClose={closeHandover}
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
