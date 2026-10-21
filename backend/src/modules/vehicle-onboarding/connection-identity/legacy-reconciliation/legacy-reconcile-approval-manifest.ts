import { createHash } from 'node:crypto';
import type { SourceEvidenceFingerprintV1 } from './connection-identity-metadata-v2';
import type { LegacyReconcilePlanRow } from './legacy-connection-identity-reconcile.types';
import { LEGACY_RECONCILE_ELIGIBILITY } from './legacy-connection-identity-reconcile.types';
import { canonicalizeJsonValue } from './stable-metadata-fingerprint';

export type LegacyReconcileApprovalManifestEntry = {
  sourceLinkId: string;
  organizationId: string;
  vehicleId: string;
  currentMetadataFingerprint: string;
  sourceEvidenceFingerprint: SourceEvidenceFingerprintV1;
  verifiedModality: string;
  physicalDeviceReference: string;
  telemetrySourceFamily: string;
  deviceBindingAssurance: string | null;
  providerDeviceIdHash: string | null;
  dimoTokenId: number | null;
  dimoExternalId: string;
  sourceMirrorId: string;
};

export function buildApprovalManifestEntry(
  row: LegacyReconcilePlanRow,
): LegacyReconcileApprovalManifestEntry | null {
  if (row.eligibility !== LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE || !row.proposedMetadataV2) {
    return null;
  }
  const ci = row.proposedMetadataV2;
  return {
    sourceLinkId: row.sourceLinkId,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    currentMetadataFingerprint: row.currentMetadataFingerprint,
    sourceEvidenceFingerprint: ci.sourceEvidenceFingerprint,
    verifiedModality: ci.verifiedModality,
    physicalDeviceReference: ci.physicalDeviceReference,
    telemetrySourceFamily: row.evidenceClassification ?? 'UNKNOWN',
    deviceBindingAssurance: ci.deviceBindingAssurance ?? null,
    providerDeviceIdHash: ci.providerDeviceIdHash ?? null,
    dimoTokenId: row.dimoTokenId,
    dimoExternalId: row.dimoExternalId ?? ci.sourceEvidenceFingerprint.externalId,
    sourceMirrorId: row.sourceMirrorId ?? ci.sourceEvidenceFingerprint.dimoMirrorId,
  };
}

export function fingerprintApprovalManifestEntry(entry: LegacyReconcileApprovalManifestEntry): string {
  const canonical = canonicalizeJsonValue(entry);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Deterministic owner approval manifest — excludes execution timestamps and DRY_RUN provenance. */
export function computeDeterministicApprovalManifestFingerprint(rows: LegacyReconcilePlanRow[]): string {
  const entries = rows
    .map(buildApprovalManifestEntry)
    .filter((e): e is LegacyReconcileApprovalManifestEntry => e !== null)
    .sort((a, b) => a.sourceLinkId.localeCompare(b.sourceLinkId));
  const canonical = canonicalizeJsonValue(entries);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function entriesMatchApprovedManifest(
  approved: LegacyReconcileApprovalManifestEntry,
  fresh: LegacyReconcileApprovalManifestEntry,
): boolean {
  return fingerprintApprovalManifestEntry(approved) === fingerprintApprovalManifestEntry(fresh);
}
