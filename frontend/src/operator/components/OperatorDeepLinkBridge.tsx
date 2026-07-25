import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useOperatorShell } from '../context/OperatorShellContext';
import { resolveOperatorDeepLink } from '../lib/operatorRoutes';

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
    const intent = resolveOperatorDeepLink(
      location.pathname,
      new URLSearchParams(location.search),
      {
        vehicleId: params.vehicleId,
        bookingId: params.bookingId,
        taskId: params.taskId,
        draftId: params.draftId,
      },
    );
    if (!intent) return;

    switch (intent.type) {
      case 'vehicle':
      case 'vehicle-damage':
        setActiveTab('scan');
        setFocusedBookingId(null);
        setSelectedVehicleId(intent.vehicleId);
        break;
      case 'booking':
      case 'booking-handover':
      case 'booking-return':
        setActiveTab('scan');
        setSelectedVehicleId(null);
        setFocusedBookingId(intent.bookingId);
        break;
      case 'task':
        setActiveTab('tasks');
        break;
      case 'draft':
        setActiveTab('scan');
        break;
      case 'scan':
        setActiveTab('scan');
        setScanQuery(intent.query);
        setFocusedBookingId(null);
        break;
      case 'tab':
        setActiveTab(intent.tab);
        break;
      default:
        break;
    }
  }, [
    location.pathname,
    location.search,
    params.vehicleId,
    params.bookingId,
    params.taskId,
    params.draftId,
    setActiveTab,
    setSelectedVehicleId,
    setScanQuery,
    setFocusedBookingId,
  ]);

  return null;
}
