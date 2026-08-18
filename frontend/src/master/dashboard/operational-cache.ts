import type { MasterDashboardOperationalDto } from './types';

const STALE_MS = 5 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

type Listener = () => void;

let cached: MasterDashboardOperationalDto | null = null;
let cachedAt = 0;
let inflight: Promise<MasterDashboardOperationalDto> | null = null;
const listeners = new Set<Listener>();

export function subscribeOperationalDashboard(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

export function getCachedOperationalDashboard(): {
  data: MasterDashboardOperationalDto | null;
  fetchedAt: number;
  isStale: boolean;
} {
  return {
    data: cached,
    fetchedAt: cachedAt,
    isStale: cached != null && Date.now() - cachedAt > STALE_MS,
  };
}

export async function fetchOperationalDashboard(
  force = false,
): Promise<MasterDashboardOperationalDto> {
  if (!force && cached && Date.now() - cachedAt < REFRESH_MS) {
    return cached;
  }
  if (inflight) return inflight;

  const { api } = await import('../../lib/api');
  inflight = api.admin.dashboardOperational().then((data) => {
    cached = data;
    cachedAt = Date.now();
    inflight = null;
    notify();
    return data;
  }).catch((err) => {
    inflight = null;
    throw err;
  });

  return inflight;
}

export function invalidateOperationalDashboard() {
  cached = null;
  cachedAt = 0;
  notify();
}

export const OPERATIONAL_STALE_MS = STALE_MS;
export const OPERATIONAL_REFRESH_MS = REFRESH_MS;
