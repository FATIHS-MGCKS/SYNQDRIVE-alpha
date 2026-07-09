import { Icon } from '../ui/Icon';
import { BEHAVIOR_COPY } from './trips-view-ui';
import { tv } from './trips-view-ui';

export type TripBehaviorEmptyVariant =
  | 'pending'
  | 'running'
  | 'skipped'
  | 'failed_retry'
  | 'failed_permanent'
  | 'not_started'
  | 'success_empty'
  | 'limited';

interface TripBehaviorEmptyStateProps {
  variant: TripBehaviorEmptyVariant;
  isDark: boolean;
  onRetry?: () => void;
  onAnalyze?: () => void;
}

export function TripBehaviorEmptyState({
  variant,
  isDark,
  onRetry,
  onAnalyze,
}: TripBehaviorEmptyStateProps) {
  const isLoading = variant === 'pending' || variant === 'running';

  const title =
    variant === 'pending'
      ? BEHAVIOR_COPY.pending
      : variant === 'running'
        ? BEHAVIOR_COPY.running
        : variant === 'skipped'
          ? BEHAVIOR_COPY.skippedTitle
          : variant === 'failed_retry'
            ? BEHAVIOR_COPY.failedTitle
            : variant === 'failed_permanent'
              ? BEHAVIOR_COPY.failedPermanentTitle
              : variant === 'not_started'
                ? BEHAVIOR_COPY.notStartedTitle
                : variant === 'success_empty'
                  ? BEHAVIOR_COPY.noEventsTitle
                  : BEHAVIOR_COPY.limitedTitle;

  const hint =
    variant === 'skipped'
      ? BEHAVIOR_COPY.skippedHint
      : variant === 'failed_retry'
        ? BEHAVIOR_COPY.failedRetryHint
        : variant === 'failed_permanent'
          ? BEHAVIOR_COPY.failedPermanentHint
          : variant === 'not_started'
            ? BEHAVIOR_COPY.notStartedHint
            : variant === 'success_empty'
              ? BEHAVIOR_COPY.noEventsHint
              : variant === 'limited'
                ? BEHAVIOR_COPY.limitedHint
                : undefined;

  return (
    <div className="surface-solid rounded-xl border border-border/45 px-4 py-3.5">
      <div className="flex items-start gap-3">
        {isLoading ? (
          <Icon
            name="loader-2"
            className={`w-4 h-4 mt-0.5 shrink-0 animate-spin ${isDark ? 'text-foreground' : 'text-status-info'}`}
          />
        ) : (
          <Icon
            name={
              variant === 'failed_retry' || variant === 'failed_permanent'
                ? 'alert-triangle'
                : variant === 'success_empty'
                  ? 'check-circle'
                  : 'bar-chart-3'
            }
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              variant === 'failed_permanent'
                ? 'text-destructive'
                : variant === 'success_empty'
                  ? 'text-emerald-500'
                  : 'text-muted-foreground'
            }`}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground">{title}</p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {variant === 'failed_retry' && onRetry && (
              <button type="button" onClick={onRetry} className={`${tv.focusRing} text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400`}>
                {BEHAVIOR_COPY.retry}
              </button>
            )}
            {variant === 'not_started' && onAnalyze && (
              <button type="button" onClick={onAnalyze} className={`${tv.focusRing} text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-brand/30 bg-brand-soft text-brand dark:border-status-ai/30 dark:bg-status-ai-soft dark:text-status-ai`}>
                {BEHAVIOR_COPY.analyze}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
