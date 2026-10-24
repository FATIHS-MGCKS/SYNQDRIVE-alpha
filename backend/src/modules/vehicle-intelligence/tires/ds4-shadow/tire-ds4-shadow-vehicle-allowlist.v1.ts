/** P2.1 canary — fail-closed vehicle allowlist for DS4 → tire shadow adapter. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TireDs4ShadowVehicleAllowlistDenyReasonV1 =
  | 'missing_or_empty'
  | 'invalid_entries';

export type TireDs4ShadowVehicleAllowlistStateV1 =
  | { kind: 'deny_all'; reason: TireDs4ShadowVehicleAllowlistDenyReasonV1 }
  | { kind: 'allow_set'; vehicleIds: ReadonlySet<string> };

export function parseTireDs4ShadowVehicleAllowlistV1(
  raw: string | undefined,
): TireDs4ShadowVehicleAllowlistStateV1 {
  if (raw == null || raw.trim() === '') {
    return { kind: 'deny_all', reason: 'missing_or_empty' };
  }

  const parts = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { kind: 'deny_all', reason: 'missing_or_empty' };
  }

  const vehicleIds = new Set<string>();
  for (const part of parts) {
    if (!UUID_RE.test(part)) {
      return { kind: 'deny_all', reason: 'invalid_entries' };
    }
    vehicleIds.add(part.toLowerCase());
  }

  return { kind: 'allow_set', vehicleIds };
}

export function isVehicleAllowlistedInTireDs4ShadowStateV1(
  state: TireDs4ShadowVehicleAllowlistStateV1,
  vehicleId: string,
): boolean {
  if (state.kind === 'deny_all') {
    return false;
  }
  return state.vehicleIds.has(vehicleId.trim().toLowerCase());
}

export function tireDs4ShadowAllowedVehicleIdsForCatchupV1(
  state: TireDs4ShadowVehicleAllowlistStateV1,
): readonly string[] | null {
  if (state.kind === 'deny_all') {
    return null;
  }
  return [...state.vehicleIds];
}
