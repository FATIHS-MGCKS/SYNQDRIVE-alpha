import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import type { OperatorTodaySectionVariant } from '../views/operatorTodayView.utils';

interface OperatorTodaySectionProps {
  title: string;
  subtitle?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
  variant?: OperatorTodaySectionVariant;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideWhenEmpty?: boolean;
  loading?: boolean;
  error?: ReactNode;
}

const VARIANT_STYLES: Record<OperatorTodaySectionVariant, string> = {
  critical: 'border-l-2 border-[color:var(--status-critical)]/70 pl-3',
  default: '',
  team: 'border-l-2 border-[color:var(--brand)]/35 pl-3',
};

export function OperatorTodaySection({
  title,
  subtitle,
  count,
  action,
  children,
  empty,
  isEmpty,
  variant = 'default',
  collapsible = false,
  defaultCollapsed = false,
  open: openProp,
  onOpenChange,
  hideWhenEmpty = false,
  loading = false,
  error,
}: OperatorTodaySectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(!defaultCollapsed);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  if (hideWhenEmpty && isEmpty && !loading && !error) {
    return null;
  }

  const header = (
    <div className="flex min-h-[44px] items-start justify-between gap-2 px-0.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h2>
          {typeof count === 'number' && count > 0 && (
            <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {action}
        {collapsible && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden
          />
        )}
      </div>
    </div>
  );

  const body = (
    <>
      {loading && children}
      {!loading && error}
      {!loading && !error && isEmpty && empty}
      {!loading && !error && !isEmpty && children}
    </>
  );

  if (!collapsible) {
    return (
      <section className={cn('space-y-2.5', VARIANT_STYLES[variant])}>
        {header}
        {body}
      </section>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('space-y-2.5', VARIANT_STYLES[variant])}
    >
      <section>
        <CollapsibleTrigger className="sq-press w-full rounded-xl text-left">
          {header}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2.5 space-y-2 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          {body}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
