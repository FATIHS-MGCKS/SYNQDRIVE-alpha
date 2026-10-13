import type { VoSourceLinkConnectionIdentityMetadataV2 } from './connection-identity-metadata-v2';

export const LEGACY_RECONCILE_ELIGIBILITY = {
  ELIGIBLE: 'ELIGIBLE',
  ALREADY_RECONCILED: 'ALREADY_RECONCILED',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  TENANT_CONFLICT: 'TENANT_CONFLICT',
  LIFECYCLE_EXCLUDED: 'LIFECYCLE_EXCLUDED',
  CONSENT_INVALID: 'CONSENT_INVALID',
  CONCURRENT_CHANGE_RISK: 'CONCURRENT_CHANGE_RISK',
  PROVIDER_MISMATCH: 'PROVIDER_MISMATCH',
  LINK_INACTIVE: 'LINK_INACTIVE',
  NOT_ON_ALLOWLIST: 'NOT_ON_ALLOWLIST',
} as const;

export type LegacyReconcileEligibility =
  (typeof LEGACY_RECONCILE_ELIGIBILITY)[keyof typeof LEGACY_RECONCILE_ELIGIBILITY];

export type LegacyReconcilePlanRow = {
  sourceLinkId: string;
  vehicleId: string;
  organizationId: string;
  dimoTokenId: number | null;
  dimoExternalId: string | null;
  provider: string;
  sourceMirrorId: string | null;
  currentMetadataFingerprint: string;
  currentConnectionIdentity: 'absent' | 'v1' | 'v2';
  eligibility: LegacyReconcileEligibility;
  reasonCodes: string[];
  proposedMetadataV2: VoSourceLinkConnectionIdentityMetadataV2 | null;
  proposedMetadataFingerprint: string | null;
  evidenceClassification: string | null;
};

export type LegacyReconcileExecutionMode = 'DRY_RUN' | 'EXECUTE';

export type LegacyReconcileAuthorization = {
  ownerAuthorized: boolean;
  allowlistedLinkIds: ReadonlySet<string>;
  manifestFingerprint: string | null;
  authorizationReference: string;
  operatorReference?: string | null;
  runId: string;
  productionReleaseSha?: string | null;
  mode: LegacyReconcileExecutionMode;
};
