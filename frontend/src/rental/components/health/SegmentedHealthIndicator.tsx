import { cn } from '../../../components/ui/utils';
import type { SegmentLevel, SegmentTone } from '../../lib/health-segment-display';

export type { SegmentLevel, SegmentTone };

interface SegmentedHealthIndicatorProps {
  level: SegmentLevel;
  tone: SegmentTone;
  label?: string;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

const TONE_CLASS: Record<SegmentTone, string> = {
  good: 'bg-[color:var(--status-positive)]',
  warning: 'bg-[color:var(--status-watch)]',
  critical: 'bg-[color:var(--status-critical)]',
  neutral: 'bg-muted-foreground/45',
};

const TEXT_CLASS: Record<SegmentTone, string> = {
  good: 'text-[color:var(--status-positive)]',
  warning: 'text-[color:var(--status-watch)]',
  critical: 'text-[color:var(--status-critical)]',
  neutral: 'text-muted-foreground',
};

export function SegmentedHealthIndicator({
  level,
  tone,
  label,
  compact = false,
  className,
  ariaLabel,
}: SegmentedHealthIndicatorProps) {
  const safeLevel = Math.min(Math.max(level, 0), 3) as SegmentLevel;

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', compact ? 'gap-1' : 'gap-2', className)}
      role="img"
      aria-label={ariaLabel ?? `${label ?? tone}: ${safeLevel} of 3`}
    >
      <span className={cn('inline-flex items-end', compact ? 'gap-0.5' : 'gap-1')} aria-hidden>
        {[1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'rounded-sm transition-colors',
              compact ? 'h-3 w-1.5' : 'h-4 w-2',
              index <= safeLevel ? TONE_CLASS[tone] : 'bg-muted',
            )}
          />
        ))}
      </span>
      {label ? (
        <span className={cn('truncate font-semibold leading-none', compact ? 'text-[10px]' : 'text-[11px]', TEXT_CLASS[tone])}>
          {label}
        </span>
      ) : null}
    </div>
  );
}

