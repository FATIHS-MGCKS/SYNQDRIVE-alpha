import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OperatorTab } from '../lib/operatorTypes';
import {
  buildOperatorBookingUrl,
  buildOperatorDraftUrl,
  buildOperatorHandoverUrl,
  buildOperatorPath,
  buildOperatorReturnUrl,
  buildOperatorTabUrl,
  buildOperatorTaskUrl,
  buildOperatorVehicleDamageUrl,
  buildOperatorVehicleUrl,
  type ParsedOperatorRoute,
} from '../lib/operatorRoutes';

export function useOperatorNavigation() {
  const navigate = useNavigate();

  const goToTab = useCallback(
    (tab: OperatorTab, options?: { replace?: boolean }) => {
      navigate(buildOperatorTabUrl(tab), { replace: options?.replace ?? false });
    },
    [navigate],
  );

  const openVehicle = useCallback(
    (vehicleId: string) => {
      navigate(buildOperatorVehicleUrl(vehicleId));
    },
    [navigate],
  );

  const openBooking = useCallback(
    (bookingId: string) => {
      navigate(buildOperatorBookingUrl(bookingId));
    },
    [navigate],
  );

  const openHandover = useCallback(
    (bookingId: string) => {
      navigate(buildOperatorHandoverUrl(bookingId));
    },
    [navigate],
  );

  const openReturn = useCallback(
    (bookingId: string) => {
      navigate(buildOperatorReturnUrl(bookingId));
    },
    [navigate],
  );

  const openTask = useCallback(
    (taskId: string) => {
      navigate(buildOperatorTaskUrl(taskId));
    },
    [navigate],
  );

  const openDamage = useCallback(
    (vehicleId: string) => {
      navigate(buildOperatorVehicleDamageUrl(vehicleId));
    },
    [navigate],
  );

  const openDraft = useCallback(
    (draftId: string) => {
      navigate(buildOperatorDraftUrl(draftId));
    },
    [navigate],
  );

  const closeProcess = useCallback(
    (fallback: ParsedOperatorRoute = { kind: 'home' }) => {
      navigate(buildOperatorPath(fallback), { replace: true });
    },
    [navigate],
  );

  return {
    goToTab,
    openVehicle,
    openBooking,
    openHandover,
    openReturn,
    openTask,
    openDamage,
    openDraft,
    closeProcess,
  };
}
