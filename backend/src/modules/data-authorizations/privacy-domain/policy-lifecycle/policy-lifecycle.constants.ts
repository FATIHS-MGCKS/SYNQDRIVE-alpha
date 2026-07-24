import { PrivacyPolicyLifecycleStatus } from '@prisma/client';

export const POLICY_LIFECYCLE_STATUS = PrivacyPolicyLifecycleStatus;

export const POLICY_SINGLE_ACTIVE_INDEX = {
  PROCESSING_ACTIVITY: 'processing_activities_single_active_per_family_key',
  LEGAL_BASIS_ASSESSMENT: 'legal_basis_assessments_single_active_per_family_key',
  ENFORCEMENT_POLICY: 'enforcement_policies_single_active_per_family_key',
} as const;

/** Statuses from which activation (→ ACTIVE) is permitted. DRAFT is explicitly excluded. */
export const POLICY_ACTIVATABLE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.APPROVED,
  PrivacyPolicyLifecycleStatus.SCHEDULED,
]);

/** Statuses where content is immutable — material changes require a new version. */
export const POLICY_IMMUTABLE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.ACTIVE,
  PrivacyPolicyLifecycleStatus.SUSPENDED,
  PrivacyPolicyLifecycleStatus.SUPERSEDED,
  PrivacyPolicyLifecycleStatus.REVOKED,
  PrivacyPolicyLifecycleStatus.EXPIRED,
  PrivacyPolicyLifecycleStatus.REJECTED,
]);

/** Statuses where content may be edited in-place. */
export const POLICY_EDITABLE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.DRAFT,
]);

/** Terminal statuses — no further user-driven transitions. */
export const POLICY_TERMINAL_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.SUPERSEDED,
  PrivacyPolicyLifecycleStatus.REVOKED,
  PrivacyPolicyLifecycleStatus.EXPIRED,
  PrivacyPolicyLifecycleStatus.REJECTED,
]);

export const POLICY_LIFECYCLE_ERROR_CODES = {
  INVALID_STATUS_TRANSITION: 'POLICY_INVALID_STATUS_TRANSITION',
  NOT_ACTIVATABLE: 'POLICY_NOT_ACTIVATABLE',
  ACTIVE_CONFLICT: 'POLICY_ACTIVE_CONFLICT',
  IMMUTABLE: 'POLICY_IMMUTABLE',
  NOT_EDITABLE: 'POLICY_NOT_EDITABLE',
  REVOCATION_REASON_REQUIRED: 'POLICY_REVOCATION_REASON_REQUIRED',
  REJECTION_REASON_REQUIRED: 'POLICY_REJECTION_REASON_REQUIRED',
  SUSPENSION_REASON_REQUIRED: 'POLICY_SUSPENSION_REASON_REQUIRED',
  SUPERSEDED_BY_REQUIRED: 'POLICY_SUPERSEDED_BY_REQUIRED',
  REVOKED_NOT_REACTIVATABLE: 'POLICY_REVOKED_NOT_REACTIVATABLE',
  EXPIRED_NOT_USABLE: 'POLICY_EXPIRED_NOT_USABLE',
  NOT_FOUND: 'POLICY_NOT_FOUND',
  RESUME_PERMISSION_REQUIRED: 'POLICY_RESUME_PERMISSION_REQUIRED',
  ACTIVATION_PREREQUISITE_INVALID: 'POLICY_ACTIVATION_PREREQUISITE_INVALID',
  ROLLBACK_SOURCE_FORBIDDEN: 'POLICY_ROLLBACK_SOURCE_FORBIDDEN',
  NEW_VERSION_SOURCE_INVALID: 'POLICY_NEW_VERSION_SOURCE_INVALID',
  EXTENSION_REQUIRES_ACTIVE: 'POLICY_EXTENSION_REQUIRES_ACTIVE',
  REJECTED_CANNOT_REVOKE: 'POLICY_REJECTED_CANNOT_REVOKE',
  EXPIRY_REASON_REQUIRED: 'POLICY_EXPIRY_REASON_REQUIRED',
} as const;

/** Statuses eligible for automatic expiry when validUntil is reached. */
export const POLICY_EXPIRABLE_STATUSES: ReadonlySet<PrivacyPolicyLifecycleStatus> = new Set([
  PrivacyPolicyLifecycleStatus.ACTIVE,
  PrivacyPolicyLifecycleStatus.SUSPENDED,
]);
