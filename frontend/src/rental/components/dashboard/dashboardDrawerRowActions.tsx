import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

export type DrawerRowActionTone = 'booking' | 'vehicle';

const toneClassName: Record<DrawerRowActionTone, string> = {
  booking:
    'border border-[color:color-mix(in_srgb,var(--brand)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--brand)_10%,transparent)] text-[color:var(--brand)] hover:bg-[color:color-mix(in_srgb,var(--brand)_16%,transparent)] hover:text-[color:var(--brand)]',
  vehicle:
    'border border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
};

export interface DrawerRowActionButtonProps {
  tone: DrawerRowActionTone;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}

/** Compact bordered CTA used in dashboard drill-down drawer row cards. */
export function DrawerRowActionButton({
  tone,
  children,
  onClick,
  className,
}: DrawerRowActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        toneClassName[tone],
        className,
      )}
    >
      {children}
      <Icon name="arrow-right" className="h-3 w-3 opacity-70" />
    </button>
  );
}
