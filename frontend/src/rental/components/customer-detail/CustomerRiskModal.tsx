import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { customerRiskUiLabelDe, customerRiskUiToApi } from '../../lib/entityMappers';
import type { CustomerListRow } from './customerDetailTypes';

export type CustomerRiskChoice = CustomerListRow['riskLevel'];

const RISK_OPTIONS: CustomerRiskChoice[] = [
  'Not Assessed',
  'Low Risk',
  'Medium Risk',
  'High Risk',
];

interface CustomerRiskModalProps {
  open: boolean;
  currentRisk: CustomerRiskChoice;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (risk: CustomerRiskChoice, reason?: string) => void;
}

export function CustomerRiskModal({
  open,
  currentRisk,
  saving,
  onClose,
  onConfirm,
}: CustomerRiskModalProps) {
  const [nextRisk, setNextRisk] = useState<CustomerRiskChoice>(currentRisk);
  const [reason, setReason] = useState('');

  if (!open) return null;

  const needReason = nextRisk !== 'Not Assessed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Risikostufe setzen</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aktuell: <strong>{customerRiskUiLabelDe(currentRisk)}</strong>
        </p>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Risikostufe
          </label>
          <select
            value={nextRisk}
            onChange={(e) => setNextRisk(e.target.value as CustomerRiskChoice)}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border bg-card"
          >
            {RISK_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {customerRiskUiLabelDe(r)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Grund {needReason ? '(Pflicht)' : ''}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={!needReason}
            className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-border bg-card resize-none disabled:opacity-50"
            placeholder={needReason ? 'Begründung für die Risikoeinstufung…' : 'Bei „Nicht bewertet“ kein Grund nötig'}
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
            onClick={() =>
              onConfirm(nextRisk, needReason ? reason.trim() : undefined)
            }
            className="px-3 py-2 text-xs font-semibold rounded-lg sq-tone-brand disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Risiko speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { customerRiskUiToApi };
