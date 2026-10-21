import type { VehicleOnboardingCase, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import {
  ONBOARDING_SOURCE_SNAPSHOT_VERSION,
  VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
  VEHICLE_IDENTITY_DRAFT_VERSION,
} from '../contracts/vo-document-versions';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import type { VehicleOnboardingReadinessSnapshotV1 } from '../contracts/readiness-snapshot.v1';
import type { VehicleOnboardingReadinessSnapshotV2 } from '../contracts/readiness-snapshot.v2';
import {
  READINESS_SNAPSHOT_VERSION,
  READINESS_SNAPSHOT_VERSION_V2,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION,
  VEHICLE_VALIDATION_FINDINGS_VERSION,
} from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV1 } from '../contracts/vehicle-technical-baseline-draft.v1';
import type { VehicleValidationFindingsV1 } from '../contracts/vehicle-validation-findings.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

function unsupported(field: string): void {
  throw new VehicleOnboardingError(
    'UNSUPPORTED_CONTRACT_VERSION',
    `Unsupported or mismatched contract version: ${field}`,
  );
}

export function parseValidatedIdentityDraft(caseRow: VehicleOnboardingCase): VehicleIdentityDraftV1 {
  if (caseRow.draftIdentityVersion !== VEHICLE_IDENTITY_DRAFT_VERSION) {
    unsupported('draftIdentityVersion');
  }
  const json = caseRow.draftIdentityJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('draftIdentityJson');
  }
  const draft = json as VehicleIdentityDraftV1;
  if (draft.version !== VEHICLE_IDENTITY_DRAFT_VERSION) {
    unsupported('draftIdentityJson.version');
  }
  return draft;
}

export function parseValidatedAdminDraft(
  caseRow: VehicleOnboardingCase,
): VehicleAdministrativeBaselineDraftV1 | null {
  if (!caseRow.draftAdminBaselineJson) return null;
  if (caseRow.draftAdminBaselineVersion !== VEHICLE_ADMIN_BASELINE_DRAFT_VERSION) {
    unsupported('draftAdminBaselineVersion');
  }
  const json = caseRow.draftAdminBaselineJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('draftAdminBaselineJson');
  }
  const draft = json as VehicleAdministrativeBaselineDraftV1;
  if (draft.version !== VEHICLE_ADMIN_BASELINE_DRAFT_VERSION) {
    unsupported('draftAdminBaselineJson.version');
  }
  return draft;
}

export function parseValidatedReadinessSnapshot(
  caseRow: VehicleOnboardingCase,
): VehicleOnboardingReadinessSnapshotV1 {
  if (caseRow.readinessSnapshotVersion !== READINESS_SNAPSHOT_VERSION) {
    unsupported('readinessSnapshotVersion');
  }
  const json = caseRow.readinessSnapshotJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('readinessSnapshotJson');
  }
  const snap = json as VehicleOnboardingReadinessSnapshotV1;
  if (snap.version !== READINESS_SNAPSHOT_VERSION) {
    unsupported('readinessSnapshotJson.version');
  }
  return snap;
}

export function parseValidatedReadinessSnapshotV2(
  caseRow: VehicleOnboardingCase,
): VehicleOnboardingReadinessSnapshotV2 {
  if (caseRow.readinessSnapshotVersion !== READINESS_SNAPSHOT_VERSION_V2) {
    unsupported('readinessSnapshotVersion');
  }
  const json = caseRow.readinessSnapshotJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('readinessSnapshotJson');
  }
  const snap = json as VehicleOnboardingReadinessSnapshotV2;
  if (snap.version !== READINESS_SNAPSHOT_VERSION_V2) {
    unsupported('readinessSnapshotJson.version');
  }
  if (snap.attestationSource !== 'VO4_READINESS_ENGINE') {
    unsupported('readinessSnapshotJson.attestationSource');
  }
  return snap;
}

export function parseValidatedTechnicalDraft(
  caseRow: VehicleOnboardingCase,
): VehicleTechnicalBaselineDraftV1 {
  if (caseRow.draftTechnicalBaselineVersion !== VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION) {
    unsupported('draftTechnicalBaselineVersion');
  }
  const json = caseRow.draftTechnicalBaselineJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('draftTechnicalBaselineJson');
  }
  const draft = json as VehicleTechnicalBaselineDraftV1;
  if (draft.version !== VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION) {
    unsupported('draftTechnicalBaselineJson.version');
  }
  return draft;
}

export function parseValidatedValidationFindings(
  caseRow: VehicleOnboardingCase,
): VehicleValidationFindingsV1 {
  if (!caseRow.validationFindingsJson) {
    return { version: VEHICLE_VALIDATION_FINDINGS_VERSION, findings: [] };
  }
  if (caseRow.validationFindingsVersion !== VEHICLE_VALIDATION_FINDINGS_VERSION) {
    unsupported('validationFindingsVersion');
  }
  const json = caseRow.validationFindingsJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported('validationFindingsJson');
  }
  const draft = json as VehicleValidationFindingsV1;
  if (draft.version !== VEHICLE_VALIDATION_FINDINGS_VERSION) {
    unsupported('validationFindingsJson.version');
  }
  return draft;
}

export function parseValidatedSourceSnapshot(
  ref: VehicleOnboardingCaseSourceRef,
): OnboardingSourceSnapshotV1 {
  if (ref.snapshotMetadataVersion !== ONBOARDING_SOURCE_SNAPSHOT_VERSION) {
    unsupported(`sourceRef.${ref.id}.snapshotMetadataVersion`);
  }
  const json = ref.snapshotMetadataJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    unsupported(`sourceRef.${ref.id}.snapshotMetadataJson`);
  }
  const snap = json as OnboardingSourceSnapshotV1;
  if (snap.version !== ONBOARDING_SOURCE_SNAPSHOT_VERSION) {
    unsupported(`sourceRef.${ref.id}.snapshot.version`);
  }
  return snap;
}
