import type { BatteryEvidenceStrength } from '../battery-v2-domain';

export const HV_FALLBACK_DETECTION_TIER = {
  IS_CHARGING_FLANK: 'IS_CHARGING_FLANK',
  CABLE_CONNECTED: 'CABLE_CONNECTED',
  ADDED_ENERGY: 'ADDED_ENERGY',
  SOC_RISE: 'SOC_RISE',
  CHARGING_POWER: 'CHARGING_POWER',
} as const;

export type HvFallbackDetectionTier =
  (typeof HV_FALLBACK_DETECTION_TIER)[keyof typeof HV_FALLBACK_DETECTION_TIER];

export interface HvFallbackChargeObservation {
  recordedAt: Date;
  providerReceivedAt: Date | null;
  socPercent: number;
  energyKwh: number | null;
  isCharging: boolean;
  cableConnected: boolean | null;
  chargingPowerKw: number | null;
  addedEnergyKwh: number | null;
}

export type HvFallbackSessionEndReason =
  | 'CHARGING_OFF'
  | 'CABLE_DISCONNECTED'
  | 'CHARGING_PAUSE_TIMEOUT'
  | 'STALE_PROVIDER'
  | 'ONGOING';

export interface HvFallbackChargeSessionCandidate {
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  isOngoing: boolean;
  primaryTier: HvFallbackDetectionTier;
  corroboratingTiers: HvFallbackDetectionTier[];
  evidenceStrength: BatteryEvidenceStrength;
  observationCount: number;
  endReason: HvFallbackSessionEndReason;
  providerStale: boolean;
  maxChargingPowerKw: number | null;
}

export interface HvFallbackDetectionResult {
  sessions: HvFallbackChargeSessionCandidate[];
  rejectedFalsePositives: number;
}
