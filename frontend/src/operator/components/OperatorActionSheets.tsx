import { OperatorBookingCancelSheet } from '../bookings/OperatorBookingCancelSheet';
import { OperatorBookingFormSheet } from '../bookings/OperatorBookingFormSheet';
import { OperatorBookingNoShowSheet } from '../bookings/OperatorBookingNoShowSheet';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorPickupCheckSheet } from '../verification/OperatorPickupCheckSheet';
import { OperatorAiUploadSheet } from './OperatorAiUploadSheet';
import { OperatorTireMeasureSheet } from './OperatorTireMeasureSheet';
import { OperatorTaskSheet } from './OperatorTaskSheet';
import { useOperatorPermissions } from '../hooks/useOperatorPermissions';
import { operatorSheetPermission } from '../lib/operatorPermissionGate.utils';
import { OperatorSheetDenied } from './OperatorSheetDenied';

export function OperatorActionSheets() {
  const { sheetAction, closeSheet } = useOperatorShell();
  const { loading, can } = useOperatorPermissions();

  if (!sheetAction) return null;

  if (!loading) {
    const required = operatorSheetPermission(sheetAction);
    if (!can(required)) {
      return <OperatorSheetDenied action={sheetAction} />;
    }
  }

  if (sheetAction.type === 'ai-upload') {
    return <OperatorAiUploadSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'task-create' || sheetAction.type === 'task-detail') {
    return <OperatorTaskSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'booking-create' || sheetAction.type === 'booking-edit') {
    return <OperatorBookingFormSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'booking-cancel') {
    return <OperatorBookingCancelSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'booking-no-show') {
    return <OperatorBookingNoShowSheet action={sheetAction} />;
  }
  if (sheetAction.type === 'pickup-verification') {
    return (
      <OperatorPickupCheckSheet
        customerId={sheetAction.customerId}
        bookingId={sheetAction.bookingId}
        customerName={sheetAction.customerName}
        onClose={closeSheet}
        onSuccess={sheetAction.onSuccess}
      />
    );
  }
  return <OperatorTireMeasureSheet action={sheetAction} />;
}
