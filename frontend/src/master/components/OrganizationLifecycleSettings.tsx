import { useEffect, useState } from 'react';
import { isStepUpRequiredError } from '../../lib/mfa';
import { ConfirmDialog } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  allowedOrgLifecycleActions,
  orgLifecyclePatchStatus,
  type OrgLifecycleAction,
} from '../organizations/master-organization-lifecycle.policy';
import { StatusChip } from '../../components/patterns';
import { orgStatusTone } from '../organizations/org.utils';

interface OrganizationLifecycleSettingsProps {
  orgId: string;
  orgStatus: string;
  orgStatusLabel: string;
  disabled?: boolean;
  onStatusChange: (nextStatus: 'ACTIVE' | 'SUSPENDED') => Promise<void>;
}

export function OrganizationLifecycleSettings({
  orgId,
  orgStatus,
  orgStatusLabel,
  disabled,
  onStatusChange,
}: OrganizationLifecycleSettingsProps) {
  const { t } = useLanguage();
  const [busyAction, setBusyAction] = useState<OrgLifecycleAction | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = allowedOrgLifecycleActions(orgStatus);

  useEffect(() => {
    setError(null);
  }, [orgStatus]);

  const runAction = async (action: OrgLifecycleAction) => {
    setError(null);
    setBusyAction(action);
    try {
      await onStatusChange(orgLifecyclePatchStatus(action));
      setError(null);
    } catch (e) {
      if (isStepUpRequiredError(e)) {
        return;
      }
      setError(e instanceof Error ? e.message : t('master.organizations.update.failed'));
    } finally {
      setBusyAction(null);
    }
  };

  const hintFor = (action: OrgLifecycleAction) => {
    if (action === 'activate') return t('master.organizations.lifecycle.activateHint');
    if (action === 'suspend') return t('master.organizations.lifecycle.suspendHint');
    return t('master.organizations.lifecycle.reactivateHint');
  };

  const labelFor = (action: OrgLifecycleAction) => {
    if (action === 'activate') return t('master.organizations.lifecycle.activate');
    if (action === 'suspend') return t('master.organizations.lifecycle.suspend');
    return t('master.organizations.lifecycle.reactivate');
  };

  return (
    <section className="rounded-xl border border-border p-5 space-y-4" aria-labelledby={`org-lifecycle-${orgId}`}>
      <h3 id={`org-lifecycle-${orgId}`} className="text-sm font-semibold">
        {t('master.organizations.lifecycle.title')}
      </h3>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('master.organizations.lifecycle.current')}:</span>
        <StatusChip tone={orgStatusTone(orgStatus)} dot>
          {orgStatusLabel}
        </StatusChip>
      </div>

      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('master.organizations.lifecycle.archivedNote')}</p>
      )}

      <ul className="space-y-3">
        {actions.map((action) => (
          <li key={action} className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm text-muted-foreground">{hintFor(action)}</p>
            <Button
              type="button"
              variant={action === 'suspend' ? 'destructive' : 'default'}
              disabled={disabled || busyAction !== null}
              onClick={() => {
                if (action === 'suspend') {
                  setSuspendOpen(true);
                  return;
                }
                void runAction(action);
              }}
            >
              {labelFor(action)}
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-sm text-[color:var(--status-critical)]" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={t('master.organizations.lifecycle.suspendConfirmTitle')}
        description={t('master.organizations.lifecycle.suspendConfirmBody')}
        confirmLabel={t('master.organizations.lifecycle.suspend')}
        cancelLabel={t('common.cancel')}
        tone="critical"
        loading={busyAction === 'suspend'}
        onConfirm={async () => {
          await runAction('suspend');
          setSuspendOpen(false);
        }}
      />
    </section>
  );
}