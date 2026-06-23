import { cn } from '../../../components/ui/utils';
import type { BehaviorSeverityLevel } from './behavior-ui.utils';
import { SEVERITY_LABEL } from './behavior-ui.utils';

const STYLES: Record<BehaviorSeverityLevel, string> = {
  neutral: 'bg-muted/80 text-muted-foreground border-border/60',
  watch: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  notable: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25',
  abuse: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/25',
};

interface TripEventSeverityBadgeProps {
  level: BehaviorSeverityLevel;
  label?: string;
  className?: string;
}

export function TripEventSeverityBadge({ level, label, className }: TripEventSeverityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide shrink-0',
        STYLES[level],
        className,
      )}
    >
      {label ?? SEVERITY_LABEL[level]}
    </span>
  );
}
