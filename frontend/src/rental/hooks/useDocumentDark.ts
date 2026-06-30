import { useSyncExternalStore } from 'react';

/** Mirrors `document.documentElement.classList.contains('dark')` for CDN logo contrast. */
export function useDocumentDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}
