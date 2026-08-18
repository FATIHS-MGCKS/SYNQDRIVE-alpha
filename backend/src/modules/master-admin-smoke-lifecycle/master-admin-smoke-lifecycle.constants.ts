export const MASTER_ADMIN_SMOKE_PURPOSE = 'master-admin-smoke' as const;

export const MASTER_ADMIN_SMOKE_CREATED_BY = 'ops-smoke-lifecycle' as const;

export const MASTER_ADMIN_SMOKE_USER_NAME = 'Master Admin Smoke Test' as const;

/** Fixed internal acceptance identity — at most one active instance. */
export const MASTER_ADMIN_SMOKE_EMAIL =
  'master-admin-smoke@acceptance.internal.synqdrive.eu' as const;

export const MASTER_ADMIN_SMOKE_AUDIT_REASON =
  'Authenticated production read-only master-admin acceptance smoke' as const;

export const MASTER_ADMIN_SMOKE_DEFAULT_TTL_HOURS = 4;

export const MASTER_ADMIN_SMOKE_STATE_VERSION = 1;
