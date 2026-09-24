import {
  mapTierToLegacyEvidenceStrength,
} from '../battery-evidence-strength.policy';
import { BatteryEvidenceStrength, BatteryEvidenceStrengthTier } from '../battery-v2-domain';
import {
  HV_FALLBACK_DETECTION_TIER,
  type HvFallbackChargeObservation,
  type HvFallbackChargeSessionCandidate,
  type HvFallbackDetectionResult,
  type HvFallbackDetectionTier,
  type HvFallbackSessionEndReason,
} from './hv-fallback-charge-session.types';

export const HV_FALLBACK_MIN_DURATION_MS = 5 * 60 * 1000;
export const HV_FALLBACK_MIN_OBSERVATIONS = 3;
export const HV_FALLBACK_MIN_SOC_DELTA = 3;
export const HV_FALLBACK_CHARGING_PAUSE_MS = 10 * 60 * 1000;
export const HV_FALLBACK_PROVIDER_STALE_MS = 6 * 60 * 60 * 1000;
export const HV_FALLBACK_MIN_CHARGING_POWER_KW = 1;

const TIER_RANK: Record<HvFallbackDetectionTier, number> = {
  [HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK]: 5,
  [HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED]: 4,
  [HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY]: 3,
  [HV_FALLBACK_DETECTION_TIER.SOC_RISE]: 2,
  [HV_FALLBACK_DETECTION_TIER.CHARGING_POWER]: 1,
};

interface OpenFallbackSession {
  startIndex: number;
  startAt: Date;
  startSocPercent: number;
  startEnergyKwh: number | null;
  startAddedEnergyKwh: number | null;
  primaryTier: HvFallbackDetectionTier;
  corroboratingTiers: Set<HvFallbackDetectionTier>;
  observationCount: number;
  maxChargingPowerKw: number;
  pauseStartedAt: Date | null;
  lastObservedAt: Date;
  lastProviderReceivedAt: Date | null;
  lastSocPercent: number;
  lastEnergyKwh: number | null;
  lastAddedEnergyKwh: number | null;
}

function sortObservations(
  observations: HvFallbackChargeObservation[],
): HvFallbackChargeObservation[] {
  return [...observations].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
}

function isAuthoritativeTrue(value: boolean | null | undefined): value is true {
  return value === true;
}

function isAuthoritativeFalse(value: boolean | null | undefined): value is false {
  return value === false;
}

function socDelta(start: number, end: number): number {
  return Math.max(0, end - start);
}

function addedEnergyProgress(
  start: number | null,
  end: number | null,
): number | null {
  if (start == null || end == null) return null;
  const delta = end - start;
  return delta > 0 ? delta : null;
}

function detectStartTier(
  prev: HvFallbackChargeObservation,
  current: HvFallbackChargeObservation,
): { tier: HvFallbackDetectionTier; corroborating: HvFallbackDetectionTier[] } | null {
  const corroborating: HvFallbackDetectionTier[] = [];

  if (isAuthoritativeFalse(prev.isCharging) && isAuthoritativeTrue(current.isCharging)) {
    if (isAuthoritativeTrue(current.cableConnected)) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED);
    }
    if (addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh) != null) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY);
    }
    if (socDelta(prev.socPercent, current.socPercent) >= 1) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.SOC_RISE);
    }
    if (
      (current.chargingPowerKw ?? 0) >= HV_FALLBACK_MIN_CHARGING_POWER_KW
    ) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.CHARGING_POWER);
    }
    return {
      tier: HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK,
      corroborating,
    };
  }

  if (
    prev.cableConnected !== true &&
    current.cableConnected === true &&
    !isAuthoritativeTrue(current.isCharging)
  ) {
    if (addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh) != null) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY);
    }
    if (socDelta(prev.socPercent, current.socPercent) >= 1) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.SOC_RISE);
    }
    if (
      (current.chargingPowerKw ?? 0) >= HV_FALLBACK_MIN_CHARGING_POWER_KW
    ) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.CHARGING_POWER);
    }
    if (corroborating.length === 0) return null;
    return {
      tier: HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED,
      corroborating,
    };
  }

  const energyDelta = addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh);
  if (energyDelta != null && energyDelta >= 0.1) {
    if (isAuthoritativeTrue(current.cableConnected)) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED);
    }
    if (socDelta(prev.socPercent, current.socPercent) >= 1) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.SOC_RISE);
    }
    if (
      (current.chargingPowerKw ?? 0) >= HV_FALLBACK_MIN_CHARGING_POWER_KW
    ) {
      corroborating.push(HV_FALLBACK_DETECTION_TIER.CHARGING_POWER);
    }
    if (corroborating.length === 0) return null;
    return {
      tier: HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY,
      corroborating,
    };
  }

  return null;
}

function collectCorroboration(
  prev: HvFallbackChargeObservation,
  current: HvFallbackChargeObservation,
  open: OpenFallbackSession,
): void {
  if (isAuthoritativeFalse(prev.isCharging) && isAuthoritativeTrue(current.isCharging)) {
    open.corroboratingTiers.add(HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK);
  }
  if (prev.cableConnected !== true && current.cableConnected === true) {
    open.corroboratingTiers.add(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED);
  }
  if (addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh) != null) {
    open.corroboratingTiers.add(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY);
  }
  if (socDelta(prev.socPercent, current.socPercent) >= 1) {
    open.corroboratingTiers.add(HV_FALLBACK_DETECTION_TIER.SOC_RISE);
  }
  if ((current.chargingPowerKw ?? 0) >= HV_FALLBACK_MIN_CHARGING_POWER_KW) {
    open.corroboratingTiers.add(HV_FALLBACK_DETECTION_TIER.CHARGING_POWER);
  }
}

function resolveEvidenceStrength(
  primaryTier: HvFallbackDetectionTier,
  corroborating: HvFallbackDetectionTier[],
): BatteryEvidenceStrength {
  const tiers = new Set([primaryTier, ...corroborating]);
  const hasStrongFlank =
    tiers.has(HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK) &&
    (tiers.has(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED) ||
      tiers.has(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY));
  const hasModerateFlank =
    tiers.has(HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK) ||
    tiers.has(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED);

  const evidenceTier = hasStrongFlank || hasModerateFlank
    ? BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL
    : BatteryEvidenceStrengthTier.PROXY;
  return mapTierToLegacyEvidenceStrength(evidenceTier);
}

function isProviderStale(
  lastObservedAt: Date,
  lastProviderReceivedAt: Date | null,
  now: Date,
): boolean {
  const anchor = lastProviderReceivedAt ?? lastObservedAt;
  return now.getTime() - anchor.getTime() > HV_FALLBACK_PROVIDER_STALE_MS;
}

function hasMinimumSignalGroups(
  primaryTier: HvFallbackDetectionTier,
  corroborating: HvFallbackDetectionTier[],
): boolean {
  const tiers = new Set([primaryTier, ...corroborating]);
  if (tiers.has(HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK)) return true;
  if (tiers.has(HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED) && tiers.size >= 2) {
    return true;
  }
  if (
    tiers.has(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY) &&
    tiers.size >= 2 &&
    !(
      tiers.size === 2 &&
      tiers.has(HV_FALLBACK_DETECTION_TIER.SOC_RISE) &&
      tiers.has(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY)
    )
  ) {
    return true;
  }
  return false;
}

function isImpossibleSoc(value: number): boolean {
  return !Number.isFinite(value) || value < 0 || value > 100;
}

function rejectObservationPair(
  prev: HvFallbackChargeObservation,
  current: HvFallbackChargeObservation,
): boolean {
  if (isImpossibleSoc(prev.socPercent) || isImpossibleSoc(current.socPercent)) {
    return true;
  }
  const gapMs = current.recordedAt.getTime() - prev.recordedAt.getTime();
  if (gapMs < 0) return true;
  if (
    isAuthoritativeTrue(current.isCharging) &&
    prev.addedEnergyKwh != null &&
    current.addedEnergyKwh != null &&
    current.addedEnergyKwh + 0.05 < prev.addedEnergyKwh
  ) {
    return true;
  }
  if (
    socDelta(prev.socPercent, current.socPercent) >= 8 &&
    !isAuthoritativeTrue(current.isCharging) &&
    !isAuthoritativeTrue(current.cableConnected) &&
    addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh) == null &&
    (current.chargingPowerKw ?? 0) < HV_FALLBACK_MIN_CHARGING_POWER_KW
  ) {
    return true;
  }
  return false;
}

function finalizeCandidate(
  open: OpenFallbackSession,
  endAt: Date | null,
  endReason: HvFallbackSessionEndReason,
  now: Date,
): HvFallbackChargeSessionCandidate | null {
  const durationMs = (endAt ?? now).getTime() - open.startAt.getTime();
  const corroborating = [...open.corroboratingTiers].filter(
    (tier) => tier !== open.primaryTier,
  );

  if (
    open.observationCount < HV_FALLBACK_MIN_OBSERVATIONS ||
    durationMs < HV_FALLBACK_MIN_DURATION_MS ||
    !hasMinimumSignalGroups(open.primaryTier, corroborating)
  ) {
    return null;
  }

  const deltaSoc = socDelta(open.startSocPercent, open.lastSocPercent);
  if (
    open.primaryTier === HV_FALLBACK_DETECTION_TIER.SOC_RISE &&
    corroborating.length === 0
  ) {
    return null;
  }
  if (deltaSoc < HV_FALLBACK_MIN_SOC_DELTA && corroborating.length === 0) {
    return null;
  }

  const energyAdded = addedEnergyProgress(
    open.startAddedEnergyKwh,
    open.lastAddedEnergyKwh,
  );

  return {
    startAt: open.startAt,
    endAt,
    startSocPercent: open.startSocPercent,
    endSocPercent: endAt ? open.lastSocPercent : null,
    startEnergyKwh: open.startEnergyKwh,
    endEnergyKwh: endAt ? open.lastEnergyKwh : null,
    energyAddedKwh: energyAdded,
    deltaSocPercent: endAt ? deltaSoc : null,
    isOngoing: endAt == null,
    primaryTier: open.primaryTier,
    corroboratingTiers: corroborating,
    evidenceStrength: resolveEvidenceStrength(open.primaryTier, corroborating),
    observationCount: open.observationCount,
    endReason,
    providerStale: isProviderStale(
      open.lastObservedAt,
      open.lastProviderReceivedAt,
      now,
    ),
    maxChargingPowerKw:
      open.maxChargingPowerKw > 0 ? open.maxChargingPowerKw : null,
  };
}

/**
 * Detect fallback HV charge sessions from poll observations when DIMO recharge
 * segments are unavailable. Recharge segments always win when present later.
 */
export function detectFallbackChargeSessions(
  observations: HvFallbackChargeObservation[],
  now: Date = new Date(),
): HvFallbackDetectionResult {
  const sorted = sortObservations(observations);
  const sessions: HvFallbackChargeSessionCandidate[] = [];
  let rejectedFalsePositives = 0;
  let open: OpenFallbackSession | null = null;

  const closeOpen = (
    endAt: Date,
    endReason: HvFallbackSessionEndReason,
  ): void => {
    if (!open) return;
    const candidate = finalizeCandidate(open, endAt, endReason, now);
    if (candidate) {
      sessions.push(candidate);
    } else {
      rejectedFalsePositives += 1;
    }
    open = null;
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];

    if (rejectObservationPair(prev, current)) {
      rejectedFalsePositives += 1;
      open = null;
      continue;
    }

    if (!open) {
      const start = detectStartTier(prev, current);
      if (!start) continue;

      open = {
        startIndex: i - 1,
        startAt: prev.recordedAt,
        startSocPercent: prev.socPercent,
        startEnergyKwh: prev.energyKwh,
        startAddedEnergyKwh: prev.addedEnergyKwh,
        primaryTier: start.tier,
        corroboratingTiers: new Set(start.corroborating),
        observationCount: 2,
        maxChargingPowerKw: current.chargingPowerKw ?? 0,
        pauseStartedAt: null,
        lastObservedAt: current.recordedAt,
        lastProviderReceivedAt: current.providerReceivedAt,
        lastSocPercent: current.socPercent,
        lastEnergyKwh: current.energyKwh,
        lastAddedEnergyKwh: current.addedEnergyKwh,
      };
      continue;
    }

    open.observationCount += 1;
    open.lastObservedAt = current.recordedAt;
    open.lastProviderReceivedAt = current.providerReceivedAt;
    open.lastSocPercent = current.socPercent;
    open.lastEnergyKwh = current.energyKwh;
    open.lastAddedEnergyKwh = current.addedEnergyKwh;
    open.maxChargingPowerKw = Math.max(
      open.maxChargingPowerKw,
      current.chargingPowerKw ?? 0,
    );
    collectCorroboration(prev, current, open);

    const chargingStopped =
      isAuthoritativeTrue(prev.isCharging) && isAuthoritativeFalse(current.isCharging);
    const cableDisconnected =
      prev.cableConnected === true && current.cableConnected === false;
    const chargingResumed =
      isAuthoritativeFalse(prev.isCharging) && isAuthoritativeTrue(current.isCharging);

    if (chargingStopped) {
      if (current.cableConnected === true) {
        open.pauseStartedAt = current.recordedAt;
      } else {
        closeOpen(current.recordedAt, 'CHARGING_OFF');
        continue;
      }
    }

    if (open.pauseStartedAt) {
      if (chargingResumed) {
        open.pauseStartedAt = null;
      } else {
        const pauseMs =
          current.recordedAt.getTime() - open.pauseStartedAt.getTime();
        const socStillRising =
          socDelta(prev.socPercent, current.socPercent) >= 0.5;
        const energyStillRising =
          addedEnergyProgress(prev.addedEnergyKwh, current.addedEnergyKwh) !=
          null;

        if (
          pauseMs >= HV_FALLBACK_CHARGING_PAUSE_MS ||
          cableDisconnected ||
          (!socStillRising && !energyStillRising && !isAuthoritativeTrue(current.isCharging))
        ) {
          closeOpen(
            open.pauseStartedAt,
            cableDisconnected ? 'CABLE_DISCONNECTED' : 'CHARGING_PAUSE_TIMEOUT',
          );
        }
      }
    } else if (cableDisconnected && !isAuthoritativeTrue(current.isCharging)) {
      closeOpen(current.recordedAt, 'CABLE_DISCONNECTED');
    }
  }

  if (open) {
    const candidate = finalizeCandidate(open, null, 'ONGOING', now);
    if (candidate) {
      if (candidate.providerStale) {
        sessions.push({
          ...candidate,
          endAt: open.lastObservedAt,
          endSocPercent: open.lastSocPercent,
          endEnergyKwh: open.lastEnergyKwh,
          deltaSocPercent: socDelta(open.startSocPercent, open.lastSocPercent),
          isOngoing: false,
          endReason: 'STALE_PROVIDER',
        });
      } else {
        sessions.push(candidate);
      }
    } else {
      rejectedFalsePositives += 1;
    }
  }

  return { sessions, rejectedFalsePositives };
}

export function buildFallbackSegmentFingerprint(
  vehicleId: string,
  startAt: Date,
): string {
  return `poll-charge:${vehicleId}:${startAt.getTime()}`;
}

export function isDimoSourcePreferredOverFallback(
  existingSource: string,
  incomingSource: string,
): boolean {
  return (
    existingSource === 'TELEMETRY_POLL_FALLBACK' &&
    incomingSource === 'DIMO_RECHARGE_SEGMENT'
  );
}

export function sessionsOverlap(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null,
  evaluatedAt: Date,
  toleranceMs = 15 * 60 * 1000,
): boolean {
  const openEndMs = evaluatedAt.getTime();
  const aEndMs = (aEnd ?? new Date(openEndMs)).getTime() + toleranceMs;
  const bEndMs = (bEnd ?? new Date(openEndMs)).getTime() + toleranceMs;
  const aStartMs = aStart.getTime() - toleranceMs;
  const bStartMs = bStart.getTime() - toleranceMs;
  return aStartMs <= bEndMs && bStartMs <= aEndMs;
}
