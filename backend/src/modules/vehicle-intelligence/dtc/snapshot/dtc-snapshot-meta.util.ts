import { createHash } from 'crypto';
const META_KEY = 'dtc01aSnapshot';

/** Legacy VLS rawPayloadJson meta (superseded by vehicle_dtc_source_heads in 01B). */
export interface DtcSnapshotMetaV1 {
  version: 1;
  lastAcceptedSourceAtMs: number | null;
  lastAcceptedCodesHash: string | null;
  lastAcceptedBindingId: string | null;
  lastFetchAtMs: number | null;
  lastDecisionOutcome: string | null;
  lastDecisionAtMs: number | null;
}

export function hashDtcCodesContent(codes: string[]): string {
  const canonical = [...codes].sort().join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function parseProviderObservedAt(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function readDtcSnapshotMeta(rawPayloadJson: unknown): DtcSnapshotMetaV1 | null {
  if (!rawPayloadJson || typeof rawPayloadJson !== 'object') return null;
  const root = rawPayloadJson as Record<string, unknown>;
  const meta = root[META_KEY];
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  if (m.version !== 1) return null;
  return {
    version: 1,
    lastAcceptedSourceAtMs:
      typeof m.lastAcceptedSourceAtMs === 'number' ? m.lastAcceptedSourceAtMs : null,
    lastAcceptedCodesHash:
      typeof m.lastAcceptedCodesHash === 'string' ? m.lastAcceptedCodesHash : null,
    lastAcceptedBindingId:
      typeof m.lastAcceptedBindingId === 'string' ? m.lastAcceptedBindingId : null,
    lastFetchAtMs: typeof m.lastFetchAtMs === 'number' ? m.lastFetchAtMs : null,
    lastDecisionOutcome:
      typeof m.lastDecisionOutcome === 'string' ? m.lastDecisionOutcome : null,
    lastDecisionAtMs: typeof m.lastDecisionAtMs === 'number' ? m.lastDecisionAtMs : null,
  };
}

export function mergeDtcSnapshotMeta(
  rawPayloadJson: unknown,
  patch: Partial<DtcSnapshotMetaV1>,
): Record<string, unknown> {
  const base =
    rawPayloadJson && typeof rawPayloadJson === 'object'
      ? { ...(rawPayloadJson as Record<string, unknown>) }
      : {};
  const prev = readDtcSnapshotMeta(base) ?? {
    version: 1,
    lastAcceptedSourceAtMs: null,
    lastAcceptedCodesHash: null,
    lastAcceptedBindingId: null,
    lastFetchAtMs: null,
    lastDecisionOutcome: null,
    lastDecisionAtMs: null,
  };
  base[META_KEY] = { ...prev, ...patch, version: 1 };
  return base;
}
