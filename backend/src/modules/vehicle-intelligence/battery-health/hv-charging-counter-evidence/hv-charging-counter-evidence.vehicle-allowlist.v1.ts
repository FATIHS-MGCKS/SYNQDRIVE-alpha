/** M3.3-HV-R22-P0 — fail-closed vehicle allowlist for charging-counter capture. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HvChargingCounterVehicleAllowlistDenyReasonV1 =
  | 'missing_or_empty'
  | 'invalid_entries';

export type HvChargingCounterVehicleAllowlistStateV1 =
  | { kind: 'deny_all'; reason: HvChargingCounterVehicleAllowlistDenyReasonV1 }
  | { kind: 'allow_set'; vehicleIds: ReadonlySet<string> };

export function parseHvChargingCounterVehicleAllowlistV1(
  raw: string | undefined,
): HvChargingCounterVehicleAllowlistStateV1 {
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

export function isVehicleAllowlistedInHvChargingCounterStateV1(
  state: HvChargingCounterVehicleAllowlistStateV1,
  vehicleId: string,
): boolean {
  if (state.kind === 'deny_all') {
    return false;
  }
  return state.vehicleIds.has(vehicleId.trim().toLowerCase());
}
