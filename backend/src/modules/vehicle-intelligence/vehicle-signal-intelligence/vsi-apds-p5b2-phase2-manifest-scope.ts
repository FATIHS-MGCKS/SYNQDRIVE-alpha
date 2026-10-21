import type { VsiApdsP5b1PersistedShadowDecisionManifestRow } from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b2Phase2ManifestError } from './vsi-apds-p5b2-phase2-manifest.errors';
import type { ValidatedVsiApdsP5b2Phase2ManifestV1 } from './vsi-apds-p5b2-phase2-manifest';

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
