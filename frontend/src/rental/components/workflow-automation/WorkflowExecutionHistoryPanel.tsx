import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { WorkflowRunDto } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { workflowLastRunOutcomeLabel, workflowLastRunTone } from './workflow-runtime.utils';
import {
  deriveRunHistoryFlags,
  formatRunCorrelation,
  summarizeProviderStatus,
} from './workflow-simulate.utils';

function mapRunOutcome(status: string, flags: ReturnType<typeof deriveRunHistoryFlags>): string {
  if (flags.partialFailure) return 'partial';
  if (flags.policySuppressed) return 'policy_blocked';
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'failed';
  if (status === 'WAITING_APPROVAL') return 'waiting_approval';
  return 'none';
}

export function WorkflowExecutionHistoryPanel({
  runs,
  loading,
  canViewAudit = true,
}: {
  runs: WorkflowRunDto[];
  loading: boolean;
  canViewAudit?: boolean;
}) {
  const { t } = useLanguage();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (!canViewAudit) {
    return (
      <section
        className="rounded-lg border border-status-attention/40 bg-status-attention-soft/20 px-3 py-3 text-xs"
        data-testid="workflow-execution-history-panel"
        role="alert"
      >
        {t('workflowAutomation.history.auditDenied')}
      </section>
    );
  }

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="workflow-execution-history-panel" aria-busy="true">
        {t('workflowAutomation.loading')}
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="workflow-execution-history-panel">
        {t('workflowAutomation.editor.history.empty')}
      </p>
    );
  }

  return (
    <section className="space-y-2" data-testid="workflow-execution-history-panel" aria-live="polite">
      {runs.map((run) => {
        const flags = deriveRunHistoryFlags(run);
        const outcome = mapRunOutcome(run.status, flags);
        const expanded = expandedRunId === run.id;

        return (
          <article
            key={run.id}
            className="rounded-lg border border-border/60 bg-background/40"
          >
            <button
              type="button"
              className="flex w-full min-h-11 items-start justify-between gap-2 px-3 py-2 text-left text-xs"
              onClick={() => setExpandedRunId(expanded ? null : run.id)}
              aria-expanded={expanded}
              aria-controls={`workflow-run-${run.id}`}
            >
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium text-foreground">{run.eventType}</p>
                <p className="text-[10px] text-muted-foreground">
                  v{run.workflowVersion} · {new Date(run.startedAt).toLocaleString()}
                  {run.finishedAt ? ` – ${new Date(run.finishedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusChip tone={workflowLastRunTone(outcome)}>
                  {workflowLastRunOutcomeLabel(outcome, t)}
                </StatusChip>
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </button>

            {expanded && (
              <div id={`workflow-run-${run.id}`} className="space-y-2 border-t border-border/50 px-3 py-2 text-[11px]">
                <Meta label={t('workflowAutomation.history.correlation')}>
                  <span className="font-mono">{formatRunCorrelation(run)}</span>
                </Meta>

                {flags.partialFailure && (
                  <Flag label={t('workflowAutomation.history.partialFailure')} tone="warning" />
                )}
                {flags.policySuppressed && (
                  <Flag label={t('workflowAutomation.history.policySuppression')} tone="info" />
                )}
                {flags.hasApproval && (
                  <Flag label={t('workflowAutomation.history.approval')} tone="info" />
                )}
                {flags.hasRetry && (
                  <Flag label={t('workflowAutomation.history.retry')} tone="neutral" />
                )}

                {(run.actionRuns ?? []).length > 0 && (
                  <div>
                    <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('workflowAutomation.history.actionRuns')}
                    </p>
                    <ul className="space-y-1">
                      {(run.actionRuns ?? []).map((action) => {
                        const provider = summarizeProviderStatus(action);
                        return (
                          <li
                            key={action.id}
                            className="rounded border border-border/40 px-2 py-1"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{action.actionType}</span>
                              <StatusChip
                                tone={
                                  action.status === 'SUCCESS'
                                    ? 'success'
                                    : action.status === 'FAILED'
                                      ? 'critical'
                                      : 'neutral'
                                }
                              >
                                {action.status}
                              </StatusChip>
                            </div>
                            {provider && (
                              <p className="mt-0.5 text-muted-foreground">
                                {t('workflowAutomation.history.providerStatus')}: {provider}
                              </p>
                            )}
                            {action.errorMessage && (
                              <p className="mt-0.5 text-status-critical">{action.errorMessage}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground">
      {label}: <span className="text-foreground">{children}</span>
    </p>
  );
}

function Flag({
  label,
  tone,
}: {
  label: string;
  tone: 'warning' | 'info' | 'neutral';
}) {
  return (
    <p>
      <StatusChip tone={tone === 'warning' ? 'warning' : tone === 'info' ? 'info' : 'neutral'}>
        {label}
      </StatusChip>
    </p>
  );
}
