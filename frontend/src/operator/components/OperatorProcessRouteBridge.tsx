import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { isApiHttpError } from '../../lib/httpError';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorNavigation } from '../hooks/useOperatorNavigation';
import { mapOperatorContextToHandoverBooking, operatorApi } from '../lib/operatorApi';
import {
  assertOperatorRouteId,
  evaluateDraftResume,
  evaluateHandoverResume,
  mapHttpStatusToRouteError,
  type OperatorRouteResumeError,
} from '../lib/operatorRouteResume';
import {
  buildOperatorHandoverUrl,
  buildOperatorReturnUrl,
  buildOperatorTabUrl,
  isOperatorProcessRoute,
  parseOperatorPath,
} from '../lib/operatorRoutes';
import { OperatorRouteError } from './OperatorRouteError';

/** Resumes operator process routes from server data (refresh-safe deep links). */
export function OperatorProcessRouteBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgId } = useRentalOrg();
  const { openHandover, closeHandover } = useOperatorHandover();
  const { openDamageCapture, closeDamageCapture } = useOperatorDamageCapture();
  const { closeProcess } = useOperatorNavigation();
  const [routeError, setRouteError] = useState<OperatorRouteResumeError | null>(null);
  const resumeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const route = parseOperatorPath(location.pathname);
    const resumeKey = route ? `${location.pathname}|${orgId ?? ''}` : null;

    if (!route || !orgId) {
      resumeKeyRef.current = null;
      return;
    }

    if (!isOperatorProcessRoute(route)) {
      resumeKeyRef.current = null;
      closeHandover();
      closeDamageCapture();
      return;
    }

    if (resumeKeyRef.current === resumeKey) {
      return;
    }
    resumeKeyRef.current = resumeKey;

    let cancelled = false;

    const fail = (error: OperatorRouteResumeError) => {
      if (cancelled) return;
      closeHandover();
      closeDamageCapture();
      setRouteError(error);
    };

    const resume = async () => {
      setRouteError(null);

      if (route.kind === 'booking-handover' || route.kind === 'booking-return') {
        const kind = route.kind === 'booking-return' ? 'RETURN' : 'PICKUP';
        const idError = assertOperatorRouteId(route.bookingId, 'Buchungs-ID');
        if (idError) {
          fail(idError);
          return;
        }
        try {
          const ctx = await operatorApi.getBookingContext(orgId, route.bookingId!, kind);
          const gate = evaluateHandoverResume(ctx, kind);
          if (gate) {
            fail(gate);
            return;
          }
          if (cancelled) return;
          await openHandover({
            bookingId: route.bookingId!,
            kind,
            booking: mapOperatorContextToHandoverBooking(ctx, kind),
          });
        } catch (err) {
          if (cancelled) return;
          if (isApiHttpError(err)) {
            fail(mapHttpStatusToRouteError(err.status, 'Übergabe nicht verfügbar'));
          } else {
            fail({
              code: 'not-found',
              title: 'Übergabe nicht verfügbar',
              message: 'Der Vorgang konnte nicht geladen werden.',
            });
          }
        }
        return;
      }

      if (route.kind === 'vehicle-damage') {
        const idError = assertOperatorRouteId(route.vehicleId, 'Fahrzeug-ID');
        if (idError) {
          fail(idError);
          return;
        }
        try {
          const vehicle = await operatorApi.getVehicleResume(orgId, route.vehicleId!);
          if (cancelled) return;
          openDamageCapture({
            vehicleId: vehicle.vehicleId,
            vehicleName: vehicle.displayName,
            plate: vehicle.licensePlate,
            skipVehicleConfirm: true,
          });
        } catch (err) {
          if (cancelled) return;
          if (isApiHttpError(err)) {
            fail(mapHttpStatusToRouteError(err.status, 'Schadenerfassung nicht verfügbar'));
          } else {
            fail({
              code: 'not-found',
              title: 'Schadenerfassung nicht verfügbar',
              message: 'Das Fahrzeug konnte nicht geladen werden.',
            });
          }
        }
        return;
      }

      if (route.kind === 'task') {
        const idError = assertOperatorRouteId(route.taskId, 'Aufgaben-ID');
        if (idError) {
          fail(idError);
          return;
        }
        try {
          await api.tasks.get(orgId, route.taskId!);
        } catch (err) {
          if (cancelled) return;
          if (isApiHttpError(err)) {
            fail(mapHttpStatusToRouteError(err.status, 'Aufgabe nicht verfügbar'));
          } else {
            fail({
              code: 'not-found',
              title: 'Aufgabe nicht verfügbar',
              message: 'Die Aufgabe konnte nicht geladen werden.',
            });
          }
        }
        return;
      }

      if (route.kind === 'draft') {
        const idError = assertOperatorRouteId(route.draftId, 'Entwurfs-ID');
        if (idError) {
          fail(idError);
          return;
        }
        try {
          const resumeInfo = await operatorApi.getHandoverSessionResume(orgId, route.draftId!);
          if (!resumeInfo.editable || resumeInfo.expired) {
            fail({
              code: resumeInfo.expired ? 'draft-cancelled' : 'finalized',
              title: resumeInfo.expired ? 'Entwurf abgelaufen' : 'Entwurf nicht verfügbar',
              message: resumeInfo.expired
                ? 'Der Übergabe-Entwurf ist abgelaufen und kann nicht fortgesetzt werden.'
                : 'Der Übergabe-Entwurf wurde abgebrochen oder ist nicht mehr bearbeitbar.',
            });
            return;
          }
          const view = await api.bookings.getHandoverDraft(
            orgId,
            resumeInfo.bookingId,
            resumeInfo.kind,
          );
          const draftError = evaluateDraftResume(view);
          if (draftError) {
            fail(draftError);
            return;
          }
          if (cancelled) return;
          const target =
            resumeInfo.kind === 'RETURN'
              ? buildOperatorReturnUrl(resumeInfo.bookingId)
              : buildOperatorHandoverUrl(resumeInfo.bookingId);
          if (location.pathname !== target) {
            navigate(target, { replace: true });
            resumeKeyRef.current = null;
            return;
          }
          const ctx = await operatorApi.getBookingContext(orgId, resumeInfo.bookingId, resumeInfo.kind);
          await openHandover({
            bookingId: resumeInfo.bookingId,
            kind: resumeInfo.kind,
            booking: mapOperatorContextToHandoverBooking(ctx, resumeInfo.kind),
          });
        } catch (err) {
          if (cancelled) return;
          if (isApiHttpError(err)) {
            fail(mapHttpStatusToRouteError(err.status, 'Entwurf nicht verfügbar'));
          } else {
            fail({
              code: 'not-found',
              title: 'Entwurf nicht verfügbar',
              message: 'Der Entwurf konnte nicht geladen werden.',
            });
          }
        }
      }
    };

    void resume();

    return () => {
      cancelled = true;
    };
  }, [
    location.pathname,
    orgId,
    openHandover,
    closeHandover,
    openDamageCapture,
    closeDamageCapture,
    navigate,
  ]);

  if (!routeError) return null;

  return (
    <OperatorRouteError
      error={routeError}
      onDismiss={() => {
        setRouteError(null);
        resumeKeyRef.current = null;
        closeProcess({ kind: 'home' });
        navigate(buildOperatorTabUrl('today'), { replace: true });
      }}
    />
  );
}
