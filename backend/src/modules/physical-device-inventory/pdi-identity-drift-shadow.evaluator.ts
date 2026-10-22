import { PDI_IDENTITY_DRIFT_MIRROR_MAX_AGE_MS } from './pdi-identity-drift-shadow.config';
import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
  type PdiIdentityDriftConfidence as DriftConfidenceLevel,
  type PdiIdentityDriftEvaluationRow,
  type PdiInstalledDeviceObservationInput,
} from './pdi-identity-drift-shadow.types';
import {
  buildDriftSignature,
  fingerprintMirrorSnapshot,
  maskR1Serial,
  normalizeR1Serial,
} from './pdi-identity-drift-shadow.serial';

export type InstalledSerialIndexEntry = {
  physicalDeviceId: string;
  vehicleId: string;
  expectedSerial: string;
};

export type EvaluateInstalledDeviceContext = {
  now: Date;
  syncRunId: string;
  /** All INSTALLED R1 devices with exactly one active INSTALL (fail-closed set). */
  installedByDeviceId: Map<string, PdiInstalledDeviceObservationInput>;
  /** canonical serial → installed device (first wins if duplicate — caller should fail-closed). */
  installedBySerial: Map<string, InstalledSerialIndexEntry>;
  /** All known PDI serials (any lifecycle), canonical upper */
  knownInventorySerials: Set<string>;
};

function isMirrorEvidenceFresh(syncedAt: Date | null, now: Date): boolean {
  if (!syncedAt) return false;
  return now.getTime() - syncedAt.getTime() <= PDI_IDENTITY_DRIFT_MIRROR_MAX_AGE_MS;
}

/**
 * Single reason per device — priority (first match wins among drift states):
 * IDENTITY_UNCONFIRMED > SWAP_SUSPECTED > UNKNOWN_DEVICE > ASSIGNMENT_MISMATCH > MATCH
 */
export function classifyInstalledDeviceObservation(
  device: PdiInstalledDeviceObservationInput,
  ctx: EvaluateInstalledDeviceContext,
): { reasonCode: PdiIdentityDriftReasonCode; detailCodes: string[] } {
  const details: string[] = [];

  if (device.activeInstallAssignmentCount !== 1) {
    details.push('AMBIGUOUS_ACTIVE_INSTALL_ASSIGNMENT');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }
  if (device.identityStatus !== 'VERIFIED') {
    details.push('PDI_IDENTITY_NOT_VERIFIED');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }
  if (device.inventoryStatus !== 'INSTALLED') {
    details.push('PDI_NOT_INSTALLED');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }
  if (!device.dimoTokenId) {
    details.push('VEHICLE_DIMO_TOKEN_MISSING');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }
  if (!isMirrorEvidenceFresh(device.mirrorSyncedAt, ctx.now)) {
    details.push('PROVIDER_MIRROR_STALE_OR_MISSING');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }

  const expected = normalizeR1Serial(device.expectedSerial);
  const observed = normalizeR1Serial(device.observedSerial);
  if (!expected) {
    details.push('PDI_EXPECTED_SERIAL_MISSING');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }
  if (!observed) {
    details.push('DIMO_OBSERVED_SERIAL_MISSING');
    return { reasonCode: PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED, detailCodes: details };
  }

  if (observed === expected) {
    return { reasonCode: PdiIdentityDriftReasonCode.MATCH, detailCodes: ['SERIAL_ALIGNED'] };
  }

  const otherInstall = ctx.installedBySerial.get(observed);
  if (
    otherInstall &&
    otherInstall.physicalDeviceId !== device.physicalDeviceId &&
    otherInstall.vehicleId !== device.vehicleId
  ) {
    details.push('OBSERVED_SERIAL_ACTIVE_ON_OTHER_VEHICLE');
    return { reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED, detailCodes: details };
  }

  if (!ctx.knownInventorySerials.has(observed)) {
    details.push('OBSERVED_SERIAL_NOT_IN_PDI_INVENTORY');
    return { reasonCode: PdiIdentityDriftReasonCode.UNKNOWN_DEVICE, detailCodes: details };
  }

  details.push('OBSERVED_SERIAL_KNOWN_BUT_NOT_EXPECTED_FOR_VEHICLE');
  return { reasonCode: PdiIdentityDriftReasonCode.ASSIGNMENT_MISMATCH, detailCodes: details };
}

export function evaluateInstalledDeviceRow(
  device: PdiInstalledDeviceObservationInput,
  ctx: EvaluateInstalledDeviceContext,
): PdiIdentityDriftEvaluationRow {
  const { reasonCode, detailCodes } = classifyInstalledDeviceObservation(device, ctx);
  const observationSnapshotFingerprint = fingerprintMirrorSnapshot({
    dimoTokenId: device.dimoTokenId,
    observedSerial: device.observedSerial,
    mirrorSyncedAt: device.mirrorSyncedAt,
    mirrorRawJsonSha256: device.mirrorRawJsonSha256,
  });

  const provenance = {
    source: 'DIMO_VEHICLE_MIRROR' as const,
    mirrorSyncedAt: device.mirrorSyncedAt?.toISOString() ?? null,
    observationSnapshotFingerprint,
    syncRunId: ctx.syncRunId,
  };

  let confidence: DriftConfidenceLevel = PdiIdentityDriftConfidence.HIGH;
  if (reasonCode !== PdiIdentityDriftReasonCode.MATCH) {
    if (detailCodes.includes('PROVIDER_MIRROR_STALE_OR_MISSING')) {
      confidence = PdiIdentityDriftConfidence.UNCONFIRMED;
    } else {
      confidence = PdiIdentityDriftConfidence.CANDIDATE;
    }
  }

  const driftSignature = buildDriftSignature({
    physicalDeviceId: device.physicalDeviceId,
    reasonCode,
    expectedSerial: device.expectedSerial,
    observedSerial: device.observedSerial,
  });

  return {
    physicalDeviceId: device.physicalDeviceId,
    vehicleId: device.vehicleId,
    dimoTokenId: device.dimoTokenId,
    reasonCode,
    confidence,
    expectedSerialMasked: maskR1Serial(device.expectedSerial) ?? '***',
    observedSerialMasked: maskR1Serial(device.observedSerial),
    provenance,
    driftSignature,
    detailCodes,
  };
}

export function buildEvaluationContext(input: {
  now: Date;
  syncRunId: string;
  devices: PdiInstalledDeviceObservationInput[];
  knownInventorySerials: Iterable<string>;
}): EvaluateInstalledDeviceContext {
  const installedByDeviceId = new Map<string, PdiInstalledDeviceObservationInput>();
  const installedBySerial = new Map<string, InstalledSerialIndexEntry>();
  const ambiguousSerials = new Set<string>();

  for (const d of input.devices) {
    installedByDeviceId.set(d.physicalDeviceId, d);
    if (d.activeInstallAssignmentCount !== 1 || d.inventoryStatus !== 'INSTALLED') {
      continue;
    }
    const serial = normalizeR1Serial(d.expectedSerial);
    if (!serial) continue;
    const existing = installedBySerial.get(serial);
    if (existing && existing.physicalDeviceId !== d.physicalDeviceId) {
      ambiguousSerials.add(serial);
      continue;
    }
    installedBySerial.set(serial, {
      physicalDeviceId: d.physicalDeviceId,
      vehicleId: d.vehicleId,
      expectedSerial: d.expectedSerial,
    });
  }

  for (const serial of ambiguousSerials) {
    installedBySerial.delete(serial);
  }

  const known = new Set<string>();
  for (const s of input.knownInventorySerials) {
    const norm = normalizeR1Serial(s);
    if (norm) known.add(norm);
  }

  return {
    now: input.now,
    syncRunId: input.syncRunId,
    installedByDeviceId,
    installedBySerial,
    knownInventorySerials: known,
  };
}

export function evaluateAllInstalledDevices(input: {
  now: Date;
  syncRunId: string;
  devices: PdiInstalledDeviceObservationInput[];
  knownInventorySerials: Iterable<string>;
}): PdiIdentityDriftEvaluationRow[] {
  const ctx = buildEvaluationContext(input);
  return input.devices.map((d) => evaluateInstalledDeviceRow(d, ctx));
}
