/**
 * Central IAM session invalidation policy (Prompt 5/22).
 * Pure domain contract — resolved by IamSessionPolicyService at runtime.
 */

export const IAM_SESSION_INVALIDATION_TRIGGERS = [
  'PASSWORD_CHANGED',
  'PASSWORD_COMPROMISED',
  'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_REMOVED',
  'ROLE_DOWNGRADED',
  'ROLE_UPGRADED',
  'PERMISSION_REVOKED',
  'STATION_SCOPE_REDUCED',
  'MFA_RESET',
  'REFRESH_TOKEN_REUSE_DETECTED',
] as const;

export type IamSessionInvalidationTrigger =
  (typeof IAM_SESSION_INVALIDATION_TRIGGERS)[number];

export const SESSION_INVALIDATION_SCOPES = [
  'CURRENT_SESSION',
  'USER_ALL_SESSIONS',
  'ORGANIZATION_MEMBERSHIP_SESSIONS',
  'TOKEN_FAMILY',
  'PRIVILEGED_SESSIONS',
  'NO_IMMEDIATE_REVOCATION',
] as const;

export type SessionInvalidationScope =
  (typeof SESSION_INVALIDATION_SCOPES)[number];

/** Legacy observed scopes used by Prompt 2 regression harness. */
export type LegacySessionInvalidationScope =
  | 'ALL_USER_SESSIONS'
  | 'ORG_BOUND_SESSIONS'
  | 'NONE';

/**
 * Deterministic policy: one primary scope per trigger.
 * REFRESH_TOKEN_REUSE_DETECTED may chain TOKEN_FAMILY then USER_ALL_SESSIONS when high risk.
 */
export const IAM_SESSION_INVALIDATION_POLICY: Record<
  IamSessionInvalidationTrigger,
  SessionInvalidationScope
> = {
  PASSWORD_CHANGED: 'USER_ALL_SESSIONS',
  PASSWORD_COMPROMISED: 'USER_ALL_SESSIONS',
  MEMBERSHIP_SUSPENDED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  MEMBERSHIP_REMOVED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  ROLE_DOWNGRADED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  ROLE_UPGRADED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  PERMISSION_REVOKED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  STATION_SCOPE_REDUCED: 'ORGANIZATION_MEMBERSHIP_SESSIONS',
  MFA_RESET: 'PRIVILEGED_SESSIONS',
  REFRESH_TOKEN_REUSE_DETECTED: 'TOKEN_FAMILY',
};

/** @deprecated Use IAM_SESSION_INVALIDATION_POLICY */
export const TARGET_SESSION_INVALIDATION_POLICY: Record<
  IamSessionInvalidationTrigger,
  LegacySessionInvalidationScope
> = {
  PASSWORD_CHANGED: 'ALL_USER_SESSIONS',
  PASSWORD_COMPROMISED: 'ALL_USER_SESSIONS',
  MEMBERSHIP_SUSPENDED: 'ORG_BOUND_SESSIONS',
  MEMBERSHIP_REMOVED: 'ORG_BOUND_SESSIONS',
  ROLE_DOWNGRADED: 'ORG_BOUND_SESSIONS',
  ROLE_UPGRADED: 'ORG_BOUND_SESSIONS',
  PERMISSION_REVOKED: 'ORG_BOUND_SESSIONS',
  STATION_SCOPE_REDUCED: 'ORG_BOUND_SESSIONS',
  MFA_RESET: 'ALL_USER_SESSIONS',
  REFRESH_TOKEN_REUSE_DETECTED: 'ALL_USER_SESSIONS',
};

export function resolveSessionInvalidationScope(
  trigger: IamSessionInvalidationTrigger,
  options?: { highRiskReuse?: boolean },
): SessionInvalidationScope[] {
  const primary = IAM_SESSION_INVALIDATION_POLICY[trigger];
  if (
    trigger === 'REFRESH_TOKEN_REUSE_DETECTED' &&
    options?.highRiskReuse
  ) {
    return ['TOKEN_FAMILY', 'USER_ALL_SESSIONS'];
  }
  return [primary];
}

export function mapScopeToLegacyObserved(
  scope: SessionInvalidationScope,
): LegacySessionInvalidationScope {
  switch (scope) {
    case 'USER_ALL_SESSIONS':
    case 'TOKEN_FAMILY':
    case 'PRIVILEGED_SESSIONS':
    case 'CURRENT_SESSION':
      return 'ALL_USER_SESSIONS';
    case 'ORGANIZATION_MEMBERSHIP_SESSIONS':
      return 'ORG_BOUND_SESSIONS';
    case 'NO_IMMEDIATE_REVOCATION':
      return 'NONE';
    default:
      return 'ALL_USER_SESSIONS';
  }
}

export function sessionInvalidationSatisfiesTarget(
  trigger: IamSessionInvalidationTrigger,
  observed: LegacySessionInvalidationScope,
): boolean {
  const target = TARGET_SESSION_INVALIDATION_POLICY[trigger];
  if (target === 'NONE') return observed === 'NONE';
  if (target === 'ALL_USER_SESSIONS') {
    return (
      observed === 'ALL_USER_SESSIONS' || observed === 'ORG_BOUND_SESSIONS'
    );
  }
  return observed === 'ORG_BOUND_SESSIONS' || observed === 'ALL_USER_SESSIONS';
}

export function describeSessionInvalidationGap(
  trigger: IamSessionInvalidationTrigger,
  observed: LegacySessionInvalidationScope,
): string {
  const target = TARGET_SESSION_INVALIDATION_POLICY[trigger];
  return `trigger=${trigger} observed=${observed} target=${target}`;
}

/** Access tokens may remain valid until JWT exp — document residual window. */
export const ACCESS_TOKEN_RESIDUAL_LIFETIME_NOTE =
  'Refresh-token revocation is immediate; access tokens remain valid until JWT exp (see app.jwtExpiresIn). ' +
  'Use sessionVersion / membershipVersion claims for server-side invalidation before expiry.';

export type MembershipRoleRank = 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER' | 'DRIVER';

const ROLE_RANK: Record<MembershipRoleRank, number> = {
  ORG_ADMIN: 4,
  SUB_ADMIN: 3,
  WORKER: 2,
  DRIVER: 1,
};

export function isRoleDowngrade(
  before: MembershipRoleRank,
  after: MembershipRoleRank,
): boolean {
  return ROLE_RANK[after] < ROLE_RANK[before];
}

export function isRoleUpgrade(
  before: MembershipRoleRank,
  after: MembershipRoleRank,
): boolean {
  return ROLE_RANK[after] > ROLE_RANK[before];
}

export function permissionsWereReduced(
  before: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
  after: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
): boolean {
  const beforeMap = before ?? {};
  const afterMap = after ?? {};
  const modules = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
  for (const mod of modules) {
    const b = beforeMap[mod] ?? {};
    const a = afterMap[mod] ?? {};
    if (!!b.manage && !a.manage) return true;
    if (!!b.write && !a.write) return true;
    if (!!b.read && !a.read) return true;
  }
  return false;
}

export function stationScopeWasReduced(
  beforeIds: string[] | null | undefined,
  afterIds: string[] | null | undefined,
): boolean {
  const before = new Set(beforeIds ?? []);
  const after = new Set(afterIds ?? []);
  if (after.size >= before.size) {
    for (const id of before) {
      if (!after.has(id)) return true;
    }
    return false;
  }
  return true;
}

export function buildRevocationIdempotencyKey(input: {
  eventType: string;
  userId: string;
  organizationId?: string | null;
  membershipId?: string | null;
  refreshTokenId?: string | null;
  tokenFamily?: string | null;
  mutationVersion?: number;
}): string {
  return [
    input.eventType,
    input.userId,
    input.organizationId ?? '',
    input.membershipId ?? '',
    input.refreshTokenId ?? '',
    input.tokenFamily ?? '',
    input.mutationVersion ?? 0,
  ].join(':');
}
