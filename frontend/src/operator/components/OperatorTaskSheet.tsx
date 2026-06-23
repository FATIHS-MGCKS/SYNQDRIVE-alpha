import { X } from 'lucide-react';
import { useRentalOrg } from '../../rental/RentalContext';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
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
      <TaskSheetShell title="Aufgabe" onClose={closeSheet}>
        <OperatorTaskDetail
          taskId={action.taskId}
          initialTask={action.task}
          focusComment={action.focusComment}
          layout="sheet"
          onTaskUpdated={() => action.onUpdated?.()}
        />
      </TaskSheetShell>
    );
  }

  if (!orgId) {
    return (
      <TaskSheetShell title="Aufgabe erstellen" onClose={closeSheet}>
        <p className="text-sm text-muted-foreground">Organisation nicht geladen.</p>
      </TaskSheetShell>
    );
  }

  return (
    <TaskSheetShell
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
    </TaskSheetShell>
  );
}

function TaskSheetShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
    >
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
          {subtitle && <h2 className="truncate text-base font-bold text-foreground">{subtitle}</h2>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">{children}</div>
    </div>
  );
}
