import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';

interface BuilderFieldProps {
  label: string;
  help?: string;
  htmlFor?: string;
  required?: boolean;
  charCount?: { current: number; max: number };
  children: ReactNode;
  className?: string;
}

export function BuilderField({
  label,
  help,
  htmlFor,
  required,
  charCount,
  children,
  className,
}: BuilderFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] font-semibold text-foreground">
          {label}
          {required && <span className="ml-0.5 text-[color:var(--status-critical)]">*</span>}
        </label>
        {charCount && (
          <span
            className={cn(
              'shrink-0 text-[10px] tabular-nums text-muted-foreground',
              charCount.current > charCount.max && 'text-[color:var(--status-critical)]',
            )}
          >
            {charCount.current}/{charCount.max}
          </span>
        )}
      </div>
      {help && <p className="text-[10px] leading-relaxed text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}

export const builderInputCls =
  'w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--brand)]/40 focus:ring-2 focus:ring-[color:var(--brand)]/10';

export const builderTextareaCls = `${builderInputCls} resize-y min-h-[88px]`;
