import type { ReactNode } from 'react';
import { cn } from '../../components/ui/utils';

interface OperatorGlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
  disabled?: boolean;
}

export function OperatorGlassCard({
  children,
  className,
  onClick,
  as = 'div',
  disabled,
}: OperatorGlassCardProps) {
  const base = cn(
    'surface-frosted rounded-2xl border border-border/60 shadow-[var(--shadow-1)]',
    onClick && !disabled && 'sq-press cursor-pointer active:scale-[0.99]',
    disabled && 'opacity-60 pointer-events-none',
    className,
  );

  if (as === 'button') {
    return (
      <button type="button" className={cn(base, 'w-full text-left')} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  }

  return (
    <div className={base} onClick={disabled ? undefined : onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  );
}
