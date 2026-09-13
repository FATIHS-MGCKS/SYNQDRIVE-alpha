import {
  buildBindingScopeFromToken,
} from './device-connection-physical-state.binding';
import type { PhysicalStateBindingScope } from './device-connection-physical-state.types';

function mapObdBooleanToEffectiveState(plugged: boolean): 'PLUGGED' | 'UNPLUGGED' {
  return plugged ? 'PLUGGED' : 'UNPLUGGED';
}

/**
 * Extract authoritative physical OBD evidence timestamp from snapshot/VLS payloads.
 *
 * PRIMARY: per-signal obdIsPluggedIn.timestamp
 * Never use providerFetchedAt / poll time / receivedAt for physical ordering.
 */
export interface ObdPlugSignalEvidence {
  obdIsPluggedIn: boolean;
  evidenceObservedAt: Date;
}

export interface VehicleLatestStateObdRow {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number | null;
  providerBindingId: string | null;
  rawPayloadJson: unknown;
}

export interface SnapshotObdPhysicalEvidence extends ObdPlugSignalEvidence {
  candidateState: 'PLUGGED' | 'UNPLUGGED';
  binding: PhysicalStateBindingScope;
  evidenceReferenceId: string;
}

function parseObdTimestamp(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return null;
}

export function extractObdPlugSignalEvidenceFromSnapshotPayload(
  rawPayload: unknown,
): ObdPlugSignalEvidence | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  const obdNode = payload.obdIsPluggedIn;
  if (!obdNode || typeof obdNode !== 'object') return null;

  const obdRecord = obdNode as Record<string, unknown>;
  const value = obdRecord.value;
  let plugged: boolean | null = null;
  if (typeof value === 'boolean') plugged = value;
  else if (typeof value === 'number' && Number.isFinite(value)) plugged = value >= 0.5;
  else if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') plugged = true;
    if (normalized === 'false' || normalized === '0') plugged = false;
  }
  if (plugged == null) return null;

  const evidenceObservedAt = parseObdTimestamp(obdRecord.timestamp);
  if (!evidenceObservedAt) return null;

  return {
    obdIsPluggedIn: plugged,
    evidenceObservedAt,
  };
}

export function extractObdIsPluggedInEvidence(
  row: VehicleLatestStateObdRow,
): SnapshotObdPhysicalEvidence | null {
  const extracted = extractObdPlugSignalEvidenceFromSnapshotPayload(row.rawPayloadJson);
  if (!extracted || row.dimoTokenId == null) {
    return null;
  }

  const binding = buildBindingScopeFromToken({
    provider: 'DIMO',
    tokenId: row.dimoTokenId,
    deviceBindingId: row.providerBindingId,
  });

  return {
    ...extracted,
    candidateState: mapObdBooleanToEffectiveState(extracted.obdIsPluggedIn),
    binding,
    evidenceReferenceId: `snapshot-obd:${row.vehicleId}:${extracted.evidenceObservedAt.toISOString()}`,
  };
}
