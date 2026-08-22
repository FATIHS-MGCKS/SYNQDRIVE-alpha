import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';

interface UtilizationMonthNavProps {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  className?: string;
}

export function UtilizationMonthNav({
  label,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  className,
}: UtilizationMonthNavProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={onPrevious}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        aria-label={previousLabel}
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[7.5rem] text-center text-[11px] font-semibold tabular-nums text-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        aria-label={nextLabel}
      >
        <Icon name="chevron-right" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
