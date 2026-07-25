import { ShieldX } from 'lucide-react';
import { EmptyState } from '../../components/patterns';
import { useOperatorPermissions } from '../hooks/useOperatorPermissions';
import { operatorSheetPermission } from '../lib/operatorPermissionGate.utils';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';

interface Props {
  action: OperatorSheetAction;
}

/** Shown when a sheet was requested without the required operator permission. */
export function OperatorSheetDenied({ action }: Props) {
  const { closeSheet } = useOperatorShell();
  const { reason } = useOperatorPermissions();
  const permission = operatorSheetPermission(action);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="alertdialog"
      aria-modal
      aria-labelledby="operator-sheet-denied-title"
    >
      <div className="flex flex-1 items-center justify-center px-5">
        <EmptyState
          icon={<ShieldX className="h-5 w-5" />}
          title="Aktion nicht erlaubt"
          description={reason(permission)}
          action={
            <button
              type="button"
              onClick={closeSheet}
              className="sq-press min-h-[44px] rounded-xl border border-border surface-premium px-5 text-sm font-semibold"
            >
              Schließen
            </button>
          }
        />
      </div>
    </div>
  );
}
