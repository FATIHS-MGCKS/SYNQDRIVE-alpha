import { DIAGNOSTIC_MAX_FUTURE_SKEW_MS } from '@modules/vehicles/connectivity/domain/connectivity-diagnostic-state';
import { EXP021_DEFAULT_TELEMETRY_FRESHNESS } from '../reference-capture-exp-021-motion.lib';
import type { Exp021FleetTelemetryFreshnessState } from './reference-capture-exp021-fleet.types';

export type Exp021FleetFreshnessAuthority =
  | 'DIMO_LAST_SIGNAL'
  | 'LATEST_STATE_LAST_SEEN_AT'
  | 'SIGNALS_LATEST_PROVIDER_TIMESTAMP';

export type Exp021FleetFreshnessCandidate = {
  authority: Exp021FleetFreshnessAuthority;
  timestamp: Date;
};

export type Exp021FleetFreshnessResolution = {
  telemetryFreshness: Exp021FleetTelemetryFreshnessState;
  freshnessTimestamp: string | null;
  freshnessAuthority: Exp021FleetFreshnessAuthority | null;
  freshnessAgeMs: number | null;
  consideredAuthorities: Exp021FleetFreshnessAuthority[];
  rejectedAuthorities: Array<{
    authority: Exp021FleetFreshnessAuthority;
    reason: 'NULL' | 'INVALID' | 'FUTURE_BEYOND_SKEW';
  }>;
};

export type Exp021FleetFreshnessResolverInput = {
  dimoLastSignal: Date | null;
  latestStateLastSeenAt: Date | null;
  signalsLatestLastSeen: Date | null;
};

const FRESHNESS_THRESHOLD_MS = EXP021_DEFAULT_TELEMETRY_FRESHNESS.vehicleTelemetryFreshThresholdMs;

export function parseSignalsLatestLastSeen(
  rawPayloadJson: unknown,
): Date | null {
  if (!rawPayloadJson || typeof rawPayloadJson !== 'object' || Array.isArray(rawPayloadJson)) {
    return null;
  }
  const lastSeen = (rawPayloadJson as Record<string, unknown>).lastSeen;
  if (typeof lastSeen !== 'string' || lastSeen.trim() === '') return null;
  const parsed = new Date(lastSeen);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateCandidate(
  authority: Exp021FleetFreshnessAuthority,
  timestamp: Date | null,
  nowMs: number,
): { candidate: Exp021FleetFreshnessCandidate | null; rejection: Exp021FleetFreshnessResolution['rejectedAuthorities'][number] | null } {
  if (!timestamp) {
    return { candidate: null, rejection: { authority, reason: 'NULL' } };
  }
  const ms = timestamp.getTime();
  if (!Number.isFinite(ms)) {
    return { candidate: null, rejection: { authority, reason: 'INVALID' } };
  }
  if (ms > nowMs + DIAGNOSTIC_MAX_FUTURE_SKEW_MS) {
    return { candidate: null, rejection: { authority, reason: 'FUTURE_BEYOND_SKEW' } };
  }
  return { candidate: { authority, timestamp }, rejection: null };
}

/**
 * Fleet coordinator freshness uses the newest valid provider-backed telemetry
 * authority — not nullish coalescing. `vehicle_latest_states.last_seen_at` is
 * snapshot-updated provider event time; `dimo_vehicles.last_signal` may lag
 * because identity sync runs less frequently than snapshot polling.
 */
export function resolveExp021FleetTelemetryFreshness(
  input: Exp021FleetFreshnessResolverInput,
  nowMs: number = Date.now(),
): Exp021FleetFreshnessResolution {
  const rejectedAuthorities: Exp021FleetFreshnessResolution['rejectedAuthorities'] = [];
  const candidates: Exp021FleetFreshnessCandidate[] = [];

  for (const [authority, timestamp] of [
    ['LATEST_STATE_LAST_SEEN_AT', input.latestStateLastSeenAt] as const,
    ['SIGNALS_LATEST_PROVIDER_TIMESTAMP', input.signalsLatestLastSeen] as const,
    ['DIMO_LAST_SIGNAL', input.dimoLastSignal] as const,
  ]) {
    const { candidate, rejection } = validateCandidate(authority, timestamp, nowMs);
    if (candidate) candidates.push(candidate);
    if (rejection) rejectedAuthorities.push(rejection);
  }

  if (candidates.length === 0) {
    return {
      telemetryFreshness: 'UNAVAILABLE',
      freshnessTimestamp: null,
      freshnessAuthority: null,
      freshnessAgeMs: null,
      consideredAuthorities: [
        'LATEST_STATE_LAST_SEEN_AT',
        'SIGNALS_LATEST_PROVIDER_TIMESTAMP',
        'DIMO_LAST_SIGNAL',
      ],
      rejectedAuthorities,
    };
  }

  candidates.sort((a, b) => {
    const delta = b.timestamp.getTime() - a.timestamp.getTime();
    if (delta !== 0) return delta;
    const priority: Record<Exp021FleetFreshnessAuthority, number> = {
      LATEST_STATE_LAST_SEEN_AT: 0,
      SIGNALS_LATEST_PROVIDER_TIMESTAMP: 1,
      DIMO_LAST_SIGNAL: 2,
    };
    return priority[a.authority] - priority[b.authority];
  });

  const winner = candidates[0];
  const freshnessAgeMs = Math.max(0, nowMs - winner.timestamp.getTime());
  const telemetryFreshness: Exp021FleetTelemetryFreshnessState =
    freshnessAgeMs <= FRESHNESS_THRESHOLD_MS ? 'FRESH' : 'STALE';

  return {
    telemetryFreshness,
    freshnessTimestamp: winner.timestamp.toISOString(),
    freshnessAuthority: winner.authority,
    freshnessAgeMs,
    consideredAuthorities: [
      'LATEST_STATE_LAST_SEEN_AT',
      'SIGNALS_LATEST_PROVIDER_TIMESTAMP',
      'DIMO_LAST_SIGNAL',
    ],
    rejectedAuthorities,
  };
}
