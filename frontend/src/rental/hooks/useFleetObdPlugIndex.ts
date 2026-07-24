import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../lib/api';
import { buildObdPlugIndex } from '../lib/obd-plug-status';
import { isDeviceConnectionForbiddenError } from '../lib/device-connection-ui';
import { useDocumentVisible } from './useBrowserTabSignals';

const CACHE_TTL_MS = 90_000;
const orgCache = new Map<string, { map: Map<string, boolean | null>; fetchedAt: number }>();

export type FleetObdPlugIndexStatus = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error';

export interface FleetObdPlugIndexResult {
  map: Map<string, boolean | null>;
  status: FleetObdPlugIndexStatus;
}

/**
 * Read-only index of snapshot `obdIsPluggedIn` per vehicle from the existing
 * fleet-connectivity API (same source as Fleet Connectivity / Technical Telemetry).
 */
export function useFleetObdPlugIndex(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
): FleetObdPlugIndexResult {
  const isDocumentVisible = useDocumentVisible();
  const enabled = (options?.enabled ?? true) && isDocumentVisible;
  const [map, setMap] = useState<Map<string, boolean | null>>(() => {
    if (!orgId) return new Map();
    const cached = orgCache.get(orgId);
    return cached?.map ?? new Map();
  });
  const [status, setStatus] = useState<FleetObdPlugIndexStatus>('idle');

  useEffect(() => {
    if (!orgId || !enabled) {
      if (!orgId) {
        setMap(new Map());
        setStatus('idle');
      }
      return;
    }

    const cached = orgCache.get(orgId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setMap(cached.map);
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    api.vehicles
      .fleetConnectivity(orgId, { limit: 500 })
      .then((res) => {
        if (cancelled) return;
        const next = buildObdPlugIndex(res.vehicles ?? []);
        orgCache.set(orgId, { map: next, fetchedAt: Date.now() });
        setMap(next);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        const message = getErrorMessage(err);
        setStatus(
          isDeviceConnectionForbiddenError(message) ? 'forbidden' : 'error',
        );
        setMap(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, enabled]);

  return { map, status };
}
