import type { ApdShadowActivationEpochLifecycle } from '@prisma/client';

export const APD_SHADOW_ACTIVATION_SCOPE_PREFIX = 'P25_APD_SHADOW_COHORT:';

export function buildApdShadowActivationScopeKey(
  cohortConfigFingerprintSha256: string,
): string {
  return `${APD_SHADOW_ACTIVATION_SCOPE_PREFIX}${cohortConfigFingerprintSha256}`;
}

export type ApdShadowActivationEpochGateReason =
  | 'EPOCH_MISSING'
  | 'EPOCH_NOT_ACTIVE'
  | 'EPOCH_FINGERPRINT_MISMATCH'
  | 'EPOCH_ORG_MISMATCH'
  | 'EPOCH_POLICY_VERSION_MISMATCH'
  | 'DECISION_BEFORE_T0'
  | 'EPOCH_LOOKUP_FAILED'
  | 'EPOCH_CLOSED';

/** Max interval a replica may admit shadow writes after PAUSE/CLOSE on another replica (write path bypasses positive cache). */
export const APD_SHADOW_EPOCH_WRITE_PATH_MAX_STALE_MS = 0;

export interface ApdShadowActiveEpochView {
  id: string;
  activationScopeKey: string;
  organizationId: string;
  cohortConfigFingerprintSha256: string;
  lifecycleState: ApdShadowActivationEpochLifecycle;
  activatedAt: Date;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  productionReleaseIdentity: string | null;
}

export interface PrepareApdShadowActivationEpochInput {
  organizationId: string;
  /** All organization IDs present in the cohort configuration (tenant validation). */
  cohortOrganizationIds: string[];
  cohortConfigFingerprintSha256: string;
  cohortConfigVersion: string;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  productionReleaseIdentity?: string | null;
  operatorActor?: string | null;
  operatorReason?: string | null;
  operatorRequestId?: string | null;
}

export interface ActivateApdShadowActivationEpochInput {
  epochId: string;
  activationRequestKey: string;
  cohortOrganizationIds: string[];
  cohortConfigFingerprintSha256: string;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  operatorActor: string;
  operatorReason: string;
  operatorRequestId?: string | null;
  productionReleaseIdentity?: string | null;
}

export const APD_SHADOW_EPOCH_CACHE_TTL_MS = 5_000;
