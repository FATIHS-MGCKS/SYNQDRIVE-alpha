import type { ReactNode } from 'react';
import { Button } from '../../../components/ui/button';
import { DetailDrawer, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { WorkflowListItemDto } from '../../../lib/api';
import {
  formatWorkflowRelativeTime,
  workflowActionSummary,
  workflowApprovalLabel,
  workflowApprovalTone,
  workflowConditionSummary,
  workflowLastRunOutcomeLabel,
  workflowLastRunTone,
  workflowRiskLabel,
  workflowRiskTone,
  workflowSourceLabel,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTriggerSummary,
} from './workflow-runtime.utils';

interface WorkflowDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WorkflowListItemDto | null;
  canWrite?: boolean;
  busy?: boolean;
  onEdit?: () => void;
  onOpenFullDetail?: () => void;
  onToggle?: () => void;
  onDuplicate?: () => Promise<void>;
  onArchive?: () => Promise<void>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border/50 pb-4 last:border-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="text-sm text-foreground">{children}</div>
    </section>
  );
}

export function WorkflowDetailDrawer({
  open,
  onOpenChange,
  item,
  canWrite = false,
  busy = false,
  onEdit,
  onOpenFullDetail,
  onToggle,
  onDuplicate,
  onArchive,
}: WorkflowDetailDrawerProps) {
  const { locale, t } = useLanguage();
  if (!item) return null;

  const isSystem = item.sourceType === 'system';
  const actions = Array.isArray(item.actions) ? item.actions : [];

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={item.name}
      eyebrow={t('workflowAutomation.detail.eyebrow')}
      description={item.description ?? t('workflowAutomation.detail.noDescription')}
      closeLabel={t('workflowAutomation.actions.close')}
      status={
        <StatusChip tone={workflowStatusTone(item.status)}>
          {workflowStatusLabel(item.status, t)}
        </StatusChip>
      }
      widthClassName="sm:max-w-xl"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          {onOpenFullDetail && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenFullDetail}>
              {t('workflowAutomation.actions.fullDetail')}
            </Button>
          )}
          {canWrite && !isSystem && onToggle && item.status !== 'ARCHIVED' && (
            <Button type="button" variant="outline" size="sm" onClick={onToggle} disabled={busy}>
              {item.status === 'ACTIVE'
                ? t('workflowAutomation.actions.disable')
                : t('workflowAutomation.actions.enable')}
            </Button>
          )}
          {canWrite && !isSystem && onDuplicate && (
            <Button type="button" variant="outline" size="sm" onClick={() => void onDuplicate()} disabled={busy}>
              {t('workflowAutomation.actions.duplicate')}
            </Button>
          )}
          {canWrite && !isSystem && onArchive && item.status !== 'ARCHIVED' && (
            <Button type="button" variant="destructive" size="sm" onClick={() => void onArchive()} disabled={busy}>
              {t('workflowAutomation.actions.archive')}
            </Button>
          )}
          {canWrite && !isSystem && onEdit && (
            <Button type="button" size="sm" onClick={onEdit} disabled={busy}>
              {t('workflowAutomation.actions.edit')}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4" data-testid="workflow-runtime-detail">
        <DetailSection title={t('workflowAutomation.detail.status')}>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={workflowStatusTone(item.status)}>
              {workflowStatusLabel(item.status, t)}
            </StatusChip>
            <StatusChip tone={item.sourceType === 'system' ? 'info' : 'neutral'}>
              {workflowSourceLabel(item.sourceType, t)}
            </StatusChip>
            {item.hasLegacyMapping && (
              <StatusChip tone="warning">{t('workflowAutomation.badges.legacyMapping')}</StatusChip>
            )}
          </div>
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.trigger')}>
          {workflowTriggerSummary(item, t)}
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.conditions')}>
          {workflowConditionSummary(item, t)}
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.actions')}>
          <p>{workflowActionSummary(item, t)}</p>
          {item.unavailableActionCount > 0 && (
            <p className="mt-2 text-xs text-status-critical">
              {t('workflowAutomation.detail.unavailableActions', { count: item.unavailableActionCount })}
            </p>
          )}
          {actions.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {actions.map((action, index) => {
                const typed = action as { type?: string };
                const type = typed.type ?? '';
                const actionKey = `workflowAutomation.actionType.${type}` as import('../../i18n/translations/en').TranslationKey;
                const label = t(actionKey);
                const display = label !== actionKey ? label : type.replace(/_/g, ' ');
                const supported = item.unavailableActionCount === 0 || display !== type;
                return (
                  <li key={`${type}-${index}`} className={supported ? '' : 'text-status-critical'}>
                    {display}
                    {!supported && ` (${t('workflowAutomation.detail.actionUnavailable')})`}
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.risk')}>
          <StatusChip tone={workflowRiskTone(item.riskClass)}>
            {workflowRiskLabel(item.riskClass, t)}
          </StatusChip>
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.approval')}>
          <StatusChip tone={workflowApprovalTone(item.approvalStatus)}>
            {workflowApprovalLabel(item.approvalStatus, t)}
          </StatusChip>
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.version')}>
          v{item.activeVersion}
        </DetailSection>

        <DetailSection title={t('workflowAutomation.detail.lastRun')}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={workflowLastRunTone(item.lastRunOutcome)}>
              {workflowLastRunOutcomeLabel(item.lastRunOutcome, t)}
            </StatusChip>
            {item.lastRunAt && (
              <span className="text-xs text-muted-foreground">
                {formatWorkflowRelativeTime(item.lastRunAt, locale)}
              </span>
            )}
          </div>
          {item.lastRunOutcome === 'partial' && (
            <p className="mt-2 text-xs text-status-attention">{t('workflowAutomation.detail.partialSuccess')}</p>
          )}
          {item.lastRunOutcome === 'policy_blocked' && (
            <p className="mt-2 text-xs text-status-info">{t('workflowAutomation.detail.policyBlocked')}</p>
          )}
        </DetailSection>
      </div>
    </DetailDrawer>
  );
}
