import type { VehicleOnboardingCase, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import {
  ONBOARDING_SOURCE_SNAPSHOT_VERSION,
  READINESS_SNAPSHOT_VERSION,
  VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
  VEHICLE_IDENTITY_DRAFT_VERSION,
} from '../contracts/vo-document-versions';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import type { VehicleOnboardingReadinessSnapshotV1 } from '../contracts/readiness-snapshot.v1';
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
