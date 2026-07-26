import { UserPlatformRole } from '@prisma/client';
import {
  IAM_MFA_FEATURE_FLAG_ENV_KEYS,
  IamMfaEffectiveFeatureFlags,
  IamMfaGlobalFeatureFlags,
  IamMfaPrincipalFeatureFlags,
} from './iam-mfa-feature-flags.contract';

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function resolveIamMfaMasterAdminEnabled(): boolean {
  return parseBool(
    process.env[IAM_MFA_FEATURE_FLAG_ENV_KEYS.masterAdminEnabled],
    false,
  );
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

/**
 * Resolve MFA flags for the authenticated principal.
 * Master admins use platform-level enforcement (ignores org allowlist).
 */
export function resolveIamMfaFeatureFlagsForPrincipal(input: {
  organizationId: string | null;
  platformRole?: string | null;
}): IamMfaPrincipalFeatureFlags {
  if (input.platformRole === UserPlatformRole.MASTER_ADMIN && resolveIamMfaMasterAdminEnabled()) {
    return {
      organizationId: input.organizationId,
      rolloutAllowlistActive: false,
      masterAdminMfaEnabled: true,
      mfaEnrollmentEnabled: true,
      mfaStepUpEnforced: true,
      mfaPrivilegedEnrollmentRequired: true,
    };
  }

  return {
    ...resolveIamMfaEffectiveFeatureFlags(input.organizationId),
    masterAdminMfaEnabled: false,
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
