import type { MasterDashboardOperationalDto } from './types';

const STALE_MS = 5 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

type Listener = () => void;

export interface OperationalDashboardSnapshot {
  data: MasterDashboardOperationalDto | null;
  fetchedAt: number;
  revision: number;
}

let cached: MasterDashboardOperationalDto | null = null;
let cachedAt = 0;
let inflight: Promise<MasterDashboardOperationalDto> | null = null;
const listeners = new Set<Listener>();

let snapshot: OperationalDashboardSnapshot = {
  data: null,
  fetchedAt: 0,
  revision: 0,
};

function commitSnapshot(): void {
  snapshot = {
    data: cached,
    fetchedAt: cachedAt,
    revision: snapshot.revision + 1,
  };
}

export function subscribeOperationalDashboard(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

/** Stable snapshot for `useSyncExternalStore` — same reference until the store updates. */
export function getOperationalDashboardSnapshot(): OperationalDashboardSnapshot {
  return snapshot;
}

export function getCachedOperationalDashboard(): {
  data: MasterDashboardOperationalDto | null;
  fetchedAt: number;
  isStale: boolean;
} {
  return {
    data: snapshot.data,
    fetchedAt: snapshot.fetchedAt,
    isStale: snapshot.data != null && Date.now() - snapshot.fetchedAt > STALE_MS,
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
    commitSnapshot();
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
  commitSnapshot();
  notify();
}

export const OPERATIONAL_STALE_MS = STALE_MS;
export const OPERATIONAL_REFRESH_MS = REFRESH_MS;

/** Test helper — seed cache without network. */
export function __setOperationalDashboardForTests(
  data: MasterDashboardOperationalDto | null,
  fetchedAt = Date.now(),
): void {
  cached = data;
  cachedAt = fetchedAt;
  commitSnapshot();
  notify();
}

/** Test helper — reset module state. */
export function __resetOperationalDashboardForTests(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
  snapshot = { data: null, fetchedAt: 0, revision: 0 };
  listeners.clear();
}
