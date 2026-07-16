import type { BatteryMeasurementQuality, HvChargeSession } from '@prisma/client';
import type { BatteryEvidenceStrength } from '../battery-v2-domain';
import type { HvFallbackDetectionTier } from './hv-fallback-charge-session.types';

export const HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE = 'DIMO_RECHARGE_SEGMENT' as const;
export const HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK =
  'TELEMETRY_POLL_FALLBACK' as const;

export type HvChargeSessionSource =
  | typeof HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE
  | typeof HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK;

export type HvChargeSessionChangeKind =
  | 'created'
  | 'ongoing_updated'
  | 'completed'
  | 'provider_refresh'
  | 'superseded'
  | 'no_op';

export interface HvChargeSessionMetadata {
  providerSegmentFingerprint: string;
  durationSeconds: number | null;
  lastReconciledAt: string;
  reconcileVersion: number;
  isChargingStart?: boolean | null;
  isChargingEnd?: boolean | null;
  cableConnectedStart?: boolean | null;
  cableConnectedEnd?: boolean | null;
  startedBeforeRange?: boolean;
  odometerStartKm?: number | null;
  odometerEndKm?: number | null;
  dimoTokenId?: number;
  providerSegmentId?: string | null;
  fallbackPrimaryTier?: HvFallbackDetectionTier | null;
  fallbackCorroboratingTiers?: HvFallbackDetectionTier[];
  fallbackEvidenceStrength?: BatteryEvidenceStrength | null;
  fallbackEndReason?: string | null;
  supersededBySegmentFingerprint?: string | null;
  supersededAt?: string | null;
  changeHistory?: Array<{
    at: string;
    kind: HvChargeSessionChangeKind;
  }>;
}

export interface HvChargeSessionDraft {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  dimoSegmentId: string | null;
  source: HvChargeSessionSource;
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  isOngoing: boolean;
  quality: BatteryMeasurementQuality | null;
  idempotencyKey: string;
  providerObservedAt: Date | null;
  metadata: HvChargeSessionMetadata;
}

export interface HvChargeSessionPersistResult {
  session: HvChargeSession;
  created: boolean;
  changed: boolean;
  changeKind: HvChargeSessionChangeKind;
}

export type HvChargeSessionRow = Pick<
  HvChargeSession,
  | 'id'
  | 'organizationId'
  | 'vehicleId'
  | 'segmentFingerprint'
  | 'dimoSegmentId'
  | 'source'
  | 'startAt'
  | 'endAt'
  | 'startSocPercent'
  | 'endSocPercent'
  | 'startEnergyKwh'
  | 'endEnergyKwh'
  | 'energyAddedKwh'
  | 'deltaSocPercent'
  | 'isOngoing'
  | 'quality'
  | 'idempotencyKey'
  | 'providerObservedAt'
  | 'metadata'
>;
