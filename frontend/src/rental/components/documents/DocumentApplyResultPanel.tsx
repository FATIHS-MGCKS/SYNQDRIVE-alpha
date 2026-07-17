import type {
  PublicDocumentActionPlanPreview,
  PublicDocumentApplyResult,
} from '../../lib/document-extraction.types';
import { resolveApplyEntityNavigationTarget } from '../../lib/document-apply-result';
import type { TranslationKey } from '../../i18n/translations/en';
import type { FlowStatus } from './document-extraction.shared';

function statusClass(status: string): string {
  if (status === 'FAILED') {
    return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]';
  }
  if (status === 'RUNNING' || status === 'PENDING') {
    return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]';
  }
  if (status === 'SKIPPED') {
    return 'border-border bg-muted/20 text-muted-foreground';
  }
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] text-[color:var(--status-success)]';
}

function resolveDisplayStatus(
  flow: FlowStatus,
  actionStatus: string,
): string {
  if (flow === 'applying' && (actionStatus === 'PENDING' || actionStatus === 'RUNNING')) {
    return 'RUNNING';
  }
  return actionStatus;
}

export interface DocumentApplyResultPanelProps {
  flow: FlowStatus;
  applyResult: PublicDocumentApplyResult | null;
  actionPlanPreview?: PublicDocumentActionPlanPreview | null;
  pending?: boolean;
  retryPending?: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onRetryFailed?: () => void;
  onEntityNavigate?: (target: { view: string; tab?: string; entityId: string }) => void;
}

export function DocumentApplyResultPanel({
  flow,
  applyResult,
  actionPlanPreview = null,
  pending = false,
  retryPending = false,
  t,
  onRetryFailed,
  onEntityNavigate,
}: DocumentApplyResultPanelProps) {
  const showPanel =
    flow === 'applying' ||
    flow === 'partially_done' ||
    flow === 'apply_failed' ||
    (flow === 'done' && applyResult != null);

  if (!showPanel) return null;

  const actions =
    applyResult?.actions?.length
      ? applyResult.actions
      : (actionPlanPreview?.actions ?? []).map((action, index) => ({
          actionIndex: index,
          semanticAction: action.semanticAction,
          labelKey: action.labelKey,
          title: action.title,
          requirement: action.requirement,
          status: flow === 'applying' ? ('RUNNING' as const) : ('PENDING' as const),
          targetModule: action.targetModule,
          targetModuleLabel: action.targetModuleLabel,
          resultEntityType: action.targetEntityType,
          resultEntityId: null,
          entityLink: null,
          errorCode: null,
          errorMessage: null,
          skippedReason: null,
        }));

  const summary =
    applyResult?.summary ??
    (flow === 'applying'
      ? t('docUpload.applyResult.applyingSummary')
      : t('docUpload.applyResult.waitingSummary'));

  const detailSummary =
    applyResult?.detailSummary ??
    (flow === 'applying' ? t('docUpload.applyResult.nonCancellableHint') : null);

  const partiallyApplied = applyResult?.partiallyApplied || flow === 'partially_done';
  const applyFailed = applyResult?.applyFailed || flow === 'apply_failed';

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/10 p-3">
      <div>
        <p className="sq-section-label">{t('docUpload.applyResult.title')}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{summary}</p>
        {detailSummary ? (
          <p
            className={`mt-1 text-[10px] ${
              applyFailed
                ? 'text-[color:var(--status-critical)]'
                : partiallyApplied
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-muted-foreground'
            }`}
          >
            {detailSummary}
          </p>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <div className="space-y-1.5">
          {actions.map((action) => {
            const displayStatus = resolveDisplayStatus(flow, action.status);
            return (
              <div key={`${action.semanticAction}-${action.actionIndex}`} className="rounded-lg border border-border bg-background/60 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">{action.title}</p>
                    <p className="text-[10px] text-muted-foreground">{action.targetModuleLabel}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusClass(displayStatus)}`}>
                    {t(`docUpload.applyResult.status.${displayStatus}` as TranslationKey)}
                  </span>
                </div>
                {action.errorMessage ? (
                  <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">{action.errorMessage}</p>
                ) : null}
                {action.skippedReason ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">{action.skippedReason}</p>
                ) : null}
                {action.entityLink && action.status === 'SUCCEEDED' ? (
                  <button
                    type="button"
                    className="mt-1.5 text-[10px] font-semibold text-primary hover:underline"
                    onClick={() => {
                      const target = resolveApplyEntityNavigationTarget(action.entityLink!);
                      if (target) onEntityNavigate?.(target);
                    }}
                  >
                    {action.entityLink.label}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {applyResult?.canRetryFailedActions && onRetryFailed ? (
        <button
          type="button"
          disabled={retryPending || pending}
          onClick={onRetryFailed}
          className="sq-press rounded-lg border border-[color:var(--status-watch)]/40 px-3 py-2 text-[10px] font-semibold text-[color:var(--status-watch)] disabled:opacity-50"
        >
          {retryPending
            ? t('docUpload.applyResult.retryPending')
            : t('docUpload.applyResult.retryFailed')}
        </button>
      ) : null}
    </div>
  );
}
