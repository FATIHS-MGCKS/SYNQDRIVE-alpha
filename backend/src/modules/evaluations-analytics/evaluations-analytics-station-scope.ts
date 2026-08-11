import type { MembershipRole, MembershipStatus } from '@prisma/client';

/**
 * Canonical evaluations station-scope authority (role-first, fail-closed).
 *
 * The central `computeEffectiveAccess` engine resolves an empty/absent station
 * assignment (`stationIds = []`, `stationScope = null`) to ALL stations for
 * station-restricted roles, and bypasses scope entirely when
 * `stationsScopeV2Enabled === false`. Both would widen an unassigned member to
 * org-wide analytics, contradicting the documented station policy
 * (docs/architecture/stations-v2-permissions.md, PG-01…PG-05; EVAL-ADR-007).
 *
 * Evaluations therefore derives station authorization directly here, so that:
 * - the Stations-V2 feature flag never affects the boundary, and
 * - a missing/empty assignment is NEVER treated as "all stations".
 *
 * Authority per role:
 *   MASTER_ADMIN                      → ALL_STATIONS (platform authority; the org
 *                                       boundary is enforced separately by the
 *                                       :orgId route + repository org filter)
 *   ORG_ADMIN                         → ALL_STATIONS (own org)
 *   SUB_ADMIN / WORKER                → ASSIGNED_STATIONS from explicit
 *                                       stationIds/stationScope; an explicit
 *                                       stationScope === 'ALL' is a deliberate
 *                                       all-stations grant; empty/absent → NO_STATIONS
 *   DRIVER                            → NO_STATIONS
 *   inactive / non-member / other     → NO_STATIONS
 *
 * `null` (ALL_STATIONS) is strictly distinct from `[]` (NO_STATIONS).
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
}

const ALL: EvaluationsAuthorizedStationScope = { mode: 'ALL_STATIONS', stationIds: null };
const NONE: EvaluationsAuthorizedStationScope = { mode: 'NO_STATIONS', stationIds: [] };

function parseAssignedStationIds(
  membership: EvaluationsStationScopeMembership,
): string[] {
  const list = Array.isArray(membership.stationIds) ? membership.stationIds : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  if (cleaned.length > 0) return cleaned;

  // Legacy single-station assignment (a concrete station id, never 'ALL'/empty).
  const scope = typeof membership.stationScope === 'string' ? membership.stationScope.trim() : '';
  if (scope && scope !== 'ALL') return [scope];
  return [];
}

export function resolveEvaluationsAuthorizedStationScope(input: {
  platformRole?: string | null;
  membership: EvaluationsStationScopeMembership | null;
  organizationId: string;
}): EvaluationsAuthorizedStationScope {
  if (input.platformRole === 'MASTER_ADMIN') return ALL;

  const membership = input.membership;
  if (!membership || membership.status !== 'ACTIVE') return NONE;

  if (membership.role === 'ORG_ADMIN') return ALL;
  if (membership.role === 'DRIVER') return NONE;

  // SUB_ADMIN / WORKER (and any other non-admin role): station-restricted.
  const explicitScope =
    typeof membership.stationScope === 'string' ? membership.stationScope.trim() : '';
  if (explicitScope === 'ALL') return ALL;

  const assigned = parseAssignedStationIds(membership);
  if (assigned.length === 0) return NONE;
  return { mode: 'ASSIGNED_STATIONS', stationIds: assigned };
}
