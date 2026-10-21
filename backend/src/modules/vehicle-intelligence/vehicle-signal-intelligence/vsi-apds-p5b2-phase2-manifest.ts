import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VSI_P5B2_PHASE2_ACTIVATION_EPOCH_ID,
  VSI_P5B2_PHASE2_COHORT_VEHICLE_IDS,
  VSI_P5B2_PHASE2_DECISION_AT_FROM_ISO,
  VSI_P5B2_PHASE2_DECISION_AT_TO_ISO,
  VSI_P5B2_PHASE2_MANIFEST_SHA256,
  VSI_P5B2_PHASE2_MAX_DECISIONS,
  VSI_P5B2_PHASE2_ORGANIZATION_ID,
} from './vsi-apds-p5b2-phase2-manifest.contract';
import { VsiApdsP5b2Phase2ManifestError } from './vsi-apds-p5b2-phase2-manifest.errors';

export type VsiApdsP5b2Phase2ManifestEntryV1 = {
  id: string;
  vehicleId: string;
  decisionAt: string;
  policyVersion: string;
  decision: string;
  reason: string;
  stratum: string;
  motionState?: string;
  telemetryBucket?: string;
};

export type VsiApdsP5b2Phase2ManifestDocumentV1 = {
  org: string;
  vehicles: string[];
  proposedWindow: { from: string; to: string };
  uniqueDecisionIds: string[];
  entries: VsiApdsP5b2Phase2ManifestEntryV1[];
};

export type ValidatedVsiApdsP5b2Phase2ManifestV1 = {
  sha256: string;
  organizationId: string;
  activationEpochId: string;
  allowedVehicleIds: readonly string[];
  decisionAtFrom: Date;
  decisionAtTo: Date;
  orderedDecisionIds: readonly string[];
  entriesById: ReadonlyMap<string, VsiApdsP5b2Phase2ManifestEntryV1>;
};

const cohortSet = new Set(VSI_P5B2_PHASE2_COHORT_VEHICLE_IDS);

function parseManifestJson(raw: string): VsiApdsP5b2Phase2ManifestDocumentV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_JSON_INVALID', 'Manifest is not valid JSON');
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_SHAPE_INVALID', 'Manifest root must be an object');
  }
  const doc = parsed as VsiApdsP5b2Phase2ManifestDocumentV1;
  if (!Array.isArray(doc.uniqueDecisionIds) || !Array.isArray(doc.entries)) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_SHAPE_INVALID',
      'Manifest must include uniqueDecisionIds and entries arrays',
    );
  }
  return doc;
}

export function validateVsiApdsP5b2Phase2ManifestDocument(
  doc: VsiApdsP5b2Phase2ManifestDocumentV1,
): ValidatedVsiApdsP5b2Phase2ManifestV1 {

  if (doc.org !== VSI_P5B2_PHASE2_ORGANIZATION_ID) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_ORG_MISMATCH',
      `Manifest org must be ${VSI_P5B2_PHASE2_ORGANIZATION_ID}`,
    );
  }

  if (!Array.isArray(doc.vehicles) || doc.vehicles.length !== VSI_P5B2_PHASE2_COHORT_VEHICLE_IDS.length) {
    throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_VEHICLES_INVALID', 'Manifest vehicles list invalid');
  }
  for (const vid of doc.vehicles) {
    if (!cohortSet.has(vid)) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_VEHICLE_NOT_IN_COHORT',
        `Vehicle ${vid} is not in the frozen cohort allowlist`,
      );
    }
  }

  if (doc.uniqueDecisionIds.length > VSI_P5B2_PHASE2_MAX_DECISIONS) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_TOO_MANY_DECISIONS',
      `Manifest exceeds max ${VSI_P5B2_PHASE2_MAX_DECISIONS} decisions`,
    );
  }

  const idSet = new Set<string>();
  for (const id of doc.uniqueDecisionIds) {
    if (!id?.trim()) {
      throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_ID_EMPTY', 'Manifest contains empty decision id');
    }
    if (idSet.has(id)) {
      throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_DUPLICATE_ID', `Duplicate decision id ${id}`);
    }
    idSet.add(id);
  }

  if (doc.entries.length !== doc.uniqueDecisionIds.length) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_ENTRIES_COUNT_MISMATCH',
      'entries length must match uniqueDecisionIds length',
    );
  }

  const entriesById = new Map<string, VsiApdsP5b2Phase2ManifestEntryV1>();
  const decisionAtFrom = new Date(VSI_P5B2_PHASE2_DECISION_AT_FROM_ISO);
  const decisionAtTo = new Date(VSI_P5B2_PHASE2_DECISION_AT_TO_ISO);
  if (
    doc.proposedWindow?.from !== VSI_P5B2_PHASE2_DECISION_AT_FROM_ISO ||
    doc.proposedWindow?.to !== VSI_P5B2_PHASE2_DECISION_AT_TO_ISO
  ) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_WINDOW_MISMATCH',
      'Manifest proposedWindow does not match frozen Phase 2 UTC window',
    );
  }

  for (let i = 0; i < doc.entries.length; i++) {
    const entry = doc.entries[i];
    const listedId = doc.uniqueDecisionIds[i];
    if (entry.id !== listedId) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_ENTRY_ORDER_MISMATCH',
        `Entry at index ${i} id does not match uniqueDecisionIds`,
      );
    }
    if (entriesById.has(entry.id)) {
      throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_DUPLICATE_ID', `Duplicate entry id ${entry.id}`);
    }
    if (!cohortSet.has(entry.vehicleId)) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_VEHICLE_NOT_IN_COHORT',
        `Entry ${entry.id} vehicle not in cohort`,
      );
    }
    const at = new Date(entry.decisionAt);
    if (!Number.isFinite(at.getTime())) {
      throw new VsiApdsP5b2Phase2ManifestError('MANIFEST_DECISION_AT_INVALID', `Invalid decisionAt for ${entry.id}`);
    }
    if (at < decisionAtFrom || at > decisionAtTo) {
      throw new VsiApdsP5b2Phase2ManifestError(
        'MANIFEST_DECISION_OUTSIDE_WINDOW',
        `Entry ${entry.id} decisionAt outside frozen window`,
      );
    }
    entriesById.set(entry.id, entry);
  }

  return {
    sha256: VSI_P5B2_PHASE2_MANIFEST_SHA256,
    organizationId: VSI_P5B2_PHASE2_ORGANIZATION_ID,
    activationEpochId: VSI_P5B2_PHASE2_ACTIVATION_EPOCH_ID,
    allowedVehicleIds: VSI_P5B2_PHASE2_COHORT_VEHICLE_IDS,
    decisionAtFrom,
    decisionAtTo,
    orderedDecisionIds: [...doc.uniqueDecisionIds],
    entriesById,
  };
}

export function loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(
  manifestPath: string,
): ValidatedVsiApdsP5b2Phase2ManifestV1 {
  const absolute = resolve(manifestPath);
  const bytes = readFileSync(absolute);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== VSI_P5B2_PHASE2_MANIFEST_SHA256) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_SHA256_MISMATCH',
      `Manifest SHA256 ${sha256} does not match frozen authority ${VSI_P5B2_PHASE2_MANIFEST_SHA256}`,
    );
  }
  const doc = parseManifestJson(bytes.toString('utf8'));
  return validateVsiApdsP5b2Phase2ManifestDocument(doc);
}

/** Reject operator attempts to substitute a different manifest digest (fail-closed). */
export function assertFrozenManifestSha256OverrideRejected(
  operatorSuppliedSha256: string | undefined,
): void {
  const trimmed = operatorSuppliedSha256?.trim();
  if (!trimmed) {
    return;
  }
  if (trimmed !== VSI_P5B2_PHASE2_MANIFEST_SHA256) {
    throw new VsiApdsP5b2Phase2ManifestError(
      'MANIFEST_SHA256_OVERRIDE_FORBIDDEN',
      'External manifest SHA256 overrides are forbidden; only the frozen Phase 2 digest is permitted',
    );
  }
}

export function loadDefaultPhase2ManifestFromBackendRoot(backendRoot: string): ValidatedVsiApdsP5b2Phase2ManifestV1 {
  const path = resolve(backendRoot, 'src/modules/vehicle-intelligence/vehicle-signal-intelligence/fixtures/p5b2-phase2-proposed-manifest.json');
  return loadAndValidateVsiApdsP5b2Phase2ManifestFromFile(path);
}
