import { MembershipRole } from '@prisma/client';
import {
  STATION_SCOPE_MODE,
  type StationScopeMode,
} from './station-scope.constants';
import type { StationScopeMembershipRecord, StationScopeRequestLike } from './station-scope.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseStationIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((id): id is string => typeof id === 'string' && !!id.trim())
      .map((id) => id.trim());
  }
  return [];
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Extract a raw station id candidate from the request without trusting it.
 * Checks `params.id`, `params.stationId`, `body.stationId`, `query.stationId`.
 */
export function resolveStationIdFromRequest(request: StationScopeRequestLike): string | null {
  const fromParams = request.params?.stationId ?? request.params?.id;
  if (typeof fromParams === 'string' && fromParams.trim()) {
    return fromParams.trim();
  }

  const bodyStationId = request.body?.stationId;
  if (typeof bodyStationId === 'string' && bodyStationId.trim()) {
    return bodyStationId.trim();
  }

  const queryStationId = firstQueryValue(request.query?.stationId);
  if (typeof queryStationId === 'string' && queryStationId.trim()) {
    return queryStationId.trim();
  }

  return null;
}

export function resolveNestedResourceIdFromRequest(
  request: StationScopeRequestLike,
  fieldName: string,
): string | null {
  const fromParams = request.params?.[fieldName];
  if (typeof fromParams === 'string' && fromParams.trim()) {
    return fromParams.trim();
  }

  const fromBody = request.body?.[fieldName];
  if (typeof fromBody === 'string' && fromBody.trim()) {
    return fromBody.trim();
  }

  const fromQuery = firstQueryValue(request.query?.[fieldName]);
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }

  return null;
}

export function isHistoricalReadHttpMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
}

export function isWriteHttpMethod(method: string): boolean {
  return !isHistoricalReadHttpMethod(method);
}

/**
 * Derive scope mode from membership fields (legacy-compatible until `station_scope_mode` column ships).
 */
export function resolveStationScopeMode(
  membership: StationScopeMembershipRecord,
): StationScopeMode {
  const explicit = membership.stationScopeMode?.trim();
  if (explicit === STATION_SCOPE_MODE.ALL_STATIONS) return STATION_SCOPE_MODE.ALL_STATIONS;
  if (explicit === STATION_SCOPE_MODE.ASSIGNED_STATIONS) {
    return STATION_SCOPE_MODE.ASSIGNED_STATIONS;
  }
  if (explicit === STATION_SCOPE_MODE.NO_STATIONS) return STATION_SCOPE_MODE.NO_STATIONS;

  if (membership.role === MembershipRole.ORG_ADMIN) {
    return STATION_SCOPE_MODE.ALL_STATIONS;
  }

  if (membership.role === MembershipRole.DRIVER) {
    return STATION_SCOPE_MODE.NO_STATIONS;
  }

  const legacyScope = membership.stationScope?.trim();
  if (legacyScope === 'ALL') {
    return STATION_SCOPE_MODE.ALL_STATIONS;
  }

  const assignedIds = resolveAssignedStationIds(membership);
  if (assignedIds.length > 0) {
    return STATION_SCOPE_MODE.ASSIGNED_STATIONS;
  }

  if (legacyScope && isUuidLike(legacyScope)) {
    return STATION_SCOPE_MODE.ASSIGNED_STATIONS;
  }

  if (
    membership.role === MembershipRole.SUB_ADMIN ||
    membership.role === MembershipRole.WORKER
  ) {
    return STATION_SCOPE_MODE.ASSIGNED_STATIONS;
  }

  return STATION_SCOPE_MODE.ALL_STATIONS;
}

export function resolveAssignedStationIds(
  membership: StationScopeMembershipRecord,
): string[] {
  const fromJson = parseStationIds(membership.stationIds);
  if (fromJson.length > 0) {
    return Array.from(new Set(fromJson));
  }

  const legacyScope = membership.stationScope?.trim();
  if (legacyScope && legacyScope !== 'ALL' && isUuidLike(legacyScope)) {
    return [legacyScope];
  }

  return [];
}

export function resolveAllowedStationIds(
  mode: StationScopeMode,
  membership: StationScopeMembershipRecord,
): string[] | null {
  switch (mode) {
    case STATION_SCOPE_MODE.ALL_STATIONS:
      return null;
    case STATION_SCOPE_MODE.NO_STATIONS:
      return [];
    case STATION_SCOPE_MODE.ASSIGNED_STATIONS:
      return resolveAssignedStationIds(membership);
    default:
      return [];
  }
}

export function isStationIdAllowed(
  stationId: string,
  mode: StationScopeMode,
  allowedStationIds: string[] | null,
): boolean {
  if (mode === STATION_SCOPE_MODE.NO_STATIONS) return false;
  if (mode === STATION_SCOPE_MODE.ALL_STATIONS || allowedStationIds === null) return true;
  return allowedStationIds.includes(stationId);
}

export function stationIdsIntersectScope(
  stationIds: Array<string | null | undefined>,
  mode: StationScopeMode,
  allowedStationIds: string[] | null,
): boolean {
  const normalized = stationIds.filter((id): id is string => typeof id === 'string' && !!id);
  if (normalized.length === 0) return false;
  return normalized.some((stationId) =>
    isStationIdAllowed(stationId, mode, allowedStationIds),
  );
}
