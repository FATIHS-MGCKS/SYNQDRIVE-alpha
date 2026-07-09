import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { CustomerListRow } from './customerDetailTypes';
import { customerStatusUiToApi, customerStatusUiLabelDe } from '../../lib/entityMappers';

export type CustomerStatusChoice =
  | 'Active'
  | 'Under Review'
  | 'Suspended'
  | 'Blocked'
  | 'Inactive';

const STATUS_OPTIONS: { value: CustomerStatusChoice; label: string }[] = [
  { value: 'Active', label: 'Aktiv' },
  { value: 'Under Review', label: 'In Prüfung' },
  { value: 'Suspended', label: 'Suspendiert' },
  { value: 'Blocked', label: 'Gesperrt' },
  { value: 'Inactive', label: 'Inaktiv / Archiviert' },
];

function requiresReason(status: CustomerStatusChoice, current: CustomerListRow['status']): boolean {
  if (status === 'Suspended' || status === 'Blocked' || status === 'Inactive') return true;
  if (
    (current === 'Suspended' || current === 'Blocked') &&
    status === 'Active'
  ) {
    return true;
  }
  return false;
}

function toStatusChoice(status: CustomerListRow['status']): CustomerStatusChoice {
  if (status === 'Archived') return 'Inactive';
  return status as CustomerStatusChoice;
}

interface CustomerStatusModalProps {
  open: boolean;
  currentStatus: CustomerListRow['status'];
  saving?: boolean;
  onClose: () => void;
  onConfirm: (status: CustomerStatusChoice, reason?: string) => void;
}

export function CustomerStatusModal({
  open,
  currentStatus,
  saving,
  onClose,
  onConfirm,
}: CustomerStatusModalProps) {
  const [nextStatus, setNextStatus] = useState<CustomerStatusChoice>(toStatusChoice(currentStatus));
  const [reason, setReason] = useState('');

  if (!open) return null;

  const needReason = requiresReason(nextStatus, toStatusChoice(currentStatus));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border surface-premium shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Kundenstatus ändern</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aktuell: <strong>{customerStatusUiLabelDe(currentStatus)}</strong>
        </p>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Neuer Status
          </label>
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as CustomerStatusChoice)}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border surface-premium"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Grund {needReason ? '(Pflicht)' : '(optional)'}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border surface-premium resize-none"
            placeholder="Begründung für die Statusänderung…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-border"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={saving || (needReason && !reason.trim())}
            onClick={() => onConfirm(nextStatus, reason.trim() || undefined)}
            className="px-3 py-2 text-xs font-semibold rounded-lg sq-tone-brand disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Status speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { customerStatusUiToApi };
