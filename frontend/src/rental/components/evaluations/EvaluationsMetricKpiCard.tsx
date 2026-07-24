import type { LucideIcon } from 'lucide-react';
import type { EvaluationsResolvedMetricState } from '@synq/evaluations-insights/evaluations-metric-state.contract';
import { cn } from '../../../components/ui/utils';
import { EvaluationsMetricValue } from './EvaluationsMetricValue';

interface EvaluationsMetricKpiCardProps {
  label: string;
  state: EvaluationsResolvedMetricState;
  icon: LucideIcon;
  tone?: 'critical' | 'watch' | 'info';
  accent?: boolean;
  locale?: 'de' | 'en';
  prefix?: string;
}

export function EvaluationsMetricKpiCard({
  label,
  state,
  icon: MetricIcon,
  tone,
  accent = false,
  locale = 'de',
  prefix,
}: EvaluationsMetricKpiCardProps) {
  const isCritical = tone === 'critical' && accent;
  const isWatch = tone === 'watch' && accent;
  const isInfo = tone === 'info' && accent;
  const hasPositiveValue = state.canShowValue && (state.rawValue ?? 0) > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden border text-left',
        'min-h-[96px] rounded-lg surface-premium/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 surface-premium/55',
        isInfo && 'border-[color:var(--status-info)]/30 surface-premium/55',
        !isCritical && !isWatch && !isInfo && 'border-border/45',
        state.showStaleOverlay && 'ring-1 ring-[color:var(--status-watch)]/25',
      )}
      aria-label={`${label}`}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <div
            className={cn(
              'mt-1 text-[21px] font-semibold leading-none tracking-[-0.03em]',
              isCritical && hasPositiveValue && 'text-[color:var(--status-critical)]',
              isWatch && hasPositiveValue && 'text-[color:var(--status-watch)]',
              isInfo && hasPositiveValue && 'text-[color:var(--status-info)]',
              !isCritical && !isWatch && !isInfo && 'text-foreground',
            )}
          >
            {prefix ? (
              <span className="mr-0.5 text-[15px] font-medium text-muted-foreground">{prefix}</span>
            ) : null}
            <EvaluationsMetricValue
              state={state}
              locale={locale}
              valueClassName="text-[21px] font-semibold"
              skeletonClassName="h-7 w-20"
            />
          </div>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isInfo && 'sq-tone-info',
            !isCritical && !isWatch && !isInfo && 'bg-muted text-muted-foreground',
          )}
        >
          <MetricIcon className="h-3 w-3" />
        </div>
      </div>
      {isCritical && hasPositiveValue ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
