/**
 * G5C-N16 P4H-R7 — forward-capture pilot configuration (default OFF).
 * Active only when P4C pilot scope is enabled with a valid hardened config.
 */

import { createHash } from 'crypto';

import {
  evaluateStartProxyPilotScopeV1,
  resolveStartProxyPilotScopeConfigV1,
  type StartProxyPilotScopeDecisionV1,
} from './start-proxy-pilot-scope.v1';

/** VW Tiguan WOB L 7503 — sole admitted forward-capture pilot vehicle. */
export const START_PROXY_PILOT_TIGUAN_VEHICLE_ID =
  '19fedd4b-c4e8-4de8-a125-dab293326e7e';

export const START_PROXY_PILOT_TIGUAN_DIMO_TOKEN_ID = 192922;

export type StartProxyPilotForwardCaptureConfigV1 =
  | { kind: 'disabled' }
  | { kind: 'misconfigured' }
  | {
      kind: 'active';
      pilotEpoch: string;
      maxTotalProviderRequests: number;
      maxRequestsPerTrip: number;
      rawRetentionDays: number;
      killSwitchActive: boolean;
      allowlistVehicleIds: ReadonlySet<string>;
      forwardCutoffAtMs: number;
      forwardCutoffAtIso: string;
    };

export type StartProxyPilotForwardCaptureDenyReasonV1 =
  | 'pilot_forward_capture_disabled'
  | 'pilot_forward_capture_misconfigured'
  | 'pilot_request_budget_kill_switch'
  | 'pilot_provider_budget_exhausted'
  | 'pilot_provider_budget_duplicate_trip'
  | 'pilot_raw_persist_failed';

export function parsePositiveIntEnvStrict(
  raw: string | undefined,
): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export function resolveStartProxyPilotForwardCaptureConfigV1(input: {
  pilotScopeEnabled: boolean;
  allowlistRaw: string | undefined;
  cutoffRaw: string | undefined;
  pilotEpoch: string | undefined;
  maxTotalProviderRequestsRaw: string | undefined;
  maxRequestsPerTripRaw: string | undefined;
  rawRetentionDaysRaw: string | undefined;
  killSwitchRaw: string | undefined;
}): StartProxyPilotForwardCaptureConfigV1 {
  if (!input.pilotScopeEnabled) {
    return { kind: 'disabled' };
  }

  const scopeConfig = resolveStartProxyPilotScopeConfigV1({
    pilotScopeEnabled: true,
    allowlistRaw: input.allowlistRaw,
    cutoffRaw: input.cutoffRaw,
  });
  if (scopeConfig.kind !== 'active') {
    return { kind: 'misconfigured' };
  }

  const epoch = input.pilotEpoch?.trim();
  const maxTotal = parsePositiveIntEnvStrict(input.maxTotalProviderRequestsRaw);
  const maxPerTrip =
    parsePositiveIntEnvStrict(input.maxRequestsPerTripRaw) ?? 1;
  const retentionDays =
    parsePositiveIntEnvStrict(input.rawRetentionDaysRaw) ?? 90;

  if (!epoch || maxTotal == null || maxPerTrip < 1) {
    return { kind: 'misconfigured' };
  }

  const allowlist = scopeConfig.allowlist;
  if (allowlist.kind !== 'allow_set' || scopeConfig.cutoff.kind !== 'cutoff') {
    return { kind: 'misconfigured' };
  }

  const killSwitchActive = ['1', 'true', 'yes', 'on'].includes(
    (input.killSwitchRaw ?? '').trim().toLowerCase(),
  );

  return {
    kind: 'active',
    pilotEpoch: epoch,
    maxTotalProviderRequests: maxTotal,
    maxRequestsPerTrip: maxPerTrip,
    rawRetentionDays: retentionDays,
    killSwitchActive,
    allowlistVehicleIds: allowlist.vehicleIds,
    forwardCutoffAtMs: scopeConfig.cutoff.cutoffAtMs,
    forwardCutoffAtIso: scopeConfig.cutoff.cutoffAtIso,
  };
}

export function isStartProxyPilotForwardCaptureActive(
  config: StartProxyPilotForwardCaptureConfigV1,
): boolean {
  return config.kind === 'active' && !config.killSwitchActive;
}

export function isStartProxyPilotReconciliationEnqueueBlocked(
  pilotScopeEnabled: boolean,
): boolean {
  return pilotScopeEnabled;
}

export function evaluateStartProxyPilotForwardCaptureScope(
  config: StartProxyPilotForwardCaptureConfigV1,
  input: { vehicleId: string; tripStartedAt: Date | null | undefined },
): StartProxyPilotScopeDecisionV1 {
  if (config.kind === 'disabled') {
    return { allowed: true };
  }
  if (config.kind === 'misconfigured') {
    return { allowed: false, reasonCode: 'pilot_scope_misconfigured' };
  }

  const scopeDecision = evaluateStartProxyPilotScopeV1(
    resolveStartProxyPilotScopeConfigV1({
      pilotScopeEnabled: true,
      allowlistRaw: [...config.allowlistVehicleIds].join(','),
      cutoffRaw: config.forwardCutoffAtIso,
    }),
    input,
  );
  return scopeDecision;
}

export function computeStartProxyQueryFingerprintV1(input: {
  dimoTokenId: number;
  windowFromUtc: string;
  windowToUtc: string;
  interval: string;
  signalSpecs: ReadonlyArray<{ signal: string; aggregation: string }>;
}): string {
  const payload = {
    dimoTokenId: input.dimoTokenId,
    windowFromUtc: input.windowFromUtc,
    windowToUtc: input.windowToUtc,
    interval: input.interval,
    signalSpecs: [...input.signalSpecs].sort((a, b) =>
      a.signal.localeCompare(b.signal),
    ),
  };
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}
