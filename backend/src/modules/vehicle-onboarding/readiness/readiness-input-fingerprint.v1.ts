import { createHash } from 'node:crypto';
import type {
  VehicleOnboardingCase,
  VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import type { VehicleOnboardingReadinessProfileV1 } from './profiles/vehicle-onboarding-readiness-profile.v1';

export const READINESS_INPUT_FINGERPRINT_ALGORITHM = 'SHA-256-canonical-json-v1';

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

function normalizeSourceRefs(refs: VehicleOnboardingCaseSourceRef[]): unknown[] {
  return refs
    .map((r) => ({
      provider: r.provider,
      connectionScopeKey: r.connectionScopeKey,
      externalVehicleIdentity: r.externalVehicleIdentity,
      isPrimary: r.isPrimary,
      snapshotMetadataVersion: r.snapshotMetadataVersion,
      sourceMirrorId: r.sourceMirrorId,
    }))
    .sort((a, b) =>
      `${a.provider}:${a.externalVehicleIdentity}`.localeCompare(
        `${b.provider}:${b.externalVehicleIdentity}`,
      ),
    );
}

export interface ReadinessFingerprintInput {
  caseRow: VehicleOnboardingCase;
  sourceRefs: VehicleOnboardingCaseSourceRef[];
  profile: Pick<VehicleOnboardingReadinessProfileV1, 'profileId' | 'profileVersion'>;
  jurisdictionCode: string;
  productLabel: string;
}

export function computeReadinessInputFingerprint(input: ReadinessFingerprintInput): string {
  const payload = {
    organizationId: input.caseRow.organizationId,
    sourceMode: input.caseRow.sourceMode,
    draftIdentityVersion: input.caseRow.draftIdentityVersion,
    draftIdentityJson: input.caseRow.draftIdentityJson,
    draftAdminBaselineVersion: input.caseRow.draftAdminBaselineVersion,
    draftAdminBaselineJson: input.caseRow.draftAdminBaselineJson,
    draftTechnicalBaselineVersion: input.caseRow.draftTechnicalBaselineVersion,
    draftTechnicalBaselineJson: input.caseRow.draftTechnicalBaselineJson,
    validationFindingsVersion: input.caseRow.validationFindingsVersion,
    validationFindingsJson: input.caseRow.validationFindingsJson,
    sourceRefs: normalizeSourceRefs(input.sourceRefs),
    profileId: input.profile.profileId,
    profileVersion: input.profile.profileVersion,
    jurisdictionCode: input.jurisdictionCode,
    productLabel: input.productLabel,
  };
  return createHash('sha256').update(stableJson(payload), 'utf8').digest('hex');
}

export function computeSourceSetFingerprint(refs: VehicleOnboardingCaseSourceRef[]): string {
  const payload = normalizeSourceRefs(refs);
  return createHash('sha256').update(stableJson(payload), 'utf8').digest('hex');
}
