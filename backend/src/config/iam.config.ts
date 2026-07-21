import { registerAs } from '@nestjs/config';

/** Env: set to `false` to disable org-bound refresh enforcement (migration only). */
export const IAM_ORG_BOUND_REFRESH_SESSIONS_ENV =
  'ENABLE_IAM_ORG_BOUND_REFRESH_SESSIONS';

/**
 * Env: allow one-time upgrade of LEGACY_UNSCOPED refresh tokens when org is
 * determinable (single active membership or lastAuthOrganizationId).
 */
export const IAM_LEGACY_UNSCOPED_REFRESH_GRACE_ENV =
  'ENABLE_IAM_LEGACY_UNSCOPED_REFRESH_GRACE';

export default registerAs('iam', () => ({
  enableOrgBoundRefreshSessions:
    process.env[IAM_ORG_BOUND_REFRESH_SESSIONS_ENV] !== 'false',
  enableLegacyUnscopedRefreshGrace:
    process.env[IAM_LEGACY_UNSCOPED_REFRESH_GRACE_ENV] === 'true',
}));
