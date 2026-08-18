import { Shield } from 'lucide-react';
import type { WorkflowExecutionPlanDto } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { workflowRiskLabel, workflowRiskTone } from './workflow-runtime.utils';
import { sanitizeClientPreviewValue } from './workflow-simulate.utils';

export function WorkflowDryRunPanel({
  plan,
  loading,
  error,
  sequence,
  activeSequence,
}: {
  plan: WorkflowExecutionPlanDto | null;
  loading: boolean;
  error: string | null;
  sequence: number;
  activeSequence: number;
}) {
  const { t } = useLanguage();
  const isStale = sequence > 0 && sequence !== activeSequence;

  if (loading) {
    return (
      <section
        className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground"
        data-testid="workflow-dry-run-panel"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          {t('workflowAutomation.simulate.loading')}
        </div>
      </section>
    );
  }

  if (error) {
    const message =
      error === 'save_first'
        ? t('workflowAutomation.editor.simulation.saveFirst')
        : error;
    return (
      <section
        className="rounded-lg border border-status-attention/40 bg-status-attention-soft/30 px-3 py-3 text-sm"
        data-testid="workflow-dry-run-panel"
        role="alert"
      >
        <p className="font-medium text-foreground">{t('workflowAutomation.simulate.errorTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </section>
    );
  }

  if (!plan || isStale) return null;

  const allActions = [...plan.plannedActions, ...plan.skippedActions].sort(
    (a, b) => a.index - b.index,
  );

  return (
    <section
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3"
      data-testid="workflow-dry-run-panel"
      aria-live="polite"
    >
      <div
        className="rounded-md border border-status-info/40 bg-status-info-soft/20 px-3 py-2 text-xs"
        role="status"
      >
        <p className="font-semibold text-foreground">{t('workflowAutomation.simulate.noExecution')}</p>
        <p className="mt-1 text-muted-foreground">{plan.message}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <MetaRow label={t('workflowAutomation.simulate.revision')}>
          {t('workflowAutomation.simulate.revisionValue', {
            type: plan.sourceRevision.type,
            version: plan.sourceRevision.version,
          })}
        </MetaRow>
        <MetaRow label={t('workflowAutomation.simulate.riskClass')}>
          <StatusChip tone={workflowRiskTone(plan.riskClass)}>
            {workflowRiskLabel(plan.riskClass, t)}
          </StatusChip>
        </MetaRow>
        <MetaRow label={t('workflowAutomation.simulate.requestId')}>
          <span className="font-mono text-xs break-all">{plan.requestId}</span>
        </MetaRow>
        <MetaRow label={t('workflowAutomation.simulate.correlationId')}>
          <span className="font-mono text-xs break-all">{plan.correlationId}</span>
        </MetaRow>
        <MetaRow label={t('workflowAutomation.simulate.timestamp')}>
          {new Date(plan.assessedAt).toLocaleString()}
        </MetaRow>
      </div>

      <Block title={t('workflowAutomation.simulate.eventData')}>
        <pre className="overflow-x-auto rounded-md bg-background/70 p-2 text-xs leading-relaxed">
          {JSON.stringify(sanitizeClientPreviewValue(plan.event), null, 2)}
        </pre>
      </Block>

      <Block title={t('workflowAutomation.simulate.scopeResult')}>
        <p className="text-xs text-foreground">
          {plan.scope.passed
            ? t('workflowAutomation.simulate.scopePassed')
            : t('workflowAutomation.simulate.scopeFailed')}
        </p>
        {plan.scope.reason && (
          <p className="mt-1 text-xs text-muted-foreground">{plan.scope.reason}</p>
        )}
      </Block>

      <Block title={t('workflowAutomation.simulate.conditionTree')}>
        <p className="text-xs text-foreground">
          {plan.conditions.passed
            ? t('workflowAutomation.simulate.conditionsPassed')
            : t('workflowAutomation.simulate.conditionsFailed')}
        </p>
        <ul className="mt-2 space-y-1">
          {plan.conditions.results.map((row) => (
            <li
              key={`${row.path}-${row.operator}`}
              className="flex items-center justify-between rounded border border-border/40 px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground">
                {row.path} {row.operator}
              </span>
              <StatusChip tone={row.passed ? 'success' : 'critical'}>
                {row.passed
                  ? t('workflowAutomation.simulate.pass')
                  : t('workflowAutomation.simulate.fail')}
              </StatusChip>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t('workflowAutomation.simulate.plannedActions')}>
        {allActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('workflowAutomation.simulate.noActions')}</p>
        ) : (
          <ul className="space-y-2">
            {allActions.map((action) => (
              <li
                key={`${action.index}-${action.actionType}`}
                className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{action.actionType}</span>
                  <StatusChip tone={action.status === 'PLANNED' ? 'info' : 'neutral'}>
                    {action.status}
                  </StatusChip>
                  {action.requiresApproval && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      {t('workflowAutomation.simulate.approvalRequired')}
                    </span>
                  )}
                </div>
                {action.resolvedRecipients && action.resolvedRecipients.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('workflowAutomation.simulate.recipients')}:{' '}
                    {action.resolvedRecipients.map((r) => `${r.channel}:${r.masked}`).join(', ')}
                  </p>
                )}
                {action.expectedFallback && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('workflowAutomation.simulate.fallback')}: {action.expectedFallback}
                  </p>
                )}
                {action.skipReason && (
                  <p className="mt-1 text-xs text-muted-foreground">{action.skipReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      {plan.wouldCreateApprovals && (
        <div className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning-soft/20 px-2.5 py-2 text-xs">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{t('workflowAutomation.simulate.approvalWouldBeCreated')}</p>
        </div>
      )}

      {plan.policyBlockers.length > 0 && (
        <Block title={t('workflowAutomation.simulate.policyBlockers')}>
          <ul className="space-y-1 text-xs text-status-critical">
            {plan.policyBlockers.map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        </Block>
      )}

      {plan.validationErrors.length > 0 && (
        <Block title={t('workflowAutomation.simulate.validationErrors')}>
          <ul className="space-y-1 text-xs text-status-critical">
            {plan.validationErrors.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </Block>
      )}
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/50 px-2 py-1.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-foreground">{children}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
