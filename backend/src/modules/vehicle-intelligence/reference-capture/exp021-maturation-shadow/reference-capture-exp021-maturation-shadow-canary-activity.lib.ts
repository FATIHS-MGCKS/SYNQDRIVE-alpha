import {
  EXP021_DEFAULT_TELEMETRY_FRESHNESS,
  classifyMotionState,
  type TelemetryFreshnessConfig,
} from '../reference-capture-exp-021-motion.lib';
import type { Exp021MaturationShadowActivityAuthority } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';

export const EXP021_CANARY_SPEED_PROVIDER_FIELDS = ['speed', 'currentSpeed'] as const;

export type Exp021CanarySpeedObservation = {
  providerField: string | null;
  providerTimestamp: Date | null;
  normalizedValueJson: unknown;
  rawValueJson?: unknown;
};

const PARKED_SPEED_KMH = 3;
const MOVEMENT_SPEED_KMH = 10;

export function parseStrictCanaryTokenId(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid --token-id (strict decimal integer required): ${raw}`);
  }
  const tokenId = Number(raw);
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) {
    throw new Error(`Invalid --token-id: ${raw}`);
  }
  return tokenId;
}

export function parseSpeedKmhFromObservation(observation: Exp021CanarySpeedObservation): number | null {
  const candidates = [observation.normalizedValueJson, observation.rawValueJson];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'object' && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      for (const key of ['value', 'speedKmh', 'kmh']) {
        const raw = record[key];
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string' && raw.trim() !== '') {
          const parsed = Number.parseFloat(raw);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
    }
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const parsed = Number.parseFloat(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function isSpeedObservation(observation: Exp021CanarySpeedObservation): boolean {
  if (!observation.providerField) return false;
  return EXP021_CANARY_SPEED_PROVIDER_FIELDS.includes(
    observation.providerField as (typeof EXP021_CANARY_SPEED_PROVIDER_FIELDS)[number],
  );
}

function observationInGeometryWindow(
  observation: Exp021CanarySpeedObservation,
  windowFromMs: number,
  windowToMs: number,
): boolean {
  if (!observation.providerTimestamp) return false;
  const ts = observation.providerTimestamp.getTime();
  return ts >= windowFromMs && ts <= windowToMs;
}

type GeometrySpeedSlice = {
  observations: Exp021CanarySpeedObservation[];
  windowFromMs: number;
  windowToMs: number;
};

function collectSpeedSlice(
  observations: Exp021CanarySpeedObservation[],
  windowFromMs: number,
  windowToMs: number,
): GeometrySpeedSlice {
  return {
    windowFromMs,
    windowToMs,
    observations: observations
      .filter(isSpeedObservation)
      .filter((obs) => observationInGeometryWindow(obs, windowFromMs, windowToMs))
      .filter((obs) => obs.providerTimestamp != null),
  };
}

function summarizeSpeedSlice(
  slice: GeometrySpeedSlice,
  freshness: TelemetryFreshnessConfig,
): Exp021MaturationShadowActivityAuthority {
  if (slice.observations.length === 0) {
    return {};
  }

  const latestTimestampMs = Math.max(
    ...slice.observations.map((obs) => obs.providerTimestamp!.getTime()),
  );
  const vehicleTelemetryFresh =
    slice.windowToMs - latestTimestampMs <= freshness.vehicleTelemetryFreshThresholdMs;

  let maxSpeedKmh: number | null = null;
  let latestSpeedKmh: number | null = null;
  let latestSpeedTimestampMs = -1;

  for (const obs of slice.observations) {
    const speedKmh = parseSpeedKmhFromObservation(obs);
    if (speedKmh == null) continue;
    maxSpeedKmh = maxSpeedKmh == null ? speedKmh : Math.max(maxSpeedKmh, speedKmh);
    const ts = obs.providerTimestamp!.getTime();
    if (ts >= latestSpeedTimestampMs) {
      latestSpeedTimestampMs = ts;
      latestSpeedKmh = speedKmh;
    }
  }

  if (latestSpeedKmh == null || latestSpeedTimestampMs < 0) {
    return { vehicleTelemetryFresh };
  }

  const speedAgeMs = Math.max(0, slice.windowToMs - latestSpeedTimestampMs);
  const speedSignalFresh = speedAgeMs <= freshness.speedSignalFreshThresholdMs;

  const maxMotion = classifyMotionState(
    { speedKmh: maxSpeedKmh, speedSignalFresh },
    PARKED_SPEED_KMH,
    MOVEMENT_SPEED_KMH,
  );
  if (maxMotion === 'MOVING') {
    return {
      speedKmh: maxSpeedKmh,
      speedSignalFresh,
      vehicleTelemetryFresh,
    };
  }

  const latestMotion = classifyMotionState(
    { speedKmh: latestSpeedKmh, speedSignalFresh },
    PARKED_SPEED_KMH,
    MOVEMENT_SPEED_KMH,
  );
  if (latestMotion === 'PARKED_CANDIDATE' && vehicleTelemetryFresh) {
    return {
      speedKmh: latestSpeedKmh,
      speedSignalFresh,
      vehicleTelemetryFresh,
    };
  }

  return {
    speedKmh: latestSpeedKmh,
    speedSignalFresh,
    vehicleTelemetryFresh,
  };
}

function sliceHasMovement(authority: Exp021MaturationShadowActivityAuthority): boolean {
  const motion = classifyMotionState(
    {
      speedKmh: authority.speedKmh ?? null,
      speedSignalFresh: authority.speedSignalFresh ?? false,
    },
    PARKED_SPEED_KMH,
    MOVEMENT_SPEED_KMH,
  );
  return motion === 'MOVING';
}

/**
 * Geometry-specific independent movement authority from persisted reference-capture
 * speed observations — NOT from maturation-shadow DIMO historical query under test.
 */
export function resolveGeometryActivityAuthorityFromSpeedObservations(
  observations: Exp021CanarySpeedObservation[],
  canonicalWindowTo: Date,
  geometryMs: number,
  freshness: TelemetryFreshnessConfig = EXP021_DEFAULT_TELEMETRY_FRESHNESS,
): Exp021MaturationShadowActivityAuthority {
  const windowToMs = canonicalWindowTo.getTime();
  const windowFromMs = windowToMs - geometryMs;
  const fullSlice = collectSpeedSlice(observations, windowFromMs, windowToMs);

  if (geometryMs === 90_000) {
    const prefixSlice = collectSpeedSlice(observations, windowToMs - 90_000, windowToMs - 60_000);
    const suffixSlice = collectSpeedSlice(observations, windowToMs - 60_000, windowToMs);
    const prefixAuthority = summarizeSpeedSlice(prefixSlice, freshness);
    const suffixAuthority = summarizeSpeedSlice(suffixSlice, freshness);
    const prefixMoving = sliceHasMovement(prefixAuthority);
    const suffixMoving = sliceHasMovement(suffixAuthority);

    if (!prefixMoving && suffixMoving) {
      return prefixAuthority;
    }
  }

  return summarizeSpeedSlice(fullSlice, freshness);
}

export function resolveGeometryActivityAuthorityByWindow(
  observations: Exp021CanarySpeedObservation[],
  canonicalWindowTo: Date,
): { 60_000: Exp021MaturationShadowActivityAuthority; 90_000: Exp021MaturationShadowActivityAuthority } {
  return {
    60_000: resolveGeometryActivityAuthorityFromSpeedObservations(
      observations,
      canonicalWindowTo,
      60_000,
    ),
    90_000: resolveGeometryActivityAuthorityFromSpeedObservations(
      observations,
      canonicalWindowTo,
      90_000,
    ),
  };
}
