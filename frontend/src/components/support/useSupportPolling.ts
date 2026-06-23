import { useEffect, useRef, useState } from 'react';

interface UseSupportPollingOptions {
  enabled?: boolean;
  listIntervalMs?: number;
  detailIntervalMs?: number;
  onListRefresh: () => void | Promise<void>;
  onDetailRefresh?: () => void | Promise<void>;
  detailActive?: boolean;
}

export function useSupportPolling({
  enabled = true,
  listIntervalMs = 30_000,
  detailIntervalMs = 20_000,
  onListRefresh,
  onDetailRefresh,
  detailActive = false,
}: UseSupportPollingOptions) {
  const listRef = useRef(onListRefresh);
  const detailRef = useRef(onDetailRefresh);
  listRef.current = onListRefresh;
  detailRef.current = onDetailRefresh;

  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!enabled || !visible) return;
    const id = window.setInterval(() => void listRef.current(), listIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, visible, listIntervalMs]);

  useEffect(() => {
    if (!enabled || !visible || !detailActive || !detailRef.current) return;
    const id = window.setInterval(() => void detailRef.current?.(), detailIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, visible, detailActive, detailIntervalMs]);
}
