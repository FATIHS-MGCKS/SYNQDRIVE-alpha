import { useCallback } from 'react';
import type { ApiTask, CompleteTaskPayload } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { taskRequiresResolutionNote } from '../../rental/lib/task-detail.utils';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorShell } from '../context/OperatorShellContext';
import type { OperatorTaskCardActionKind } from './operatorTaskCard.utils';
import { useOperatorTaskActions } from './useOperatorTaskActions';

export interface UseOperatorTaskCardControllerOptions {
  onTaskChanged?: () => void | Promise<void>;
  onOpenTask: (task: ApiTask, options?: { focusComment?: boolean }) => void;
}

export function useOperatorTaskCardController({
  onTaskChanged,
  onOpenTask,
}: UseOperatorTaskCardControllerOptions) {
  const { userRole, hasPermission } = useRentalOrg();
  const { setPendingTasksBookingId, setActiveTab, setSelectedVehicleId } = useOperatorShell();
  const { openHandover } = useOperatorHandover();

  const canOverrideChecklist =
    userRole === 'ORG_ADMIN' ||
    userRole === 'MASTER_ADMIN' ||
    hasPermission('tasks', 'manage');

  const { mutating, start, waiting, complete } = useOperatorTaskActions(() => {
    void onTaskChanged?.();
  });

  const handleAction = useCallback(
    async (task: ApiTask, kind: OperatorTaskCardActionKind): Promise<string | null> => {
      try {
        switch (kind) {
          case 'start':
          case 'resume':
            await start(task.id);
            return null;
          case 'waiting':
            await waiting(task.id);
            return null;
          case 'complete':
            if (taskRequiresResolutionNote(task.type)) {
              onOpenTask(task);
              return null;
            }
            await complete(task.id);
            return null;
          case 'comment':
            onOpenTask(task, { focusComment: true });
            return null;
          case 'open-task':
          case 'open-document-package':
          case 'open-invoice':
          case 'open-service-case':
            onOpenTask(task);
            return null;
          case 'open-booking':
            if (task.bookingId) {
              setPendingTasksBookingId(task.bookingId);
              setActiveTab('tasks');
              return null;
            }
            onOpenTask(task);
            return null;
          case 'open-vehicle':
            if (task.vehicleId) {
              setSelectedVehicleId(task.vehicleId);
              setActiveTab('vehicles');
              return null;
            }
            onOpenTask(task);
            return null;
          case 'open-handover-pickup':
            if (task.bookingId) {
              openHandover({
                bookingId: task.bookingId,
                kind: 'PICKUP',
                booking: { id: task.bookingId, vehicleId: task.vehicleId ?? '' },
              });
              return null;
            }
            onOpenTask(task);
            return null;
          case 'open-handover-return':
            if (task.bookingId) {
              openHandover({
                bookingId: task.bookingId,
                kind: 'RETURN',
                booking: { id: task.bookingId, vehicleId: task.vehicleId ?? '' },
              });
              return null;
            }
            onOpenTask(task);
            return null;
          default:
            onOpenTask(task);
            return null;
        }
      } catch (error) {
        return error instanceof Error ? error.message : 'Aktion fehlgeschlagen';
      }
    },
    [
      complete,
      onOpenTask,
      openHandover,
      setActiveTab,
      setPendingTasksBookingId,
      setSelectedVehicleId,
      start,
      waiting,
    ],
  );

  return {
    mutating,
    canOverrideChecklist,
    handleAction,
    completeWithNote: (taskId: string, payload?: CompleteTaskPayload) => complete(taskId, payload),
  };
}
