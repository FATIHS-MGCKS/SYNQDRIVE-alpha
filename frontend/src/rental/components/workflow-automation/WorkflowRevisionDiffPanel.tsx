import type { WorkflowRevisionDiffResultDto } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { workflowRiskLabel, workflowRiskTone } from './workflow-runtime.utils';
import { formatDiffValue } from './workflow-simulate.utils';

const KIND_I18N: Record<string, string> = {
  trigger_changed: 'workflowAutomation.diff.kind.trigger',
  scope_changed: 'workflowAutomation.diff.kind.scope',
  condition_changed: 'workflowAutomation.diff.kind.condition',
  action_added: 'workflowAutomation.diff.kind.actionAdded',
  action_removed: 'workflowAutomation.diff.kind.actionRemoved',
  action_reordered: 'workflowAutomation.diff.kind.actionReordered',
  time_value_changed: 'workflowAutomation.diff.kind.timeValue',
  approval_changed: 'workflowAutomation.diff.kind.approval',
  risk_class_changed: 'workflowAutomation.diff.kind.risk',
  policy_changed: 'workflowAutomation.diff.kind.policy',
  general_changed: 'workflowAutomation.diff.kind.general',
};

export function WorkflowRevisionDiffPanel({
  diff,
  loading,
  error,
}: {
  diff: WorkflowRevisionDiffResultDto | null;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <section
        className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground"
        data-testid="workflow-revision-diff-panel"
        aria-busy="true"
      >
        {t('workflowAutomation.diff.loading')}
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="rounded-lg border border-status-attention/40 bg-status-attention-soft/30 px-3 py-3 text-sm"
        data-testid="workflow-revision-diff-panel"
        role="alert"
      >
        <p className="font-medium">{t('workflowAutomation.diff.errorTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </section>
    );
  }

  if (!diff) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="workflow-revision-diff-panel">
        {t('workflowAutomation.diff.empty')}
      </p>
    );
  }

  if (!diff.hasChanges) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="workflow-revision-diff-panel">
        {t('workflowAutomation.diff.noChanges')}
      </p>
    );
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3"
      data-testid="workflow-revision-diff-panel"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusChip tone="info">
          v{diff.baselineVersion} → v{diff.proposedVersion}
        </StatusChip>
        <StatusChip tone={workflowRiskTone(diff.baselineRiskClass)}>
          {workflowRiskLabel(diff.baselineRiskClass, t)}
        </StatusChip>
        <span className="text-muted-foreground">→</span>
        <StatusChip tone={workflowRiskTone(diff.proposedRiskClass)}>
          {workflowRiskLabel(diff.proposedRiskClass, t)}
        </StatusChip>
      </div>

      {(diff.actor || diff.changedAt || diff.reason) && (
        <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {diff.actor && (
            <p>
              {t('workflowAutomation.diff.actor')}: <span className="text-foreground">{diff.actor}</span>
            </p>
          )}
          {diff.changedAt && (
            <p>
              {t('workflowAutomation.diff.changedAt')}:{' '}
              <span className="text-foreground">{new Date(diff.changedAt).toLocaleString()}</span>
            </p>
          )}
          {diff.reason && (
            <p className="sm:col-span-2">
              {t('workflowAutomation.diff.reason')}: <span className="text-foreground">{diff.reason}</span>
            </p>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {diff.changes.map((change, index) => {
          const key = KIND_I18N[change.kind];
          const label = key ? t(key as never) : change.label;
          return (
            <li
              key={`${change.kind}-${change.field}-${index}`}
              className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs"
            >
              <p className="font-medium text-foreground">{label}</p>
              {(change.before !== undefined || change.after !== undefined) && (
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {change.before !== undefined && (
                    <p>
                      <span className="font-semibold">{t('workflowAutomation.diff.before')}:</span>{' '}
                      {formatDiffValue(change.before)}
                    </p>
                  )}
                  {change.after !== undefined && (
                    <p>
                      <span className="font-semibold">{t('workflowAutomation.diff.after')}:</span>{' '}
                      {formatDiffValue(change.after)}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
