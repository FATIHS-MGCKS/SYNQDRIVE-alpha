import type {
  VehicleOnboardingCase,
  VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import {
  parseValidatedAdminDraft,
  parseValidatedIdentityDraft,
  parseValidatedReadinessSnapshotV2,
  parseValidatedSourceSnapshot,
} from '../policy/persisted-contract.validation';
import { parseTechnicalBaselineDraft } from '../policy/technical-baseline-draft.validation';
import type { VehicleValidationFindingsV1 } from '../contracts/vehicle-validation-findings.v1';
import { VEHICLE_VALIDATION_FINDINGS_VERSION } from '../contracts/vo-document-versions';

export interface VehicleOnboardingSourceRefSummaryDto {
  provider: string;
  connectionScope: string | null;
  externalVehicleIdentity: string;
  provenanceAt: string | null;
  isPrimary: boolean;
}

export interface VehicleOnboardingReadinessSummaryDto {
  sealed: boolean;
  decision: string | null;
  profileId: string | null;
  profileVersion: string | null;
  readinessInputFingerprint: string | null;
}

export interface VehicleOnboardingCaseProjectionDto {
  id: string;
  organizationId: string;
  sourceMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  identityDraft: ReturnType<typeof parseValidatedIdentityDraft>;
  adminBaseline: ReturnType<typeof parseValidatedAdminDraft>;
  technicalBaseline: ReturnType<typeof parseTechnicalBaselineDraft>['draft'];
  technicalBaselineVersion: number;
  sourceRefs: VehicleOnboardingSourceRefSummaryDto[];
  readiness: VehicleOnboardingReadinessSummaryDto;
  validationFindings: VehicleValidationFindingsV1['findings'];
  vehicleId: string | null;
  concurrencyToken: string | null;
}

function safeSourceRefSummary(ref: VehicleOnboardingCaseSourceRef): VehicleOnboardingSourceRefSummaryDto {
  return {
    provider: ref.provider,
    connectionScope: ref.connectionScope,
    externalVehicleIdentity: ref.externalVehicleIdentity,
    provenanceAt: ref.provenanceAt ? ref.provenanceAt.toISOString() : null,
    isPrimary: ref.isPrimary,
  };
}

function parseValidationFindings(caseRow: VehicleOnboardingCase): VehicleValidationFindingsV1['findings'] {
  const json = caseRow.validationFindingsJson as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const findings = json as VehicleValidationFindingsV1;
  if (findings.version !== VEHICLE_VALIDATION_FINDINGS_VERSION) return [];
  return findings.findings ?? [];
}

export function projectVehicleOnboardingCase(
  caseRow: VehicleOnboardingCase,
  sourceRefs: VehicleOnboardingCaseSourceRef[],
): VehicleOnboardingCaseProjectionDto {
  const identityDraft = parseValidatedIdentityDraft(caseRow);
  const adminBaseline = parseValidatedAdminDraft(caseRow);
  const technicalParsed = parseTechnicalBaselineDraft(caseRow);

  let readiness: VehicleOnboardingReadinessSummaryDto = {
    sealed: false,
    decision: null,
    profileId: null,
    profileVersion: null,
    readinessInputFingerprint: null,
  };
  if (caseRow.readinessSnapshotJson && caseRow.readinessSnapshotVersion > 0) {
    try {
      const snap = parseValidatedReadinessSnapshotV2(caseRow);
      readiness = {
        sealed: true,
        decision: snap.decision,
        profileId: snap.profileId,
        profileVersion: snap.profileVersion,
        readinessInputFingerprint: snap.readinessInputFingerprint,
      };
    } catch {
      readiness = { sealed: false, decision: null, profileId: null, profileVersion: null, readinessInputFingerprint: null };
    }
  }

  return {
    id: caseRow.id,
    organizationId: caseRow.organizationId,
    sourceMode: caseRow.sourceMode,
    status: caseRow.status,
    createdAt: caseRow.createdAt.toISOString(),
    updatedAt: caseRow.updatedAt.toISOString(),
    completedAt: caseRow.completedAt ? caseRow.completedAt.toISOString() : null,
    identityDraft,
    adminBaseline,
    technicalBaseline: technicalParsed.draft,
    technicalBaselineVersion: technicalParsed.version,
    sourceRefs: sourceRefs.map(safeSourceRefSummary),
    readiness,
    validationFindings: parseValidationFindings(caseRow),
    vehicleId: caseRow.vehicleId,
    concurrencyToken: caseRow.concurrencyToken,
  };
}

/** Ensures projection never embeds raw provider snapshot payloads. */
export function assertProjectionOmitsRawSourceSnapshots(
  projection: VehicleOnboardingCaseProjectionDto,
): void {
  for (const ref of projection.sourceRefs) {
    const keys = Object.keys(ref as unknown as Record<string, unknown>);
    if (keys.some((k) => k === 'snapshotMetadataJson' || k === 'snapshotMetadata')) {
      throw new Error('Projection leaked raw source snapshot');
    }
  }
}
