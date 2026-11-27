import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../../components/patterns';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';

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
  confirmLabel,
  requireReason = false,
  minReasonLength = 10,
  requireCheckbox = false,
  checkboxLabel,
  targetSummary,
  loading = false,
  onConfirm,
}: PrivilegeActionDialogProps) {
  const { t } = useSecurityAccessPresentation();
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
      setError(t('master.securityAccess.privilege.error.reasonMinLength', { min: String(minReasonLength) }));
      return;
    }
    if (requireCheckbox && !checked) {
      setError(t('master.securityAccess.privilege.error.checkboxRequired'));
      return;
    }
    setError('');
    await onConfirm(reason.trim());
    reset();
  };

  const destructive = category === 'destructive' || category === 'high-risk';
  const resolvedConfirm = confirmLabel ?? t('master.securityAccess.common.confirm');
  const resolvedCheckbox = checkboxLabel ?? t('master.securityAccess.privilege.checkboxDefault');

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={title}
      description={description}
      confirmLabel={resolvedConfirm}
      tone={destructive ? 'critical' : 'default'}
      loading={loading}
      onConfirm={() => void handleConfirm()}
    >
      <div className="space-y-4 pt-2">
        {(category === 'high-risk' || category === 'destructive') && (
          <div className="flex items-start gap-2 rounded-xl border border-[color:var(--status-critical-soft)] bg-[color:var(--status-critical-soft)]/20 px-3 py-2.5 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
            <span>{t('master.securityAccess.privilege.auditBanner')}</span>
          </div>
        )}

        {targetSummary}

        {requireReason && (
          <div>
            <label htmlFor="privilege-reason" className="mb-1.5 block text-xs font-semibold text-foreground">
              {t('master.securityAccess.privilege.reasonLabel')}
            </label>
            <textarea
              id="privilege-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring"
              placeholder={t('master.securityAccess.privilege.reasonPlaceholder')}
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
            {resolvedCheckbox}
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
  const { t } = useSecurityAccessPresentation();
  return (
    <PrivilegeActionDialog
      {...rest}
      category="high-risk"
      requireReason
      requireCheckbox
      minReasonLength={10}
      checkboxLabel={t('master.securityAccess.privilege.escalation.checkbox')}
      confirmLabel={t('master.securityAccess.privilege.escalation.confirm')}
      targetSummary={
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1">
          <p className="font-semibold">{userName}</p>
          <p className="text-muted-foreground">{userEmail}</p>
          <p className="text-[color:var(--status-critical)] font-medium">
            {t('master.securityAccess.privilege.escalation.fullAccessWarning')}
          </p>
        </div>
      }
    />
  );
}