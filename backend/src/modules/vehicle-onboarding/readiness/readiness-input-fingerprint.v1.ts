import { createHash } from 'node:crypto';
import type { ProductSlug, OrgProductStatus } from '@prisma/client';
import type {
  VehicleOnboardingCase,
  VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import type { VehicleOnboardingReadinessProfileV1 } from './profiles/vehicle-onboarding-readiness-profile.v1';
import { normalizeSourceRefsForReadinessFingerprint } from './onboarding-source-snapshot.fingerprint';

export const READINESS_INPUT_FINGERPRINT_ALGORITHM = 'SHA-256-canonical-json-v1.1';

/** Deterministic JSON for hashing (sorted object keys at each object level). */
export function stableCanonicalJson(value: unknown): string {
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

export interface ReadinessFingerprintInput {
  caseRow: VehicleOnboardingCase;
  sourceRefs: VehicleOnboardingCaseSourceRef[];
  profile: Pick<VehicleOnboardingReadinessProfileV1, 'profileId' | 'profileVersion'>;
  jurisdictionCode: string;
  selectedProductSlug: ProductSlug;
  productEntitlementStatus: OrgProductStatus;
  organizationBusinessType: string;
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
    sourceRefs: normalizeSourceRefsForReadinessFingerprint(input.sourceRefs),
    profileId: input.profile.profileId,
    profileVersion: input.profile.profileVersion,
    jurisdictionCode: input.jurisdictionCode,
    selectedProductSlug: input.selectedProductSlug,
    productEntitlementStatus: input.productEntitlementStatus,
    organizationBusinessType: input.organizationBusinessType,
  };
  return createHash('sha256').update(stableCanonicalJson(payload), 'utf8').digest('hex');
}

export function computeSourceSetFingerprint(refs: VehicleOnboardingCaseSourceRef[]): string {
  const payload = normalizeSourceRefsForReadinessFingerprint(refs);
  return createHash('sha256').update(stableCanonicalJson(payload), 'utf8').digest('hex');
}
