import { useEffect } from 'react';

/**
 * Mitigate browser back-forward cache retaining sensitive operator views.
 * On bfcache restore, invoke `onRestore` so callers can clear local state or redirect.
 */
export function useOperatorSensitiveView(onRestore?: () => void): void {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      onRestore?.();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [onRestore]);
}

/** Apply document-level hints for sensitive transient views. */
export function markOperatorSensitiveViewActive(active: boolean): void {
  const root = document.documentElement;
  if (active) {
    root.dataset.operatorSensitiveView = 'true';
  } else {
    delete root.dataset.operatorSensitiveView;
  }
}
