import type { EvaluationsMetricUxKind } from '@synq/evaluations-insights/evaluations-metric-state.contract';
import { metricUxLabels } from '@synq/evaluations-insights/evaluations-metric-state';
import { cn } from '../../../components/ui/utils';

const TONE: Record<EvaluationsMetricUxKind, string> = {
  available: 'sq-tone-neutral',
  partial: 'sq-tone-warning',
  stale: 'sq-tone-watch',
  unavailable: 'sq-tone-neutral',
  error: 'sq-tone-critical',
  not_applicable: 'sq-tone-neutral',
  null_value: 'sq-tone-neutral',
};

interface EvaluationsMetricStateBadgeProps {
  kind: EvaluationsMetricUxKind;
  locale?: 'de' | 'en';
  className?: string;
}

export function EvaluationsMetricStateBadge({
  kind,
  locale = 'de',
  className,
}: EvaluationsMetricStateBadgeProps) {
  if (kind === 'available' || kind === 'null_value') return null;
  const labels = metricUxLabels(kind, locale);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        TONE[kind],
        className,
      )}
      title={labels.tooltip}
    >
      {labels.short}
    </span>
  );
}
