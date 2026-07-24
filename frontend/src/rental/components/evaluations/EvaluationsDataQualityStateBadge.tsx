import type { EvaluationsDataQualityState } from '@synq/evaluations-insights/evaluations-data-quality.contract';
import { cn } from '../../../components/ui/utils';

const TONE: Record<EvaluationsDataQualityState, string> = {
  GOOD: 'sq-chip-success',
  LIMITED: 'sq-chip-watch',
  STALE: 'sq-chip-watch',
  INVALID: 'sq-chip-critical',
  MISSING: 'sq-chip-neutral',
  NOT_CONNECTED: 'sq-chip-neutral border border-dashed border-border',
  NOT_APPLICABLE: 'sq-chip-neutral',
};

interface EvaluationsDataQualityStateBadgeProps {
  state: EvaluationsDataQualityState;
  label: string;
  title?: string;
  className?: string;
}

export function EvaluationsDataQualityStateBadge({
  state,
  label,
  title,
  className,
}: EvaluationsDataQualityStateBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        TONE[state],
        className,
      )}
      title={title ?? label}
    >
      {label}
    </span>
  );
}
