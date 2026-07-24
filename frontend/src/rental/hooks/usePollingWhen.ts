import { useEffect, useRef } from 'react';

/**
 * Runs `callback` immediately and on a fixed interval while `enabled`.
 * Clears the timer on disable/unmount — no orphaned intervals.
 */
export function usePollingWhen(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void callbackRef.current();
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
