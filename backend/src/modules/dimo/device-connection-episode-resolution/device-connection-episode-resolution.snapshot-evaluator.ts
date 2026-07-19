import type { DeviceConnectionEpisode } from '@prisma/client';

export type SnapshotPlugRejectReason =
  | 'obd_null'
  | 'obd_false'
  | 'no_open_episode'
  | 'already_resolved'
  | 'same_snapshot_already_applied'
  | 'binding_mismatch'
  | 'provider_mismatch'
  | 'organization_mismatch'
  | 'observed_before_unplug'
  | 'received_before_unplug'
  | 'non_physical_obd_hardware'
  | 'non_physical_snapshot_source'
  | 'synthetic_snapshot_source';

export type SnapshotPlugEvaluationOutcome =
  | { action: 'resolve'; providerObservedAt: Date; resolvedAt: Date }
  | { action: 'reject'; reason: SnapshotPlugRejectReason }
  | { action: 'noop'; reason: 'already_resolved' | 'same_snapshot_already_applied' };

export interface SnapshotPlugSignalInput {
  organizationId: string;
  vehicleId: string;
  provider: string;
  hardwareType: string | null;
  obdIsPluggedIn: boolean | null;
  providerObservedAt: Date | null;
  receivedAt: Date;
  snapshotSource: string | null;
  providerBindingId: string | null;
  snapshotReferenceId: string;
  sourceSubtype: string | null;
}

export function isPhysicalObdHardware(hardwareType: string | null | undefined): boolean {
  return (hardwareType ?? '').trim().toUpperCase() === 'LTE_R1';
}

export function isPhysicalObdSnapshotSource(input: {
  snapshotSource: string | null;
  sourceSubtype: string | null;
}): boolean {
  const source = (input.snapshotSource ?? '').trim().toUpperCase();
  const subtype = (input.sourceSubtype ?? '').trim().toUpperCase();
  if (subtype.includes('SYNTHETIC')) return false;
  if (subtype.includes('OEM') && !subtype.includes('OBD')) return false;
  return source === 'DIMO' || source === '';
}

export function evaluateSnapshotPlugResolution(
  input: SnapshotPlugSignalInput,
  episode: DeviceConnectionEpisode | null,
): SnapshotPlugEvaluationOutcome {
  if (input.obdIsPluggedIn == null) {
    return { action: 'reject', reason: 'obd_null' };
  }
  if (input.obdIsPluggedIn === false) {
    return { action: 'reject', reason: 'obd_false' };
  }

  if (!episode) {
    return { action: 'reject', reason: 'no_open_episode' };
  }

  if (episode.organizationId !== input.organizationId) {
    return { action: 'reject', reason: 'organization_mismatch' };
  }

  if (episode.vehicleId !== input.vehicleId) {
    return { action: 'reject', reason: 'provider_mismatch' };
  }

  if (episode.provider !== input.provider) {
    return { action: 'reject', reason: 'provider_mismatch' };
  }

  if (episode.status !== 'OPEN') {
    if (episode.resolutionSnapshotId === input.snapshotReferenceId) {
      return { action: 'noop', reason: 'same_snapshot_already_applied' };
    }
    return { action: 'noop', reason: 'already_resolved' };
  }

  if (!isPhysicalObdHardware(input.hardwareType)) {
    return { action: 'reject', reason: 'non_physical_obd_hardware' };
  }

  if (!isPhysicalObdSnapshotSource(input)) {
    if ((input.sourceSubtype ?? '').toUpperCase().includes('SYNTHETIC')) {
      return { action: 'reject', reason: 'synthetic_snapshot_source' };
    }
    return { action: 'reject', reason: 'non_physical_snapshot_source' };
  }

  if (
    episode.deviceBindingId != null &&
    input.providerBindingId != null &&
    episode.deviceBindingId !== input.providerBindingId
  ) {
    return { action: 'reject', reason: 'binding_mismatch' };
  }

  if (!input.providerObservedAt) {
    return { action: 'reject', reason: 'observed_before_unplug' };
  }

  if (input.providerObservedAt.getTime() <= episode.openedAt.getTime()) {
    return { action: 'reject', reason: 'observed_before_unplug' };
  }

  if (input.receivedAt.getTime() <= episode.openedAt.getTime()) {
    return { action: 'reject', reason: 'received_before_unplug' };
  }

  return {
    action: 'resolve',
    providerObservedAt: input.providerObservedAt,
    resolvedAt: input.providerObservedAt,
  };
}

export function buildSnapshotReferenceId(input: {
  vehicleLatestStateId: string;
  providerObservedAt: Date;
}): string {
  return `vls:${input.vehicleLatestStateId}:obd:${input.providerObservedAt.toISOString()}`;
}

export function extractObdPlugSignalFromSnapshot(
  signals: Record<string, unknown> | null | undefined,
): { obdIsPluggedIn: boolean | null; providerObservedAt: Date | null } {
  if (!signals || typeof signals !== 'object') {
    return { obdIsPluggedIn: null, providerObservedAt: null };
  }

  const field = signals.obdIsPluggedIn;
  if (field == null) {
    return { obdIsPluggedIn: null, providerObservedAt: null };
  }

  let obdIsPluggedIn: boolean | null = null;
  if (typeof field === 'boolean') {
    obdIsPluggedIn = field;
  } else if (typeof field === 'object' && field !== null && 'value' in field) {
    const value = (field as { value?: unknown }).value;
    if (typeof value === 'boolean') obdIsPluggedIn = value;
    else if (typeof value === 'number' && Number.isFinite(value)) {
      obdIsPluggedIn = value >= 0.5;
    }
  }

  let providerObservedAt: Date | null = null;
  if (typeof field === 'object' && field !== null && 'timestamp' in field) {
    const ts = (field as { timestamp?: unknown }).timestamp;
    if (typeof ts === 'number' || typeof ts === 'string') {
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) providerObservedAt = parsed;
    }
  }

  return { obdIsPluggedIn, providerObservedAt };
}
