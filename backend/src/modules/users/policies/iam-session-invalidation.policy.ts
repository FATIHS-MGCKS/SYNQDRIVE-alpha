/**
 * Target session-invalidation policy for IAM remediation (Prompt 2/22).
 * Pure domain contract — not wired to production services yet.
 */

export const IAM_SESSION_INVALIDATION_TRIGGERS = [
  'PASSWORD_CHANGED',
  'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_REMOVED',
  'ROLE_DOWNGRADED',
  'PERMISSION_REVOKED',
  'STATION_SCOPE_REDUCED',
] as const;

export type IamSessionInvalidationTrigger =
  (typeof IAM_SESSION_INVALIDATION_TRIGGERS)[number];

export type SessionInvalidationScope =
  | 'ALL_USER_SESSIONS'
  | 'ORG_BOUND_SESSIONS'
  | 'NONE';

/**
 * Canonical target policy from the production-readiness audit.
 * Org-bound sessions (Prompt 4) refine MEMBERSHIP_* scopes; until then
 * ALL_USER_SESSIONS is the minimum acceptable bar for credential changes.
 */
export const TARGET_SESSION_INVALIDATION_POLICY: Record<
  IamSessionInvalidationTrigger,
  SessionInvalidationScope
> = {
  PASSWORD_CHANGED: 'ALL_USER_SESSIONS',
  MEMBERSHIP_SUSPENDED: 'ORG_BOUND_SESSIONS',
  MEMBERSHIP_REMOVED: 'ORG_BOUND_SESSIONS',
  ROLE_DOWNGRADED: 'ORG_BOUND_SESSIONS',
  PERMISSION_REVOKED: 'ORG_BOUND_SESSIONS',
  STATION_SCOPE_REDUCED: 'ORG_BOUND_SESSIONS',
};

export function sessionInvalidationSatisfiesTarget(
  trigger: IamSessionInvalidationTrigger,
  observed: SessionInvalidationScope,
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
  observed: SessionInvalidationScope,
): string {
  const target = TARGET_SESSION_INVALIDATION_POLICY[trigger];
  return `trigger=${trigger} observed=${observed} target=${target}`;
}
