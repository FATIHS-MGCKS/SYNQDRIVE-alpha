import type { ReactNode } from 'react';
import { cn } from '../ui/utils';

export type AppShellVariant = 'rental' | 'master';

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Optional right context panel (Master admin). */
  rightPanel?: ReactNode;
  variant?: AppShellVariant;
  className?: string;
}

const shellContentPadding: Record<AppShellVariant, string> = {
  rental: 'px-5 sm:px-7 lg:px-[100px] pt-4 lg:pt-6 pb-8',
  master: 'px-4 sm:px-6 lg:px-8 pt-3 lg:pt-4 pb-6',
};

const shellMaxWidth: Record<AppShellVariant, string> = {
  rental: 'max-w-[1440px]',
  master: 'max-w-[1400px]',
};

/**
 * Shared application chrome: sidebar + scrollable main column (+ optional right panel).
 * Rental and Master use the same structural rhythm; only gutters/max-width differ.
 */
export function AppShell({
  sidebar,
  children,
  rightPanel,
  variant = 'rental',
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(
        'h-screen w-full flex overflow-hidden bg-background transition-colors duration-300 relative',
        className,
      )}
      style={{ fontFamily: "'Manrope', sans-serif" }}
    >
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden pt-16 lg:pt-0 min-w-0">
        <div
          className={cn('flex-1 overflow-auto overflow-x-clip text-foreground', shellContentPadding[variant])}
        >
          <div
            className={cn(
              shellMaxWidth[variant],
              'mx-auto w-full min-w-0',
              variant === 'rental' && 'text-[13px]',
            )}
          >
            {children}
          </div>
        </div>
      </div>
      {rightPanel}
    </div>
  );
}
