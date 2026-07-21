import {
  IAM_MFA_FEATURE_FLAG_ENV_KEYS,
  IamMfaEffectiveFeatureFlags,
  IamMfaGlobalFeatureFlags,
} from './iam-mfa-feature-flags.contract';

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function resolveIamMfaGlobalFeatureFlags(): IamMfaGlobalFeatureFlags {
  return {
    mfaEnrollmentEnabled: parseBool(
      process.env[IAM_MFA_FEATURE_FLAG_ENV_KEYS.mfaEnrollmentEnabled],
      false,
    ),
    mfaStepUpEnforced: parseBool(
      process.env[IAM_MFA_FEATURE_FLAG_ENV_KEYS.mfaStepUpEnforced],
      false,
    ),
    mfaPrivilegedEnrollmentRequired: parseBool(
      process.env[IAM_MFA_FEATURE_FLAG_ENV_KEYS.mfaPrivilegedEnrollmentRequired],
      false,
    ),
  };
}

export function resolveIamMfaEffectiveFeatureFlags(
  organizationId: string | null,
): IamMfaEffectiveFeatureFlags {
  const global = resolveIamMfaGlobalFeatureFlags();
  const allowlistRaw = process.env[IAM_MFA_FEATURE_FLAG_ENV_KEYS.orgAllowlist]?.trim();
  const allowlist = allowlistRaw
    ? allowlistRaw.split(',').map((v) => v.trim()).filter(Boolean)
    : [];
  const rolloutAllowlistActive = allowlist.length > 0;
  const orgAllowed =
    !rolloutAllowlistActive ||
    (organizationId != null && allowlist.includes(organizationId));

  return {
    ...global,
    organizationId,
    rolloutAllowlistActive,
    mfaEnrollmentEnabled: global.mfaEnrollmentEnabled && orgAllowed,
    mfaStepUpEnforced: global.mfaStepUpEnforced && orgAllowed,
    mfaPrivilegedEnrollmentRequired:
      global.mfaPrivilegedEnrollmentRequired && orgAllowed,
  };
}
