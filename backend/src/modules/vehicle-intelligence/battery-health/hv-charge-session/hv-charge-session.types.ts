import type { BatteryMeasurementQuality, HvChargeSession } from '@prisma/client';

export const HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE = 'DIMO_RECHARGE_SEGMENT' as const;

export type HvChargeSessionChangeKind =
  | 'created'
  | 'ongoing_updated'
  | 'completed'
  | 'provider_refresh'
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
  source: typeof HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE;
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
