-- USR_P0 production inventory (READ-ONLY aggregates — no PII in reports)
-- Do not execute without explicit production authorization.

-- Global account status distribution
SELECT status, COUNT(*) AS cnt FROM "User" GROUP BY status ORDER BY status;

-- Membership status distribution
SELECT status, COUNT(*) AS cnt FROM "OrganizationMembership" GROUP BY status ORDER BY status;

-- Invite status distribution
SELECT status, COUNT(*) AS cnt FROM "OrganizationUserInvite" GROUP BY status ORDER BY status;

-- Duplicate normalized emails (count only)
SELECT COUNT(*) - COUNT(DISTINCT LOWER(TRIM(email))) AS duplicate_email_groups
FROM "User"
WHERE email IS NOT NULL;

-- Users with multiple ACTIVE memberships (count users)
SELECT COUNT(*) FROM (
  SELECT "userId" FROM "OrganizationMembership"
  WHERE status = 'ACTIVE'
  GROUP BY "userId" HAVING COUNT(*) > 1
) t;

-- MFA factor presence (users with at least one factor)
SELECT COUNT(DISTINCT "userId") AS users_with_mfa FROM "UserMfaFactor";

-- Active refresh tokens (session posture)
SELECT COUNT(*) AS active_refresh_tokens FROM "RefreshToken" WHERE "revokedAt" IS NULL AND "expiresAt" > NOW();

-- Platform permission grants (master billing delegate)
SELECT COUNT(*) AS master_billing_grants FROM "UserPlatformPermissionGrant"
WHERE permission = 'MASTER_BILLING_DELEGATE' AND "revokedAt" IS NULL;