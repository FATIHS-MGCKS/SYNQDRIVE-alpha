import { useRentalOrg } from '../../rental/RentalContext';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OperatorBookingSheetShell } from '../bookings/operatorBookingSheetShell';
import { OperatorTaskCreateForm } from '../tasks/OperatorTaskCreateForm';
import { OperatorTaskDetail } from '../tasks/OperatorTaskDetail';

type TaskSheetAction =
  | Extract<OperatorSheetAction, { type: 'task-create' }>
  | Extract<OperatorSheetAction, { type: 'task-detail' }>;

interface Props {
  action: TaskSheetAction;
}

export function OperatorTaskSheet({ action }: Props) {
  const { orgId } = useRentalOrg();
  const { closeSheet } = useOperatorShell();

  if (action.type === 'task-detail') {
    return (
      <OperatorBookingSheetShell title="Aufgabe" onClose={closeSheet}>
        <OperatorTaskDetail
          taskId={action.taskId}
          initialTask={action.task}
          focusComment={action.focusComment}
          layout="sheet"
          onTaskUpdated={() => action.onUpdated?.()}
        />
      </OperatorBookingSheetShell>
    );
  }

  if (!orgId) {
    return (
      <OperatorBookingSheetShell title="Aufgabe erstellen" onClose={closeSheet}>
        <p className="text-sm text-muted-foreground">Organisation nicht geladen.</p>
      </OperatorBookingSheetShell>
    );
  }

  return (
    <OperatorBookingSheetShell
      title="Aufgabe erstellen"
      subtitle={action.vehicleLabel || undefined}
      onClose={closeSheet}
    >
      <OperatorTaskCreateForm
        orgId={orgId}
        vehicleId={action.vehicleId || undefined}
        vehicleLabel={action.vehicleLabel}
        bookingId={action.bookingId}
        onCreated={() => {
          action.onSuccess?.();
          closeSheet();
        }}
        onCancel={closeSheet}
      />
    </OperatorBookingSheetShell>
  );
}
