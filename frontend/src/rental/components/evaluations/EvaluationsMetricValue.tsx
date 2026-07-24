import type { EvaluationsResolvedMetricState } from '@synq/evaluations-insights/evaluations-metric-state.contract';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';
import { cn } from '../../../components/ui/utils';
import { EvaluationsMetricStateBadge } from './EvaluationsMetricStateBadge';

interface EvaluationsMetricValueProps {
  state: EvaluationsResolvedMetricState;
  locale?: 'de' | 'en';
  className?: string;
  valueClassName?: string;
  skeletonClassName?: string;
  placeholder?: string;
  showBadge?: boolean;
}

const PLACEHOLDER = '—';

export function EvaluationsMetricValue({
  state,
  locale = 'de',
  className,
  valueClassName,
  skeletonClassName,
  placeholder = PLACEHOLDER,
  showBadge = true,
}: EvaluationsMetricValueProps) {
  const isLoading = state.fetchPhase === 'loading';
  const display = state.canShowValue ? state.displayValue : placeholder;

  const valueNode = isLoading ? (
    <Skeleton className={cn('h-6 w-16 rounded-md', skeletonClassName)} />
  ) : (
    <span
      className={cn(
        'tabular-nums',
        state.showStaleOverlay && 'opacity-70',
        state.kind === 'error' && 'text-[color:var(--status-critical)]',
        state.kind === 'unavailable' && 'text-muted-foreground',
        valueClassName,
      )}
    >
      {display}
    </span>
  );

  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5">{valueNode}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {state.tooltip}
        </TooltipContent>
      </Tooltip>
      {showBadge && !isLoading ? (
        <EvaluationsMetricStateBadge kind={state.kind} locale={locale} />
      ) : null}
      {state.showStaleOverlay && state.fetchPhase === 'refetching' ? (
        <span className="text-[9px] font-medium text-[color:var(--status-watch)]">
          {locale === 'en' ? 'Refreshing…' : 'Aktualisiere…'}
        </span>
      ) : null}
    </div>
  );
}
