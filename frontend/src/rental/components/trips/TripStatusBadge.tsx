import { cn } from '../../../components/ui/utils';

const TONE_CLASS: Record<string, string> = {
  neutral: 'bg-muted/70 text-muted-foreground border-border/50',
  info: 'bg-blue-500/8 text-blue-700 dark:bg-status-info-soft dark:text-status-info border-blue-500/18 dark:border-status-info/20',
  watch: 'bg-amber-500/8 text-amber-800 dark:text-amber-400 border-amber-500/18',
  notable: 'bg-orange-500/8 text-orange-800 dark:text-orange-400 border-orange-500/18',
  critical: 'bg-red-500/8 text-red-700 dark:text-red-400 border-red-500/22',
  private: 'bg-purple-500/8 text-purple-700 dark:text-purple-400 border-purple-500/18',
  success: 'bg-emerald-500/8 text-emerald-800 dark:text-emerald-400 border-emerald-500/18',
  ongoing: 'bg-amber-500/8 text-amber-700 dark:text-amber-400 border-amber-500/18',
  completed: 'bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 border-emerald-500/18',
};

interface TripStatusBadgeProps {
  label: string;
  tone?: keyof typeof TONE_CLASS;
  className?: string;
}

export function TripStatusBadge({ label, tone = 'neutral', className }: TripStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide',
        TONE_CLASS[tone] ?? TONE_CLASS.neutral,
        className,
      )}
    >
      {label}
    </span>
  );
}
