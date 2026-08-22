import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../../components/ui/utils';
import { shouldShowBottomScrollFade } from './dashboardPanelScrollBlur';

interface DashboardPanelScrollBlurProps {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
}

const SCROLL_BODY_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y scrollbar-thin [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]';

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
    <div className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div
        ref={scrollRef}
        className={cn(SCROLL_BODY_CLASS, scrollClassName)}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {children}
      </div>
      {showBottomFade ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-10',
            'bg-gradient-to-t from-[color:var(--surface-premium-bg-end)]/55 via-[color:var(--surface-premium-bg-end)]/18 to-transparent',
            'backdrop-blur-[2px] supports-[backdrop-filter]:backdrop-blur-[2px]',
            'motion-reduce:backdrop-blur-none',
          )}
        />
      ) : null}
    </div>
  );
}
