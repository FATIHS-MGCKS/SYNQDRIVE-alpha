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

export interface CanonicalObdPhysicalEvidence extends ObdPlugSignalEvidence {
  candidateState: 'PLUGGED' | 'UNPLUGGED';
}

export interface VehicleLatestStateObdRow {
  organizationId: string;
  vehicleId: string;
  dimoTokenId: number | null;
  providerBindingId: string | null;
  rawPayloadJson: unknown;
}

export interface SnapshotObdPhysicalEvidence extends CanonicalObdPhysicalEvidence {
  binding: PhysicalStateBindingScope;
  evidenceReferenceId: string;
}

export interface WebhookObdPhysicalEvidence extends CanonicalObdPhysicalEvidence {
  binding: PhysicalStateBindingScope;
  evidenceReferenceId: string;
}

function parseObdTimestamp(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return null;
}

/**
 * Canonical OBD plug value parser — shared across snapshot, VLS payload, and webhook paths.
 */
export function parseObdPlugValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

function extractFromObdNode(obdNode: unknown): ObdPlugSignalEvidence | null {
  if (obdNode == null) return null;

  let plugged: boolean | null = null;
  let timestampRaw: unknown = null;

  if (typeof obdNode === 'boolean') {
    plugged = obdNode;
  } else if (typeof obdNode === 'object') {
    const record = obdNode as Record<string, unknown>;
    plugged = parseObdPlugValue(record.value ?? obdNode);
    timestampRaw = record.timestamp;
  }

  if (plugged == null) return null;

  const evidenceObservedAt = parseObdTimestamp(timestampRaw);
  if (!evidenceObservedAt) return null;

  return {
    obdIsPluggedIn: plugged,
    evidenceObservedAt,
  };
}

/**
 * Extract OBD physical evidence from a live DIMO GraphQL signals map.
 * Uses per-signal obdIsPluggedIn.timestamp only — never aggregate lastSeen.
 */
export function extractObdPlugSignalFromSignals(
  signals: Record<string, unknown> | null | undefined,
): ObdPlugSignalEvidence | null {
  if (!signals || typeof signals !== 'object') return null;
  return extractFromObdNode(signals.obdIsPluggedIn);
}

export function extractObdPlugSignalEvidenceFromSnapshotPayload(
  rawPayload: unknown,
): ObdPlugSignalEvidence | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  return extractFromObdNode(payload.obdIsPluggedIn);
}

export function extractWebhookObdPhysicalEvidence(input: {
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
  pluggedIn: boolean;
  observedAt: Date;
  evidenceReferenceId: string;
}): WebhookObdPhysicalEvidence | null {
  if (!input.observedAt || Number.isNaN(input.observedAt.getTime())) {
    return null;
  }

  const binding = buildBindingScopeFromToken({
    provider: input.provider,
    tokenId: input.tokenId,
    deviceBindingId: input.deviceBindingId ?? null,
  });

  return {
    obdIsPluggedIn: input.pluggedIn,
    evidenceObservedAt: input.observedAt,
    candidateState: mapObdBooleanToEffectiveState(input.pluggedIn),
    binding,
    evidenceReferenceId: input.evidenceReferenceId,
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

export function extractSnapshotObdPhysicalEvidenceFromSignals(input: {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  deviceBindingId?: string | null;
  signals: Record<string, unknown>;
  evidenceReferenceId?: string;
}): SnapshotObdPhysicalEvidence | null {
  const extracted = extractObdPlugSignalFromSignals(input.signals);
  if (!extracted) return null;

  const binding = buildBindingScopeFromToken({
    provider: 'DIMO',
    tokenId: input.tokenId,
    deviceBindingId: input.deviceBindingId ?? null,
  });

  const evidenceReferenceId =
    input.evidenceReferenceId ??
    `snapshot-obd:${input.vehicleId}:${extracted.evidenceObservedAt.toISOString()}`;

  return {
    ...extracted,
    candidateState: mapObdBooleanToEffectiveState(extracted.obdIsPluggedIn),
    binding,
    evidenceReferenceId,
  };
}

/** @deprecated Use extractObdPlugSignalFromSignals — retained for episode-resolution compat shape */
export function extractObdPlugSignalFromSnapshot(
  signals: Record<string, unknown> | null | undefined,
): { obdIsPluggedIn: boolean | null; providerObservedAt: Date | null } {
  const extracted = extractObdPlugSignalFromSignals(signals);
  if (!extracted) {
    return { obdIsPluggedIn: null, providerObservedAt: null };
  }
  return {
    obdIsPluggedIn: extracted.obdIsPluggedIn,
    providerObservedAt: extracted.evidenceObservedAt,
  };
}
