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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16"
        >
          <div
            className={cn(
              'absolute inset-0 backdrop-blur-[1.5px] supports-[backdrop-filter]:backdrop-blur-[1.5px]',
              'motion-reduce:backdrop-blur-none',
              '[mask-image:linear-gradient(to_top,black_0%,black_18%,rgba(0,0,0,0.72)_42%,rgba(0,0,0,0.28)_68%,transparent_100%)]',
              '[-webkit-mask-image:linear-gradient(to_top,black_0%,black_18%,rgba(0,0,0,0.72)_42%,rgba(0,0,0,0.28)_68%,transparent_100%)]',
            )}
          />
          <div
            className={cn(
              'absolute inset-0',
              'bg-[linear-gradient(to_top,color-mix(in_srgb,var(--surface-premium-bg-end)_24%,transparent)_0%,color-mix(in_srgb,var(--surface-premium-bg-end)_12%,transparent)_32%,color-mix(in_srgb,var(--surface-premium-bg-end)_4%,transparent)_62%,transparent_100%)]',
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
