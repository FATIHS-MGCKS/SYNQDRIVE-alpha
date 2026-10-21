/**
 * G5C-N16 P4C — optional fail-closed pilot scope for ICE_START_PROXY.
 *
 * When pilot scope is disabled (default), this module imposes no restrictions.
 * When enabled, a valid non-empty vehicle allowlist and forward cutoff are mandatory;
 * missing or invalid configuration denies all start-proxy work (never fleet-wide fallback).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StartProxyPilotAllowlistDenyReasonV1 =
  | 'missing_or_empty'
  | 'invalid_entries';

export type StartProxyPilotAllowlistStateV1 =
  | { kind: 'deny_all'; reason: StartProxyPilotAllowlistDenyReasonV1 }
  | { kind: 'allow_set'; vehicleIds: ReadonlySet<string> };

export type StartProxyPilotCutoffStateV1 =
  | { kind: 'deny_all'; reason: 'missing_or_empty' | 'invalid_timestamp' }
  | { kind: 'cutoff'; cutoffAtMs: number; cutoffAtIso: string };

export type StartProxyPilotScopeConfigV1 =
  | { kind: 'disabled' }
  | {
      kind: 'active';
      allowlist: StartProxyPilotAllowlistStateV1;
      cutoff: StartProxyPilotCutoffStateV1;
    };

export type StartProxyPilotScopeDenyReasonV1 =
  | 'pilot_scope_misconfigured'
  | 'pilot_vehicle_not_allowlisted'
  | 'pilot_trip_start_required'
  | 'pilot_trip_start_invalid'
  | 'pilot_trip_not_after_cutoff';

export type StartProxyPilotScopeDecisionV1 =
  | { allowed: true }
  | { allowed: false; reasonCode: StartProxyPilotScopeDenyReasonV1 };

export function parseStartProxyPilotVehicleAllowlistV1(
  raw: string | undefined,
): StartProxyPilotAllowlistStateV1 {
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

export function parseStartProxyPilotForwardCutoffV1(
  raw: string | undefined,
): StartProxyPilotCutoffStateV1 {
  if (raw == null || raw.trim() === '') {
    return { kind: 'deny_all', reason: 'missing_or_empty' };
  }

  const trimmed = raw.trim();
  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    return { kind: 'deny_all', reason: 'invalid_timestamp' };
  }

  return {
    kind: 'cutoff',
    cutoffAtMs: parsedMs,
    cutoffAtIso: new Date(parsedMs).toISOString(),
  };
}

export function resolveStartProxyPilotScopeConfigV1(input: {
  pilotScopeEnabled: boolean;
  allowlistRaw: string | undefined;
  cutoffRaw: string | undefined;
}): StartProxyPilotScopeConfigV1 {
  if (!input.pilotScopeEnabled) {
    return { kind: 'disabled' };
  }

  return {
    kind: 'active',
    allowlist: parseStartProxyPilotVehicleAllowlistV1(input.allowlistRaw),
    cutoff: parseStartProxyPilotForwardCutoffV1(input.cutoffRaw),
  };
}

function isPilotScopeConfigValid(config: StartProxyPilotScopeConfigV1 & { kind: 'active' }): boolean {
  if (config.allowlist.kind !== 'allow_set') {
    return false;
  }
  if (config.cutoff.kind !== 'cutoff') {
    return false;
  }
  return config.allowlist.vehicleIds.size > 0;
}

export function isVehicleAllowlistedInStartProxyPilotStateV1(
  state: StartProxyPilotAllowlistStateV1,
  vehicleId: string,
): boolean {
  if (state.kind === 'deny_all') {
    return false;
  }
  return state.vehicleIds.has(vehicleId.trim().toLowerCase());
}

/**
 * Evaluate pilot scope for a single start-proxy unit of work.
 * When pilot scope is disabled, always allows (global START_PROXY flag remains separate).
 */
export function evaluateStartProxyPilotScopeV1(
  config: StartProxyPilotScopeConfigV1,
  input: {
    vehicleId: string;
    tripStartedAt: Date | null | undefined;
  },
): StartProxyPilotScopeDecisionV1 {
  if (config.kind === 'disabled') {
    return { allowed: true };
  }

  if (!isPilotScopeConfigValid(config)) {
    return { allowed: false, reasonCode: 'pilot_scope_misconfigured' };
  }

  const allowlist = config.allowlist as Extract<
    StartProxyPilotAllowlistStateV1,
    { kind: 'allow_set' }
  >;
  const cutoff = config.cutoff as Extract<StartProxyPilotCutoffStateV1, { kind: 'cutoff' }>;

  if (!isVehicleAllowlistedInStartProxyPilotStateV1(allowlist, input.vehicleId)) {
    return { allowed: false, reasonCode: 'pilot_vehicle_not_allowlisted' };
  }

  if (input.tripStartedAt == null) {
    return { allowed: false, reasonCode: 'pilot_trip_start_required' };
  }

  const tripMs = input.tripStartedAt.getTime();
  if (!Number.isFinite(tripMs)) {
    return { allowed: false, reasonCode: 'pilot_trip_start_invalid' };
  }

  if (tripMs <= cutoff.cutoffAtMs) {
    return { allowed: false, reasonCode: 'pilot_trip_not_after_cutoff' };
  }

  return { allowed: true };
}
