import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OPERATOR_BASE_PATH, resolveOperatorDeepLink } from '../lib/operatorRoutes';

/** Applies `/operator` deep-link path + query params to shell state. */
export function OperatorDeepLinkBridge() {
  const location = useLocation();
  const params = useParams();
  const {
    setActiveTab,
    setSelectedVehicleId,
    setScanQuery,
    setFocusedBookingId,
  } = useOperatorShell();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const intent = resolveOperatorDeepLink(
      location.pathname,
      searchParams,
      {
        vehicleId: params.vehicleId,
        bookingId: params.bookingId,
      },
    );
    if (!intent) {
      const onOperatorHome =
        location.pathname === OPERATOR_BASE_PATH ||
        location.pathname === `${OPERATOR_BASE_PATH}/`;
      if (onOperatorHome) {
        const tab = searchParams.get('tab')?.trim();
        const hasQueryIntent = Boolean(
          searchParams.get('vehicleId')?.trim() ||
            searchParams.get('bookingId')?.trim() ||
            searchParams.get('q')?.trim() ||
            (tab && ['today', 'scan', 'vehicles', 'tasks', 'more'].includes(tab)),
        );
        if (!hasQueryIntent) {
          setSelectedVehicleId(null);
          setFocusedBookingId(null);
        }
      }
      return;
    }

    switch (intent.type) {
      case 'vehicle':
        setActiveTab('scan');
        setFocusedBookingId(null);
        setSelectedVehicleId(intent.vehicleId);
        break;
      case 'booking':
        setActiveTab('scan');
        setSelectedVehicleId(null);
        setFocusedBookingId(intent.bookingId);
        break;
      case 'scan':
        setActiveTab('scan');
        setScanQuery(intent.query);
        setFocusedBookingId(null);
        break;
      case 'tab':
        setActiveTab(intent.tab);
        if (intent.tab !== 'scan') {
          setSelectedVehicleId(null);
          setFocusedBookingId(null);
        }
        break;
      default:
        break;
    }
  }, [
    location.pathname,
    location.search,
    params.vehicleId,
    params.bookingId,
    setActiveTab,
    setSelectedVehicleId,
    setScanQuery,
    setFocusedBookingId,
  ]);

  return null;
}
