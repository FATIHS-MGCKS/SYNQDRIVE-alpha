-- USR_P0 production inventory (READ ONLY — aggregate counts only, no row-level PII)
-- Execute only on owner-authorized production read replica OR disposable migrated test DB.
-- Prisma @@map names verified @ a5664ac10.

BEGIN READ ONLY;

-- ─── Global account status ─────────────────────────────────────────────
SELECT status, COUNT(*) AS cnt
FROM users
GROUP BY status
ORDER BY status;

-- ─── Membership status ───────────────────────────────────────────────────
SELECT status, COUNT(*) AS cnt
FROM organization_memberships
GROUP BY status
ORDER BY status;

-- ─── Invite status ───────────────────────────────────────────────────────
SELECT status, COUNT(*) AS cnt
FROM organization_user_invites
GROUP BY status
ORDER BY status;

-- ─── Duplicate email identities ─────────────────────────────────────────
-- duplicate_email_identity_groups: distinct lower(trim(email)) appearing more than once
SELECT COUNT(*) AS duplicate_email_identity_groups
FROM (
  SELECT LOWER(TRIM(email)) AS norm
  FROM users
  WHERE email IS NOT NULL AND TRIM(email) <> ''
  GROUP BY LOWER(TRIM(email))
  HAVING COUNT(*) > 1
) dup_groups;

-- excess_duplicate_identity_rows: rows beyond the first per normalized email
SELECT COALESCE(SUM(cnt - 1), 0)::bigint AS excess_duplicate_identity_rows
FROM (
  SELECT COUNT(*) AS cnt
  FROM users
  WHERE email IS NOT NULL AND TRIM(email) <> ''
  GROUP BY LOWER(TRIM(email))
  HAVING COUNT(*) > 1
) dup;

-- ─── MFA posture (distinct users; not proof of enforcement at request time) ─
SELECT COUNT(DISTINCT user_id) AS users_with_enrolled_factor
FROM user_mfa_factors
WHERE encrypted_secret IS NOT NULL OR credential_id IS NOT NULL OR webauthn_public_key IS NOT NULL;

SELECT COUNT(DISTINCT user_id) AS users_with_verified_factor
FROM user_mfa_factors
WHERE verified_at IS NOT NULL;

SELECT COUNT(DISTINCT user_id) AS users_with_enabled_factor
FROM user_mfa_factors
WHERE enabled_at IS NOT NULL;

-- MASTER_ADMIN users with enabled MFA factor (enrollment signal)
SELECT COUNT(DISTINCT u.id) AS master_admins_with_enabled_mfa
FROM users u
INNER JOIN user_mfa_factors f ON f.user_id = u.id AND f.enabled_at IS NOT NULL
WHERE u.platform_role = 'MASTER_ADMIN';

-- ─── Refresh tokens (persistence — NOT proof of valid API access) ─────────
-- active_refresh_token_rows: unrevoked, unexpired tokens still stored
SELECT COUNT(*) AS active_refresh_token_rows
FROM refresh_tokens
WHERE revoked_at IS NULL AND expires_at > NOW();

-- active_refresh_tokens_for_suspended_users (stale-access risk indicator)
SELECT COUNT(*) AS active_refresh_tokens_for_suspended_users
FROM refresh_tokens rt
INNER JOIN users u ON u.id = rt.user_id
WHERE rt.revoked_at IS NULL
  AND rt.expires_at > NOW()
  AND u.status = 'SUSPENDED';

-- active_refresh_tokens_for_removed_membership (org-bound scope)
SELECT COUNT(*) AS active_refresh_tokens_removed_membership_scope
FROM refresh_tokens rt
INNER JOIN organization_memberships m ON m.id = rt.membership_id
WHERE rt.revoked_at IS NULL
  AND rt.expires_at > NOW()
  AND m.status = 'REMOVED';

-- ─── Platform permission grants (DB enum maps to 'master-billing') ────────
SELECT COUNT(*) AS active_master_billing_grants
FROM user_platform_permission_grants
WHERE permission_key = 'master-billing' AND revoked_at IS NULL;

-- Privileged MASTER_ADMIN without enabled MFA factor
SELECT COUNT(*) AS master_admins_without_enabled_mfa
FROM users u
WHERE u.platform_role = 'MASTER_ADMIN'
  AND u.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM user_mfa_factors f
    WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL
  );

-- ─── Orphan / integrity signals ──────────────────────────────────────────
-- Memberships pointing at missing org (FK should prevent; count should be 0)
SELECT COUNT(*) AS orphan_memberships_missing_org
FROM organization_memberships m
LEFT JOIN organizations o ON o.id = m.organization_id
WHERE o.id IS NULL;

-- Memberships with organization_role_id set but role missing or wrong org
SELECT COUNT(*) AS cross_tenant_role_reference_rows
FROM organization_memberships m
INNER JOIN organization_roles r ON r.id = m.organization_role_id
WHERE r.organization_id <> m.organization_id;

-- ACTIVE membership on SUSPENDED global user
SELECT COUNT(*) AS active_memberships_on_suspended_users
FROM organization_memberships m
INNER JOIN users u ON u.id = m.user_id
WHERE m.status = 'ACTIVE' AND u.status = 'SUSPENDED';

-- INVALID-ish status combinations (membership ACTIVE + user INACTIVE)
SELECT COUNT(*) AS active_memberships_on_inactive_users
FROM organization_memberships m
INNER JOIN users u ON u.id = m.user_id
WHERE m.status = 'ACTIVE' AND u.status = 'INACTIVE';

-- Expired pending invites still PENDING
SELECT COUNT(*) AS expired_pending_invites
FROM organization_user_invites
WHERE status = 'PENDING' AND expires_at < NOW();

ROLLBACK;