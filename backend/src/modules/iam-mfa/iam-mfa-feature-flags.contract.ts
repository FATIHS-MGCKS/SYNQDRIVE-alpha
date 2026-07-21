export const IAM_MFA_FEATURE_FLAGS_VERSION = 1 as const;

export interface IamMfaGlobalFeatureFlags {
  mfaEnrollmentEnabled: boolean;
  mfaStepUpEnforced: boolean;
  mfaPrivilegedEnrollmentRequired: boolean;
}

export type IamMfaEffectiveFeatureFlags = IamMfaGlobalFeatureFlags & {
  organizationId: string | null;
  rolloutAllowlistActive: boolean;
};

export const IAM_MFA_FEATURE_FLAG_ENV_KEYS = {
  mfaEnrollmentEnabled: 'IAM_MFA_ENROLLMENT_ENABLED',
  mfaStepUpEnforced: 'IAM_MFA_STEP_UP_ENFORCED',
  mfaPrivilegedEnrollmentRequired: 'IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED',
  orgAllowlist: 'IAM_MFA_ORG_ALLOWLIST',
} as const;
