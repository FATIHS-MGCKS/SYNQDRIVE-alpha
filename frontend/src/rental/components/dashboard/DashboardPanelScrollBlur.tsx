import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';
import { DASHBOARD_LAYOUT } from './dashboardShell';
import { shouldShowBottomScrollFade } from './dashboardPanelScrollBlur';

interface DashboardPanelScrollBlurProps {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
}

/**
 * Scrollable dashboard panel body with a subtle bottom blur when more content
 * exists below the fold. Content clears as the user scrolls upward.
 */
export function DashboardPanelScrollBlur({
  children,
  className,
  scrollClassName,
}: DashboardPanelScrollBlurProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const syncFade = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(shouldShowBottomScrollFade(element));
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    syncFade();
    element.addEventListener('scroll', syncFade, { passive: true });
    const resizeObserver = new ResizeObserver(syncFade);
    resizeObserver.observe(element);
    for (const child of element.children) {
      resizeObserver.observe(child);
    }

    return () => {
      element.removeEventListener('scroll', syncFade);
      resizeObserver.disconnect();
    };
  }, [syncFade, children]);

  return (
    <div className={cn('relative min-h-0', className)}>
      <div
        ref={scrollRef}
        className={cn(DASHBOARD_LAYOUT.notificationsPanelScroll, scrollClassName)}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-10',
          'bg-gradient-to-t from-[color:var(--surface-premium-bg-end)]/95 via-[color:var(--surface-premium-bg-end)]/45 to-transparent',
          'backdrop-blur-[1.5px] supports-[backdrop-filter]:backdrop-blur-[1.5px]',
          'transition-opacity duration-200 motion-reduce:backdrop-blur-none motion-reduce:transition-none',
          showBottomFade ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
