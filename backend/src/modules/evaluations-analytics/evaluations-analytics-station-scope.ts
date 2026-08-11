import type { MembershipRole, MembershipStatus } from '@prisma/client';
import { computeEffectiveAccess } from '@modules/users/policies/effective-access-engine';

/**
 * Canonical evaluations station-scope authority.
 *
 * The Stations-V2 feature flag governs rollout/implementation only — it is NOT
 * an authorization authority. `StationAccessService.resolve` (and the underlying
 * engine) return an org-wide bypass when `stationsScopeV2Enabled === false`,
 * which would wrongly widen an assigned-station member to org-wide analytics.
 *
 * Evaluations therefore derives the actor's effective station scope from the
 * canonical membership/role data with the V2 scope path forced ON, so the
 * resulting security boundary is identical whether the flag is on or off. This
 * introduces no new role model — it reuses `computeEffectiveAccess`
 * (docs/architecture/stations-v2-permissions.md; EVAL-ADR-007).
 */
export type EvaluationsStationScopeMode =
  | 'ALL_STATIONS'
  | 'ASSIGNED_STATIONS'
  | 'NO_STATIONS';

export interface EvaluationsAuthorizedStationScope {
  readonly mode: EvaluationsStationScopeMode;
  /** `null` only for ALL_STATIONS; a bounded allow-list otherwise (may be empty). */
  readonly stationIds: string[] | null;
}

export interface EvaluationsStationScopeMembership {
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly stationScope: string | null;
  readonly stationIds: unknown;
  readonly permissions?: unknown;
  readonly organizationRoleId?: string | null;
  readonly membershipVersion?: number;
  readonly fieldAgentAccess?: boolean;
}

export function resolveEvaluationsAuthorizedStationScope(input: {
  platformRole?: string | null;
  membership: EvaluationsStationScopeMembership | null;
  organizationId: string;
}): EvaluationsAuthorizedStationScope {
  const access = computeEffectiveAccess({
    platformRole: input.platformRole ?? null,
    membership: input.membership ?? null,
    // Force the canonical V2 scope path so the feature flag can never widen the
    // authorization boundary for evaluations.
    resourceContext: {
      organizationId: input.organizationId,
      stationsScopeV2Enabled: true,
    },
  });

  if (access.stationBypass || access.effectiveStationIds === null) {
    return { mode: 'ALL_STATIONS', stationIds: null };
  }
  if (access.effectiveStationIds.length === 0) {
    return { mode: 'NO_STATIONS', stationIds: [] };
  }
  return { mode: 'ASSIGNED_STATIONS', stationIds: access.effectiveStationIds };
}
