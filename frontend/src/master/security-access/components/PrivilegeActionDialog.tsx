import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';

export type PrivilegeActionCategory = 'sensitive' | 'high-risk' | 'destructive';

export interface PrivilegeActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  category?: PrivilegeActionCategory;
  confirmLabel?: string;
  requireReason?: boolean;
  minReasonLength?: number;
  requireCheckbox?: boolean;
  checkboxLabel?: string;
  targetSummary?: React.ReactNode;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function PrivilegeActionDialog({
  open,
  onOpenChange,
  title,
  description,
  category = 'sensitive',
  confirmLabel = 'Bestätigen',
  requireReason = false,
  minReasonLength = 10,
  requireCheckbox = false,
  checkboxLabel = 'Ich bestätige diese Aktion.',
  targetSummary,
  loading = false,
  onConfirm,
}: PrivilegeActionDialogProps) {
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setReason('');
    setChecked(false);
    setError('');
  };

  const handleConfirm = async () => {
    if (requireReason && reason.trim().length < minReasonLength) {
      setError(`Bitte geben Sie einen Grund mit mindestens ${minReasonLength} Zeichen an.`);
      return;
    }
    if (requireCheckbox && !checked) {
      setError('Bitte bestätigen Sie die Checkbox.');
      return;
    }
    setError('');
    await onConfirm(reason.trim());
    reset();
  };

  const destructive = category === 'destructive' || category === 'high-risk';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      tone={destructive ? 'critical' : 'default'}
      loading={loading}
      onConfirm={() => void handleConfirm()}
    >
      <div className="space-y-4 pt-2">
        {(category === 'high-risk' || category === 'destructive') && (
          <div className="flex items-start gap-2 rounded-xl border border-[color:var(--status-critical-soft)] bg-[color:var(--status-critical-soft)]/20 px-3 py-2.5 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
            <span>Privilegierte Aktion — wird revisionssicher protokolliert.</span>
          </div>
        )}

        {targetSummary}

        {requireReason && (
          <div>
            <label htmlFor="privilege-reason" className="mb-1.5 block text-xs font-semibold text-foreground">
              Grund (Pflicht)
            </label>
            <textarea
              id="privilege-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring"
              placeholder="Begründung für diese Aktion…"
            />
          </div>
        )}

        {requireCheckbox && (
          <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5"
            />
            {checkboxLabel}
          </label>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </ConfirmDialog>
  );
}

/** Escalation dialog for granting MASTER_ADMIN platform role */
export function RoleEscalationDialog(
  props: Omit<PrivilegeActionDialogProps, 'category' | 'requireReason' | 'requireCheckbox' | 'minReasonLength'> & {
    userName: string;
    userEmail: string;
  },
) {
  const { userName, userEmail, ...rest } = props;
  return (
    <PrivilegeActionDialog
      {...rest}
      category="high-risk"
      requireReason
      requireCheckbox
      minReasonLength={10}
      checkboxLabel="Ich bestätige die Ausweitung privilegierter Rechte."
      confirmLabel="Plattform-Administrator zuweisen"
      targetSummary={
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1">
          <p className="font-semibold">{userName}</p>
          <p className="text-muted-foreground">{userEmail}</p>
          <p className="text-[color:var(--status-critical)] font-medium">
            Vollzugriff auf alle Mandanten und privilegierte Control-Plane-Aktionen.
          </p>
        </div>
      }
    />
  );
}
