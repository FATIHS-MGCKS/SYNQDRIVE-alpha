import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import {
  matchErdPhysicalEpisode,
  ERD_PHYSICAL_MATCH_RESULT,
} from './erd-physical-episode-matcher';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { sessionsOverlap } from './hv-fallback-charge-session.policy';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import type { HvChargeSessionRow } from './hv-charge-session.types';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
} from './hv-charge-session.types';

export type HvFallbackActivationSkipReason =
  | 'ice_only'
  | 'insufficient_telemetry_capability'
  | 'native_episode_covers_candidate'
  | 'native_match_ambiguous';

const ICE_FUEL_TYPES = new Set(['GASOLINE', 'DIESEL', 'PETROL', 'GAS', 'LPG', 'CNG']);

export function isErdFallbackEligibleFuelType(
  fuelType: string | null | undefined,
): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  if (ICE_FUEL_TYPES.has(normalized)) return false;
  return (
    normalized === 'ELECTRIC' ||
    normalized === 'HYBRID' ||
    normalized === 'PLUGIN_HYBRID' ||
    normalized === 'PHEV' ||
    normalized === 'BEV'
  );
}

export function hasFallbackTelemetryCapabilities(profile: HvMethodProfile): boolean {
  return (
    profile.socAvailable &&
    (profile.isChargingAvailable ||
      profile.chargingCableConnectedAvailable ||
      profile.addedEnergyAvailable ||
      profile.chargingPowerAvailable)
  );
}

export function shouldAttemptFallbackDetection(input: {
  profile: HvMethodProfile;
  fuelType: string | null | undefined;
}): { allowed: boolean; reason?: HvFallbackActivationSkipReason } {
  if (!isErdFallbackEligibleFuelType(input.fuelType)) {
    return { allowed: false, reason: 'ice_only' };
  }
  if (!hasFallbackTelemetryCapabilities(input.profile)) {
    return { allowed: false, reason: 'insufficient_telemetry_capability' };
  }
  return { allowed: true };
}

function nativeRowsFromSessions(rows: HvChargeSessionRow[]): HvChargeSessionRow[] {
  return rows.filter((row) => row.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE);
}

function nativeSideFromRow(row: HvChargeSessionRow) {
  return {
    startAt: row.startAt,
    endAt: row.endAt,
    socMin: row.startSocPercent,
    socMax: row.endSocPercent,
    energyMin: row.startEnergyKwh,
    energyMax: row.endEnergyKwh,
    addedEnergyDelta: row.energyAddedKwh,
    ongoing: row.isOngoing,
  };
}

/**
 * Native-first: allow provisional fallback only when no native episode already
 * covers this candidate (SAME). Ambiguous native overlap fails closed (no new fallback).
 */
export function shouldPersistFallbackCandidate(input: {
  vehicleId: string;
  candidate: HvFallbackChargeSessionCandidate;
  nativeSessions: HvChargeSessionRow[];
  evaluatedAt: Date;
}): { allowed: boolean; reason?: HvFallbackActivationSkipReason } {
  const natives = nativeRowsFromSessions(input.nativeSessions);
  const fallbackSide = {
    startAt: input.candidate.startAt,
    endAt: input.candidate.endAt,
    startSocPercent: input.candidate.startSocPercent,
    endSocPercent: input.candidate.endSocPercent,
    startEnergyKwh: input.candidate.startEnergyKwh,
    endEnergyKwh: input.candidate.endEnergyKwh,
    energyAddedKwh: input.candidate.energyAddedKwh,
    isOngoing: input.candidate.isOngoing,
  };

  let sameCount = 0;
  let ambiguousOverlap = false;

  for (const nativeRow of natives) {
    const native = nativeSideFromRow(nativeRow);
    const overlap = sessionsOverlap(
      fallbackSide.startAt,
      fallbackSide.endAt,
      native.startAt,
      native.endAt,
      input.evaluatedAt,
    );
    if (!overlap) continue;

    const match = matchErdPhysicalEpisode({
      vehicleId: input.vehicleId,
      fallback: fallbackSide,
      native,
      evaluatedAt: input.evaluatedAt,
    });

    if (match.result === ERD_PHYSICAL_MATCH_RESULT.SAME) {
      sameCount += 1;
    } else if (match.result === ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS) {
      ambiguousOverlap = true;
    }
  }

  if (sameCount >= 1) {
    return { allowed: false, reason: 'native_episode_covers_candidate' };
  }
  if (ambiguousOverlap) {
    return { allowed: false, reason: 'native_match_ambiguous' };
  }
  return { allowed: true };
}

export function nativeEpisodePresentForSegment(input: {
  segment: NormalizedDimoRechargeSegment;
  nativeSessions: HvChargeSessionRow[];
}): boolean {
  return nativeRowsFromSessions(input.nativeSessions).some(
    (row) => row.segmentFingerprint === input.segment.fingerprint,
  );
}

export function describeNativeFirstFallbackPolicy(): string {
  return 'native_first_episode_not_capability; provisional fallback when telemetry qualifies and no SAME native episode';
}
