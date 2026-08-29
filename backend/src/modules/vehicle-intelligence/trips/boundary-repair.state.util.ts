/**
 * Durable boundary-repair + downstream-refresh state helpers.
 *
 * Persisted on VehicleTrip.rawDetectionMeta.boundaryRefresh and mirrored on
 * TripRepair.detectorEvidence.boundaryRefreshState for audit recovery.
 */

export type BoundaryRefreshState = 'PENDING' | 'ENQUEUED' | 'COMPLETED';

export interface BoundaryRefreshRecord {
  state: BoundaryRefreshState;
  requestedAt: string;
  enqueuedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  attempts: number;
}

export const MAX_BOUNDARY_REPAIR_HISTORY_ENTRIES = 20;

export function readRawDetectionMeta(
  raw: unknown,
): Record<string, unknown> {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function normalizeBoundaryRepairHistory(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function appendBoundaryRepairHistory(
  priorMeta: Record<string, unknown>,
  entry: Record<string, unknown>,
  maxEntries: number = MAX_BOUNDARY_REPAIR_HISTORY_ENTRIES,
): unknown[] {
  const history = normalizeBoundaryRepairHistory(priorMeta.boundaryRepairHistory);
  const next = [...history, entry];
  if (next.length <= maxEntries) return next;
  return next.slice(next.length - maxEntries);
}

export function readBoundaryRefreshRecord(
  raw: unknown,
): BoundaryRefreshRecord | null {
  const meta = readRawDetectionMeta(raw);
  const refresh = meta.boundaryRefresh;
  if (refresh == null || typeof refresh !== 'object' || Array.isArray(refresh)) {
    return null;
  }
  const record = refresh as Record<string, unknown>;
  const state = record.state;
  if (state !== 'PENDING' && state !== 'ENQUEUED' && state !== 'COMPLETED') {
    return null;
  }
  return {
    state,
    requestedAt: String(record.requestedAt ?? ''),
    enqueuedAt: record.enqueuedAt != null ? String(record.enqueuedAt) : null,
    completedAt: record.completedAt != null ? String(record.completedAt) : null,
    lastError: record.lastError != null ? String(record.lastError) : null,
    attempts: typeof record.attempts === 'number' ? record.attempts : 0,
  };
}

export function isBoundaryRefreshPending(raw: unknown): boolean {
  const record = readBoundaryRefreshRecord(raw);
  return record != null && (record.state === 'PENDING' || record.state === 'ENQUEUED');
}

export function buildBoundaryRefreshRecord(
  state: BoundaryRefreshState,
  prior: BoundaryRefreshRecord | null,
  error?: string,
): BoundaryRefreshRecord {
  const now = new Date().toISOString();
  const attempts = (prior?.attempts ?? 0) + (state === 'PENDING' && prior ? 1 : 0);
  return {
    state,
    requestedAt: prior?.requestedAt ?? now,
    enqueuedAt: state === 'ENQUEUED' || state === 'COMPLETED' ? now : prior?.enqueuedAt ?? null,
    completedAt: state === 'COMPLETED' ? now : prior?.completedAt ?? null,
    lastError: error ?? null,
    attempts: state === 'PENDING' ? Math.max(attempts, 1) : prior?.attempts ?? 0,
  };
}
