import type { VsiApdsP5b1PersistedShadowDecisionManifestRow } from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b2Phase2ManifestError } from './vsi-apds-p5b2-phase2-manifest.errors';
import type { ValidatedVsiApdsP5b2Phase2ManifestV1 } from './vsi-apds-p5b2-phase2-manifest';

function normalizeDecisionAtIso(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString();
}

export function assertManifestDecisionRowsMatchScope(
  manifest: ValidatedVsiApdsP5b2Phase2ManifestV1,
  rows: readonly VsiApdsP5b1PersistedShadowDecisionManifestRow[],
): void {
  if (rows.length !== manifest.orderedDecisionIds.length) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_ROW_COUNT_MISMATCH',
      'Loaded decision count does not match manifest',
    );
  }

  const allowedVehicles = new Set(manifest.allowedVehicleIds);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expectedId = manifest.orderedDecisionIds[i];
    if (row.id !== expectedId) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_ORDER_MISMATCH',
        `Decision at index ${i} is ${row.id}, expected ${expectedId}`,
      );
    }
    if (row.organizationId !== manifest.organizationId) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_FOREIGN_ORGANIZATION',
        `Decision ${row.id} belongs to foreign organization`,
      );
    }
    if (!allowedVehicles.has(row.vehicleId)) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_FOREIGN_VEHICLE',
        `Decision ${row.id} vehicle not in cohort allowlist`,
      );
    }
    if (row.activationEpochId !== manifest.activationEpochId) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_EPOCH_MISMATCH',
        `Decision ${row.id} activation epoch mismatch`,
      );
    }
    const at = row.decisionAt.getTime();
    if (
      at < manifest.decisionAtFrom.getTime() ||
      at > manifest.decisionAtTo.getTime()
    ) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_DECISION_OUTSIDE_WINDOW',
        `Decision ${row.id} outside manifest UTC window`,
      );
    }
  }
}

/** Fail-closed: manifest entry metadata must match persisted APDS shadow rows. */
export function assertManifestPersistedMetadataParity(
  manifest: ValidatedVsiApdsP5b2Phase2ManifestV1,
  rows: readonly VsiApdsP5b1PersistedShadowDecisionManifestRow[],
): void {
  for (const row of rows) {
    const entry = manifest.entriesById.get(row.id);
    if (!entry) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_ENTRY_MISSING_FOR_ID',
        `No manifest entry for persisted decision ${row.id}`,
      );
    }
    if (entry.vehicleId !== row.vehicleId) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_METADATA_MISMATCH',
        `vehicleId mismatch for ${row.id}`,
      );
    }
    if (normalizeDecisionAtIso(entry.decisionAt) !== normalizeDecisionAtIso(row.decisionAt)) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_METADATA_MISMATCH',
        `decisionAt mismatch for ${row.id}`,
      );
    }
    if (entry.policyVersion !== row.policyVersion) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_METADATA_MISMATCH',
        `policyVersion mismatch for ${row.id}`,
      );
    }
    if (entry.decision !== row.decision) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_METADATA_MISMATCH',
        `decision mismatch for ${row.id}`,
      );
    }
    if (entry.reason !== row.reason) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_METADATA_MISMATCH',
        `reason mismatch for ${row.id}`,
      );
    }
  }
}
