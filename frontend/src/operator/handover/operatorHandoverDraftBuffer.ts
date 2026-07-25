import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorHandoverStepId } from './operatorHandoverPayload';

const STORAGE_KEY = 'sq:operator-handover-draft-buffer';
const TTL_MS = 5 * 60 * 1000;

export interface OperatorHandoverDraftBufferEntry {
  orgId: string;
  bookingId: string;
  kind: HandoverDialogKind;
  sessionId: string;
  version: number;
  step: OperatorHandoverStepId;
  updatedAt: number;
}

function readAll(): OperatorHandoverDraftBufferEntry[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function writeAll(entries: OperatorHandoverDraftBufferEntry[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (entries.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota or private mode */
  }
}

function isValidEntry(value: unknown): value is OperatorHandoverDraftBufferEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.orgId === 'string' &&
    typeof row.bookingId === 'string' &&
    (row.kind === 'PICKUP' || row.kind === 'RETURN') &&
    typeof row.sessionId === 'string' &&
    typeof row.version === 'number' &&
    typeof row.step === 'string' &&
    typeof row.updatedAt === 'number'
  );
}

function pruneExpired(entries: OperatorHandoverDraftBufferEntry[]): OperatorHandoverDraftBufferEntry[] {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((e) => e.updatedAt >= cutoff);
}

export function draftBufferKey(
  orgId: string,
  bookingId: string,
  kind: HandoverDialogKind,
): string {
  return `${orgId}:${bookingId}:${kind}`;
}

export function writeOperatorHandoverDraftBuffer(entry: OperatorHandoverDraftBufferEntry): void {
  const entries = pruneExpired(readAll()).filter(
    (e) => draftBufferKey(e.orgId, e.bookingId, e.kind) !== draftBufferKey(entry.orgId, entry.bookingId, entry.kind),
  );
  entries.push({ ...entry, updatedAt: Date.now() });
  writeAll(entries);
}

export function readOperatorHandoverDraftBuffer(
  orgId: string,
  bookingId: string,
  kind: HandoverDialogKind,
): OperatorHandoverDraftBufferEntry | null {
  const key = draftBufferKey(orgId, bookingId, kind);
  const match = pruneExpired(readAll()).find(
    (e) => draftBufferKey(e.orgId, e.bookingId, e.kind) === key,
  );
  return match ?? null;
}

export function clearOperatorHandoverDraftBuffer(
  orgId: string,
  bookingId: string,
  kind: HandoverDialogKind,
): void {
  const key = draftBufferKey(orgId, bookingId, kind);
  const next = pruneExpired(readAll()).filter(
    (e) => draftBufferKey(e.orgId, e.bookingId, e.kind) !== key,
  );
  writeAll(next);
}

export function listOperatorHandoverDraftBuffers(orgId: string): OperatorHandoverDraftBufferEntry[] {
  return pruneExpired(readAll()).filter((e) => e.orgId === orgId);
}
