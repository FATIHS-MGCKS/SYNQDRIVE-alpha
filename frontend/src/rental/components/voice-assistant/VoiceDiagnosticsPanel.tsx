import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import { VoiceConfirmationDialog, VoiceInlineNotice, VoiceProviderDiagnostic } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceAgentDeploymentReadiness, VoiceAssistantData, VoiceAssistantReadiness } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import { maskTechnicalId } from './voice-information-architecture';

interface VoiceDiagnosticsPanelProps {
  orgId: string;
  assistant: VoiceAssistantData;
  readiness: VoiceAssistantReadiness | null;
  onReadinessRefresh?: () => void | Promise<void>;
}

export function VoiceDiagnosticsPanel({
  orgId,
  assistant,
  readiness,
  onReadinessRefresh,
}: VoiceDiagnosticsPanelProps) {
  const { t } = useLanguage();
  const { userRole } = useRentalOrg();
  const isAdmin =
    userRole === 'ORG_ADMIN' || userRole === 'SUB_ADMIN' || userRole === 'MASTER_ADMIN';

  const [deploymentReadiness, setDeploymentReadiness] = useState<VoiceAgentDeploymentReadiness | null>(null);
  const [deploymentDiff, setDeploymentDiff] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [deployReady, diff] = await Promise.all([
        api.voiceAssistant.agentDeployment.readiness(orgId),
        api.voiceAssistant.agentDeployment.diff(orgId).catch(() => null),
      ]);
      setDeploymentReadiness(deployReady);
      setDeploymentDiff(diff);
    } catch (err) {
      toast.error(t('voice.diagnostics.loadError'), { description: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [orgId, isAdmin, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const diagnosticRows = useMemo(() => {
    const rows =
      readiness?.checks.map(check => ({
        id: check.key,
        label: check.label,
        value: check.ok ? t('voice.settings.diagnostics.ok') : t('voice.settings.diagnostics.issue'),
        status: check.ok ? ('ok' as const) : ('warn' as const),
        hint: check.verification ? maskTechnicalId(check.verification) : undefined,
      })) ?? [];

    if (assistant.elevenLabsAgentId) {
      rows.push({
        id: 'agent_ref',
        label: t('voice.diagnostics.agentRef'),
        value: maskTechnicalId(assistant.elevenLabsAgentId),
        status: 'ok' as const,
        hint: undefined,
      });
    }

    if (assistant.phoneNumberId) {
      rows.push({
        id: 'phone_ref',
        label: t('voice.diagnostics.phoneRef'),
        value: maskTechnicalId(assistant.phoneNumberId),
        status: 'ok' as const,
        hint: undefined,
      });
    }

    return rows;
  }, [assistant.elevenLabsAgentId, assistant.phoneNumberId, readiness?.checks, t]);

  const deployAgent = async () => {
    setBusy(true);
    try {
      await api.voiceAssistant.agentDeployment.deploy(orgId, { confirm: true });
      toast.success(t('voice.diagnostics.deploySuccess'));
      setConfirmDeploy(false);
      await load();
      await onReadinessRefresh?.();
    } catch (err) {
      toast.error(t('voice.diagnostics.deployFailed'), { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const rollbackAgent = async () => {
    setBusy(true);
    try {
      await api.voiceAssistant.agentDeployment.rollback(orgId, { confirm: true });
      toast.success(t('voice.diagnostics.rollbackSuccess'));
      setConfirmRollback(false);
      await load();
      await onReadinessRefresh?.();
    } catch (err) {
      toast.error(t('voice.diagnostics.rollbackFailed'), { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <VoiceInlineNotice tone="blocked" title={t('voice.diagnostics.adminOnlyTitle')}>
        {t('voice.diagnostics.adminOnlyDesc')}
      </VoiceInlineNotice>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="loader-2" className="h-4 w-4 animate-spin" />
        {t('voice.common.loading')}
      </div>
    );
  }

  const hasDiff = deploymentDiff && Object.keys(deploymentDiff).length > 0;

  return (
    <div className="space-y-4">
      <VoiceInlineNotice tone="info">{t('voice.diagnostics.noSecrets')}</VoiceInlineNotice>

      <VoiceProviderDiagnostic title={t('voice.settings.diagnosticsTitle')} rows={diagnosticRows} />

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[12px] font-bold text-foreground">{t('voice.diagnostics.deploymentTitle')}</h4>
          <StatusChip tone={deploymentReadiness?.ready ? 'success' : 'watch'} className="text-[9px]">
            {deploymentReadiness?.ready ? t('voice.diagnostics.ready') : t('voice.diagnostics.notReady')}
          </StatusChip>
        </div>

        {deploymentReadiness && (
          <ul className="mt-3 space-y-2">
            {[...deploymentReadiness.blockers, ...deploymentReadiness.warnings].map(item => (
              <li
                key={item.key}
                className={cn(
                  'rounded-lg border px-3 py-2 text-[11px]',
                  item.level === 'blocker'
                    ? 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/5'
                    : 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/5',
                )}
              >
                <span className="font-semibold">{item.label}</span>
                <p className="mt-0.5 text-muted-foreground">{item.message}</p>
              </li>
            ))}
            {deploymentReadiness.blockers.length === 0 && deploymentReadiness.warnings.length === 0 && (
              <li className="text-[11px] text-muted-foreground">{t('voice.diagnostics.noDeploymentIssues')}</li>
            )}
          </ul>
        )}

        {hasDiff && (
          <p className="mt-3 text-[10px] text-muted-foreground">{t('voice.diagnostics.pendingDiff')}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !deploymentReadiness?.ready}
            onClick={() => setConfirmDeploy(true)}
            className="sq-press rounded-lg border border-[color:var(--status-positive)]/30 bg-[color:var(--status-positive)]/10 px-3 py-2 text-[11px] font-semibold text-[color:var(--status-positive)] disabled:opacity-50"
          >
            {t('voice.diagnostics.deploy')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmRollback(true)}
            className="sq-press rounded-lg border border-[color:var(--status-critical)]/30 px-3 py-2 text-[11px] font-semibold text-[color:var(--status-critical)] disabled:opacity-50"
          >
            {t('voice.diagnostics.rollback')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="sq-press rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold"
          >
            {t('voice.diagnostics.refresh')}
          </button>
        </div>
      </div>

      <div className="surface-premium rounded-2xl border border-border/40 p-4">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.diagnostics.integrationsTitle')}</h4>
        <dl className="mt-3 space-y-2 text-[11px]">
          {[
            [t('voice.diagnostics.webhooks'), t('voice.diagnostics.webhooksDesc')],
            [t('voice.diagnostics.mcp'), t('voice.diagnostics.mcpDesc')],
            [t('voice.diagnostics.health'), assistant.connectionStatus],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-4 border-b border-border/30 pb-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <VoiceConfirmationDialog
        open={confirmDeploy}
        onOpenChange={setConfirmDeploy}
        title={t('voice.diagnostics.confirmDeployTitle')}
        description={t('voice.diagnostics.confirmDeployDesc')}
        confirmLabel={t('voice.diagnostics.deploy')}
        tone="default"
        loading={busy}
        onConfirm={() => void deployAgent()}
      />

      <VoiceConfirmationDialog
        open={confirmRollback}
        onOpenChange={setConfirmRollback}
        title={t('voice.diagnostics.confirmRollbackTitle')}
        description={t('voice.diagnostics.confirmRollbackDesc')}
        confirmLabel={t('voice.diagnostics.rollback')}
        tone="critical"
        loading={busy}
        onConfirm={() => void rollbackAgent()}
      />
    </div>
  );
}
