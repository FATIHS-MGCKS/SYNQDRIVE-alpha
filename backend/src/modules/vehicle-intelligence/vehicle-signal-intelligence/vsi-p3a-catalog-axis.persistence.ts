import { createHash } from 'node:crypto';
import type { VsiP3aCatalogAxisClassification } from './vsi-p3a-catalog-axis.classifier';
import { VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION } from './vsi-p3a-catalog-axis.contract';
import type { VsiProviderCatalogSnapshotCompleteness } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

export type VsiP3aCatalogAxisUpsertOutcome =
  | 'inserted'
  | 'updated_newer_checked_at'
  | 'skipped_older_checked_at'
  | 'skipped_equal_timestamp_replay'
  | 'skipped_equal_timestamp_conflict';

export function mapDeclaredStatusForPersistence(
  status: VsiProviderCatalogStatus,
): 'LISTED' | 'NOT_LISTED' | 'UNKNOWN' {
  switch (status) {
    case VsiProviderCatalogStatus.LISTED:
      return 'LISTED';
    case VsiProviderCatalogStatus.NOT_LISTED:
      return 'NOT_LISTED';
    default:
      return 'UNKNOWN';
  }
}

export function buildVsiP3aCatalogAxisContentFingerprint(input: {
  declaredCatalogStatus: 'LISTED' | 'NOT_LISTED' | 'UNKNOWN';
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
  canonicalSignalKey: string | null;
  catalogSnapshotBatchFingerprint: string;
  axisMetadata: Record<string, unknown>;
}): string {
  const payload = {
    declaredCatalogStatus: input.declaredCatalogStatus,
    catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
    canonicalSignalKey: input.canonicalSignalKey,
    contractVersion: VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
    catalogSnapshotBatchFingerprint: input.catalogSnapshotBatchFingerprint,
    axisMetadata: input.axisMetadata,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildVsiP3aCatalogAxisDigestForBatch(input: {
  declaredCatalogStatus: 'LISTED' | 'NOT_LISTED' | 'UNKNOWN';
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
  canonicalSignalKey: string | null;
  providerNativeSignalName: string;
  axisMetadata: Record<string, unknown>;
}): string {
  const payload = {
    providerNativeSignalName: input.providerNativeSignalName,
    declaredCatalogStatus: input.declaredCatalogStatus,
    catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
    canonicalSignalKey: input.canonicalSignalKey,
    contractVersion: VSI_P3A_CATALOG_AXIS_CONTRACT_VERSION,
    axisMetadata: input.axisMetadata,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildVsiP3aCatalogSnapshotBatchFingerprint(input: {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  checkedAtIso: string;
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
  classifications: readonly VsiP3aCatalogAxisClassification[];
  sharedMetadata: Record<string, unknown>;
}): string {
  const axisDigests = input.classifications
    .map((row) => {
      const declared = mapDeclaredStatusForPersistence(row.declaredCatalogStatus);
      return buildVsiP3aCatalogAxisDigestForBatch({
        providerNativeSignalName: row.providerNativeSignalName,
        declaredCatalogStatus: declared,
        catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
        canonicalSignalKey: row.canonicalSignalKey,
        axisMetadata: { ...input.sharedMetadata, ...row.metadata },
      });
    })
    .sort();

  const payload = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    checkedAt: input.checkedAtIso,
    catalogSnapshotCompleteness: input.catalogSnapshotCompleteness,
    axisDigests,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function sortCatalogAxesForPersistence<T extends { providerNativeSignalName: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) =>
    a.providerNativeSignalName.localeCompare(b.providerNativeSignalName),
  );
}
