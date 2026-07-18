import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { VoiceConfirmationDialog, VoiceInlineNotice } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceBudgetPolicy,
  VoiceProtectionStatus,
  WorkflowDto,
  WorkflowRunDto,
  WorkflowTestResultDto,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import type { VoiceAutomationUseCaseId } from './voice-automation.catalog';
import {
  buildAutomationViewModels,
  buildWorkflowCreatePayload,
  buildWorkflowUpdatePayload,
  readAutomationScope,
  type VoiceAutomationViewModel,
} from './voice-automation.ops';

interface VoiceAutomationsPanelProps {
  orgId: string;
  assistant: VoiceAssistantData;
  cardClassName?: string;
}

export function VoiceAutomationsPanel({ orgId, assistant, cardClassName }: VoiceAutomationsPanelProps) {
  const { t } = useLanguage();
  const { userRole } = useRentalOrg();
  const canManage = userRole === 'ORG_ADMIN' || userRole === 'SUB_ADMIN' || userRole === 'MASTER_ADMIN';

  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [runs, setRuns] = useState<Record<string, WorkflowRunDto | null>>({});
  const [protection, setProtection] = useState<VoiceProtectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<VoiceAutomationViewModel | null>(null);
  const [confirmEnable, setConfirmEnable] = useState<VoiceAutomationViewModel | null>(null);
  const [preview, setPreview] = useState<WorkflowTestResultDto | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [wfList, protectionStatus] = await Promise.all([
        api.workflows.list(orgId),
        api.voiceAssistant.protection.status(orgId).catch(() => null),
      ]);
      const voiceWorkflows = wfList.filter(wf => {
        const scope = wf.scope as unknown as Record<string, unknown> | undefined;
        return Boolean(scope?.voiceAutomation) || wf.name.startsWith('Voice ·');
      });
      setWorkflows(voiceWorkflows);
      setProtection(protectionStatus);

      const runEntries = await Promise.all(
        voiceWorkflows.map(async wf => {
          try {
            const runList = await api.workflows.listRuns(orgId, wf.id, 1);
            return [wf.id, runList[0] ?? null] as const;
          } catch {
            return [wf.id, null] as const;
          }
        }),
      );
      setRuns(Object.fromEntries(runEntries));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const models = useMemo(
    () => buildAutomationViewModels(workflows, runs),
    [workflows, runs],
  );

  const budgetPolicy: VoiceBudgetPolicy | null = protection?.policy ?? null;

  const enableAutomation = async (model: VoiceAutomationViewModel) => {
    if (!canManage) return;
    setBusyId(model.catalog.id);
    try {
      if (model.workflow) {
        await api.workflows.toggle(orgId, model.workflow.id);
      } else {
        await api.workflows.create(
          orgId,
          buildWorkflowCreatePayload({
            catalog: model.catalog,
            assistantName: assistant.name,
            activate: true,
          }),
        );
      }
      toast.success(t('voice.automation.enabled'));
      await load();
      setConfirmEnable(null);
    } catch (err) {
      toast.error(t('voice.automation.enableFailed'), { description: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const disableAutomation = async (model: VoiceAutomationViewModel) => {
    if (!model.workflow || !canManage) return;
    setBusyId(model.catalog.id);
    try {
      if (model.workflow.enabled) {
        await api.workflows.toggle(orgId, model.workflow.id);
      } else {
        await api.workflows.update(orgId, model.workflow.id, { status: 'DISABLED' });
      }
      toast.success(t('voice.automation.disabled'));
      await load();
    } catch (err) {
      toast.error(t('voice.automation.disableFailed'), { description: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const runPreview = async (model: VoiceAutomationViewModel) => {
    if (!model.workflow) {
      toast.message(t('voice.automation.previewRequiresEnable'));
      return;
    }
    setBusyId(model.catalog.id);
    try {
      const result = await api.workflows.test(orgId, model.workflow.id, {});
      setPreview(result);
      setSelected(model);
    } catch (err) {
      toast.error(t('voice.automation.previewFailed'), { description: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const statusTone = (status: VoiceAutomationViewModel['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'draft':
        return 'watch';
      case 'invalid':
        return 'critical';
      default:
        return 'neutral';
    }
  };

  if (loading) {
    return (
      <div className={cn(cardClassName, 'flex items-center gap-2 p-6 text-xs text-muted-foreground')}>
        <Icon name="loader-2" className="h-4 w-4 animate-spin" />
        {t('voice.common.loading')}
      </div>
    );
  }

  return (
    <div className={cn(cardClassName, 'space-y-4 p-5')}>
      <header>
        <h3 className="text-sm font-bold text-foreground">{t('voice.automation.title')}</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{t('voice.automation.subtitle')}</p>
      </header>

      <VoiceInlineNotice tone="info">{t('voice.automation.engineNotice')}</VoiceInlineNotice>

      {budgetPolicy && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.automation.budgetMonthly')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">
              {budgetPolicy.monthlyBudgetCents != null
                ? `${(budgetPolicy.monthlyBudgetCents / 100).toFixed(0)} €`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.automation.budgetDaily')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">
              {budgetPolicy.dailyLimitCents != null
                ? `${(budgetPolicy.dailyLimitCents / 100).toFixed(0)} €`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.automation.usagePct')}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">
              {protection?.snapshot.usagePct != null ? `${protection.snapshot.usagePct}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground">{t('voice.automation.destinations')}</p>
            <p className="mt-1 text-sm font-bold">
              {budgetPolicy.destinationRegionPolicy ?? 'DE_ONLY'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <VoiceInlineNotice tone="blocked">{error}</VoiceInlineNotice>
      )}

      {models.length === 0 ? (
        <EmptyState compact title={t('voice.automation.empty')} />
      ) : (
        <div className="space-y-2">
          {models.map(model => {
            const scope = readAutomationScope(model.workflow);
            const busy = busyId === model.catalog.id;
            return (
              <article
                key={model.catalog.id}
                className="rounded-xl border border-border/50 bg-muted/10 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[12px] font-semibold text-foreground">
                        {t(`voice.automation.useCase.${model.catalog.id}` as 'voice.automation.useCase.pickup_confirmation')}
                      </h4>
                      <StatusChip tone={statusTone(model.status)} className="text-[9px]">
                        {t(`voice.automation.status.${model.status}` as 'voice.automation.status.active')}
                      </StatusChip>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t(`voice.automation.trigger.${model.catalog.triggerEvent}` as 'voice.automation.trigger.manual.test')}
                      {' · '}
                      {t(model.catalog.audienceKey as 'voice.automation.audience.pickup_today')}
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] md:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground">{t('voice.automation.col.assistant')}</dt>
                        <dd className="font-medium">{assistant.name}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('voice.automation.col.cooldown')}</dt>
                        <dd className="font-medium tabular-nums">
                          {scope?.cooldownHours ?? model.catalog.defaultCooldownHours}h
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('voice.automation.col.lastRun')}</dt>
                        <dd className="font-medium">
                          {model.lastRun
                            ? new Date(model.lastRun.startedAt).toLocaleString()
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('voice.automation.col.outcome')}</dt>
                        <dd className="font-medium">
                          {model.lastRunOutcome
                            ? t(`voice.automation.runOutcome.${model.lastRunOutcome}` as 'voice.automation.runOutcome.completed')
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={!canManage || busy}
                      onClick={() => setSelected(model)}
                      className="sq-press rounded-lg border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold disabled:opacity-50"
                    >
                      {t('voice.automation.details')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runPreview(model)}
                      className="sq-press rounded-lg border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold disabled:opacity-50"
                    >
                      {t('voice.automation.preview')}
                    </button>
                    {model.status === 'active' ? (
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => void disableAutomation(model)}
                        className="sq-press rounded-lg border border-[color:var(--status-critical)]/30 px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)] disabled:opacity-50"
                      >
                        {t('voice.automation.deactivate')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => setConfirmEnable(model)}
                        className="sq-press rounded-lg border border-[color:var(--status-positive)]/30 bg-[color:var(--status-positive)]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-positive)] disabled:opacity-50"
                      >
                        {t('voice.automation.activate')}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <VoiceAutomationDetailSheet
        model={selected}
        assistant={assistant}
        preview={preview}
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open) {
            setSelected(null);
            setPreview(null);
          }
        }}
        canManage={canManage}
        onSaveScope={async (useCaseId, patch) => {
          const model = models.find(m => m.catalog.id === useCaseId);
          if (!model?.workflow) return;
          setBusyId(useCaseId);
          try {
            await api.workflows.update(
              orgId,
              model.workflow.id,
              buildWorkflowUpdatePayload(model.workflow, patch),
            );
            toast.success(t('voice.common.saved'));
            await load();
          } catch (err) {
            toast.error(t('voice.common.saveError'), { description: getErrorMessage(err) });
          } finally {
            setBusyId(null);
          }
        }}
      />

      <VoiceConfirmationDialog
        open={Boolean(confirmEnable)}
        onOpenChange={open => {
          if (!open) setConfirmEnable(null);
        }}
        title={t('voice.automation.confirmEnableTitle')}
        description={t('voice.automation.confirmEnableDesc')}
        confirmLabel={t('voice.automation.activate')}
        onConfirm={() => {
          if (confirmEnable) void enableAutomation(confirmEnable);
        }}
      />
    </div>
  );
}

interface VoiceAutomationDetailSheetProps {
  model: VoiceAutomationViewModel | null;
  assistant: VoiceAssistantData;
  preview: WorkflowTestResultDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onSaveScope: (
    useCaseId: VoiceAutomationUseCaseId,
    patch: Parameters<typeof buildWorkflowUpdatePayload>[1],
  ) => Promise<void>;
}

function VoiceAutomationDetailSheet({
  model,
  assistant,
  preview,
  open,
  onOpenChange,
  canManage,
  onSaveScope,
}: VoiceAutomationDetailSheetProps) {
  const { t } = useLanguage();
  if (!model) return null;
  const scope = readAutomationScope(model.workflow);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {t(`voice.automation.useCase.${model.catalog.id}` as 'voice.automation.useCase.pickup_confirmation')}
          </SheetTitle>
          <SheetDescription>{t('voice.automation.detailDesc')}</SheetDescription>
        </SheetHeader>
        <dl className="mt-4 space-y-3 text-[11px]">
          {[
            [t('voice.automation.col.trigger'), t(`voice.automation.trigger.${model.catalog.triggerEvent}` as 'voice.automation.trigger.manual.test')],
            [t('voice.automation.col.audience'), t(model.catalog.audienceKey as 'voice.automation.audience.pickup_today')],
            [t('voice.automation.col.assistant'), assistant.name],
            [t('voice.automation.col.windows'), t(`voice.automation.windows.${scope?.allowedWindows ?? 'business_hours'}` as 'voice.automation.windows.business_hours')],
            [t('voice.automation.col.maxCalls'), String(scope?.maxCallsPerRun ?? model.catalog.defaultMaxCallsPerRun)],
            [t('voice.automation.col.countries'), (scope?.allowedCountries ?? model.catalog.defaultAllowedCountries).join(', ')],
            [t('voice.automation.col.actions'), (scope?.allowedActions ?? model.catalog.defaultAllowedActions).join(', ')],
            [t('voice.automation.col.confirmation'), model.catalog.requiresConfirmation ? t('voice.common.yes') : t('voice.common.no')],
            [t('voice.automation.col.nextRun'), model.nextExecutionLabel ? t(`voice.automation.next.${model.nextExecutionLabel}` as 'voice.automation.next.event_driven') : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border/30 pb-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        {preview && (
          <div className="mt-4 rounded-lg border border-border/50 bg-muted/15 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {t('voice.automation.previewResult')}
            </p>
            <p className="mt-1 text-[11px] text-foreground">
              {preview.message ?? t('voice.automation.previewOk')}
            </p>
          </div>
        )}

        {canManage && model.workflow && scope && (
          <button
            type="button"
            className="sq-press mt-4 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-semibold"
            onClick={() =>
              void onSaveScope(model.catalog.id, {
                cooldownHours: scope.cooldownHours,
                maxCallsPerRun: Math.max(1, scope.maxCallsPerRun - 1),
              })
            }
          >
            {t('voice.automation.tightenLimits')}
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
