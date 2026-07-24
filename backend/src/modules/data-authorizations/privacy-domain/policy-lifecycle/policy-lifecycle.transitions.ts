import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { POLICY_ACTIVATABLE_STATUSES } from './policy-lifecycle.constants';

/**
 * Allowed status transitions for versioned privacy policies.
 *
 * System-only edges (e.g. ACTIVE → SUPERSEDED during activation of a successor)
 * are listed here but should only be invoked from lifecycle service internals.
 */
export const POLICY_LIFECYCLE_TRANSITIONS: Readonly<
  Record<PrivacyPolicyLifecycleStatus, readonly PrivacyPolicyLifecycleStatus[]>
> = {
  [PrivacyPolicyLifecycleStatus.DRAFT]: [PrivacyPolicyLifecycleStatus.IN_REVIEW],
  [PrivacyPolicyLifecycleStatus.IN_REVIEW]: [
    PrivacyPolicyLifecycleStatus.APPROVED,
    PrivacyPolicyLifecycleStatus.REJECTED,
    PrivacyPolicyLifecycleStatus.DRAFT,
  ],
  [PrivacyPolicyLifecycleStatus.APPROVED]: [
    PrivacyPolicyLifecycleStatus.SCHEDULED,
    PrivacyPolicyLifecycleStatus.ACTIVE,
    PrivacyPolicyLifecycleStatus.SUPERSEDED,
  ],
  [PrivacyPolicyLifecycleStatus.SCHEDULED]: [
    PrivacyPolicyLifecycleStatus.ACTIVE,
    PrivacyPolicyLifecycleStatus.APPROVED,
    PrivacyPolicyLifecycleStatus.SUPERSEDED,
  ],
  [PrivacyPolicyLifecycleStatus.ACTIVE]: [
    PrivacyPolicyLifecycleStatus.SUSPENDED,
    PrivacyPolicyLifecycleStatus.SUPERSEDED,
    PrivacyPolicyLifecycleStatus.REVOKED,
    PrivacyPolicyLifecycleStatus.EXPIRED,
  ],
  [PrivacyPolicyLifecycleStatus.SUSPENDED]: [
    PrivacyPolicyLifecycleStatus.ACTIVE,
    PrivacyPolicyLifecycleStatus.EXPIRED,
  ],
  [PrivacyPolicyLifecycleStatus.SUPERSEDED]: [],
  [PrivacyPolicyLifecycleStatus.REVOKED]: [],
  [PrivacyPolicyLifecycleStatus.EXPIRED]: [],
  [PrivacyPolicyLifecycleStatus.REJECTED]: [],
};

/** Explicitly forbidden cross-status transitions (semantic guard). */
export const POLICY_FORBIDDEN_TRANSITIONS: ReadonlyArray<{
  from: PrivacyPolicyLifecycleStatus;
  to: PrivacyPolicyLifecycleStatus;
  reason: string;
}> = [
  {
    from: PrivacyPolicyLifecycleStatus.REJECTED,
    to: PrivacyPolicyLifecycleStatus.REVOKED,
    reason: 'REJECTED was never operational and cannot appear as REVOKED',
  },
  {
    from: PrivacyPolicyLifecycleStatus.REJECTED,
    to: PrivacyPolicyLifecycleStatus.ACTIVE,
    reason: 'REJECTED policies cannot be activated',
  },
  {
    from: PrivacyPolicyLifecycleStatus.REVOKED,
    to: PrivacyPolicyLifecycleStatus.ACTIVE,
    reason: 'REVOKED policies cannot be reactivated',
  },
  {
    from: PrivacyPolicyLifecycleStatus.DRAFT,
    to: PrivacyPolicyLifecycleStatus.ACTIVE,
    reason: 'DRAFT must pass review before activation',
  },
];

export function isPolicyLifecycleTransitionAllowed(
  from: PrivacyPolicyLifecycleStatus,
  to: PrivacyPolicyLifecycleStatus,
): boolean {
  if (POLICY_FORBIDDEN_TRANSITIONS.some((f) => f.from === from && f.to === to)) {
    return false;
  }
  return (POLICY_LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

export function assertPolicyLifecycleTransition(
  from: PrivacyPolicyLifecycleStatus,
  to: PrivacyPolicyLifecycleStatus,
): void {
  if (!isPolicyLifecycleTransitionAllowed(from, to)) {
    throw new PolicyLifecycleTransitionError(from, to);
  }
}

export function isPolicyActivatable(status: PrivacyPolicyLifecycleStatus): boolean {
  return POLICY_ACTIVATABLE_STATUSES.has(status);
}

export function isPolicyCurrentlyUsable(input: {
  status: PrivacyPolicyLifecycleStatus;
  validFrom?: Date | null;
  validUntil?: Date | null;
  now?: Date;
}): boolean {
  if (input.status !== PrivacyPolicyLifecycleStatus.ACTIVE) {
    return false;
  }
  const now = input.now ?? new Date();
  if (input.validFrom && input.validFrom.getTime() > now.getTime()) {
    return false;
  }
  if (input.validUntil && input.validUntil.getTime() < now.getTime()) {
    return false;
  }
  return true;
}

export class PolicyLifecycleTransitionError extends Error {
  readonly fromStatus: PrivacyPolicyLifecycleStatus;
  readonly toStatus: PrivacyPolicyLifecycleStatus;

  constructor(fromStatus: PrivacyPolicyLifecycleStatus, toStatus: PrivacyPolicyLifecycleStatus) {
    super(`policy_lifecycle_transition_not_allowed:${fromStatus}:${toStatus}`);
    this.name = 'PolicyLifecycleTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}
