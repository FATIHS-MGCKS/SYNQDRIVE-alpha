import { ForbiddenException } from '@nestjs/common';
import {
  STATIONS_V2_LEGACY_WRITE_KEYS,
  STATIONS_V2_PERMISSION_KEYS,
  isStationsV2PermissionAction,
  stationsV2ActionToKey,
  type StationsV2PermissionAction,
  type StationsV2PermissionKey,
  type StationsV2PermissionsMap,
} from './stations-v2-permission.constants';
import type { PermissionActor } from './permission.util';

const STATIONS_V2_JSON_KEY = 'stationsV2';

/**
 * Normalize a raw `stationsV2` JSON block. Unknown keys are dropped; missing keys default to false.
 * Returns null when the block is absent/invalid or no flag is true.
 */
export function normalizeStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  const explicit = coerceStationsV2Permissions(raw);
  if (!explicit) return null;
  const hasAny = STATIONS_V2_PERMISSION_KEYS.some((key) => explicit[key]);
  return hasAny ? explicit : null;
}

/**
 * Coerce a raw `stationsV2` JSON block to a full map (may be all-false).
 */
export function coerceStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const out = {} as StationsV2PermissionsMap;

  for (const key of STATIONS_V2_PERMISSION_KEYS) {
    out[key] = source[key] === true;
  }

  return out;
}

/**
 * Map legacy `stations.{read,write,manage}` module flags to V2 booleans (§11 migration).
 */
export function mapLegacyStationsModuleToV2(flags: {
  read?: boolean;
  write?: boolean;
  manage?: boolean;
}): StationsV2PermissionsMap {
  const out = {} as StationsV2PermissionsMap;
  for (const key of STATIONS_V2_PERMISSION_KEYS) {
    out[key] = false;
  }

  if (flags.manage === true) {
    for (const key of STATIONS_V2_PERMISSION_KEYS) {
      out[key] = true;
    }
    return out;
  }

  if (flags.read === true) {
    out.read = true;
    out.view_activity = true;
  }

  if (flags.write === true) {
    for (const key of STATIONS_V2_LEGACY_WRITE_KEYS) {
      out[key] = true;
    }
  }

  return out;
}

function extractLegacyStationsFlags(
  raw: Record<string, unknown>,
): { read?: boolean; write?: boolean; manage?: boolean } | null {
  const legacy = raw.stations;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
  const flags = legacy as Record<string, unknown>;
  return {
    read: flags.read === true,
    write: flags.write === true,
    manage: flags.manage === true,
  };
}

/**
 * Resolve effective Stations V2 permissions from raw membership JSON.
 * Prefers explicit `stationsV2`; falls back to legacy `stations` module mapping.
 */
export function resolveStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, STATIONS_V2_JSON_KEY)) {
    const explicit = coerceStationsV2Permissions(record[STATIONS_V2_JSON_KEY]);
    return explicit;
  }

  const legacyFlags = extractLegacyStationsFlags(record);
  if (!legacyFlags) return null;

  const mapped = mapLegacyStationsModuleToV2(legacyFlags);
  const hasAny = STATIONS_V2_PERMISSION_KEYS.some((key) => mapped[key]);
  return hasAny ? mapped : null;
}

export function evaluateStationsV2Permission(
  permissions: StationsV2PermissionsMap | null,
  action: StationsV2PermissionAction,
): boolean {
  if (!permissions) return false;
  const key = stationsV2ActionToKey(action);
  return permissions[key] === true;
}

/**
 * Service-layer Stations V2 permission check.
 * Does not bypass ORG_ADMIN — explicit `stationsV2` (or legacy fallback) is required.
 */
export async function assertStationsV2Permission(
  prisma: {
    organizationMembership: {
      findFirst: (args: unknown) => Promise<{
        permissions: unknown;
      } | null>;
    };
  },
  actor: PermissionActor,
  orgId: string,
  action: StationsV2PermissionAction,
): Promise<void> {
  if (!isStationsV2PermissionAction(action)) {
    throw new ForbiddenException(`Unknown permission: ${action}`);
  }

  if (!actor.id) {
    throw new ForbiddenException('Authentication required');
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: actor.id,
      organizationId: orgId,
      status: 'ACTIVE',
    },
    select: { permissions: true },
  });

  if (!membership) {
    throw new ForbiddenException('You do not have access to this organization');
  }

  const resolved = resolveStationsV2Permissions(membership.permissions);
  if (!evaluateStationsV2Permission(resolved, action)) {
    throw new ForbiddenException(`Missing permission: ${action}`);
  }
}

export function mergeStationsV2IntoMembershipPermissions<T extends Record<string, unknown>>(
  permissions: T,
  stationsV2: StationsV2PermissionsMap,
): T & { stationsV2: StationsV2PermissionsMap } {
  return { ...permissions, stationsV2 };
}
