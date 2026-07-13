import type { ReactNode } from 'react';
import { cn } from '../../components/ui/utils';

interface OperatorGlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
  disabled?: boolean;
  /** `chrome` = nav/header frost; `content` = list/panel premium solid */
  variant?: 'chrome' | 'content';
}

export function OperatorGlassCard({
  children,
  className,
  onClick,
  as = 'div',
  disabled,
  variant = 'content',
}: OperatorGlassCardProps) {
  const surface = variant === 'chrome' ? 'surface-frosted' : 'surface-premium';
  const base = cn(
    `${surface} rounded-2xl border border-border/60 shadow-[var(--shadow-1)]`,
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
