import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { buildObdPlugIndex } from '../lib/obd-plug-status';

const CACHE_TTL_MS = 90_000;
const orgCache = new Map<string, { map: Map<string, boolean | null>; fetchedAt: number }>();

/**
 * Read-only index of snapshot `obdIsPluggedIn` per vehicle from the existing
 * fleet-connectivity API (same source as Fleet Connectivity / Technical Telemetry).
 */
export function useFleetObdPlugIndex(orgId: string | null | undefined): Map<string, boolean | null> {
  const [map, setMap] = useState<Map<string, boolean | null>>(() => {
    if (!orgId) return new Map();
    const cached = orgCache.get(orgId);
    return cached?.map ?? new Map();
  });

  useEffect(() => {
    if (!orgId) {
      setMap(new Map());
      return;
    }

    const cached = orgCache.get(orgId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setMap(cached.map);
      return;
    }

    let cancelled = false;
    api.vehicles
      .fleetConnectivity(orgId, { limit: 500 })
      .then((res) => {
        if (cancelled) return;
        const next = buildObdPlugIndex(res.vehicles ?? []);
        orgCache.set(orgId, { map: next, fetchedAt: Date.now() });
        setMap(next);
      })
      .catch(() => {
        if (!cancelled) setMap(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return map;
}
