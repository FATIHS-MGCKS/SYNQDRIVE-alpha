import type { BatteryCapabilityStatus, BatteryMeasurementType } from '../battery-v2-domain';

export const BatteryCapabilityPreflightStatus = {
  AVAILABLE_WITH_DATA: 'AVAILABLE_WITH_DATA',
  AVAILABLE_BUT_NULL: 'AVAILABLE_BUT_NULL',
  NOT_LISTED: 'NOT_LISTED',
  STALE: 'STALE',
  QUERY_ERROR: 'QUERY_ERROR',
} as const;

export type BatteryCapabilityPreflightStatus =
  (typeof BatteryCapabilityPreflightStatus)[keyof typeof BatteryCapabilityPreflightStatus];

export interface BatteryCapabilityPreflightInput {
  availableSignals: string[] | null;
  signalsLatest: Record<string, unknown> | null;
  queryError?: string | null;
  checkedAt?: Date;
  staleThresholdMs?: number;
}

export interface RechargeSegmentsProbeResult {
  segmentCount: number;
  queryError?: string | null;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
}

export interface AssessedBatteryCapabilitySignal {
  signalKey: string;
  signalName: string;
  provider: string;
  preflightStatus: BatteryCapabilityPreflightStatus;
  persistenceStatus: BatteryCapabilityStatus;
  measurementType: BatteryMeasurementType | null;
  lastSeenAt: Date | null;
  firstSeenAt: Date | null;
  sourceTimestamp: Date | null;
  lastValue: number | null;
  metadata: Record<string, unknown>;
}

export interface BatteryCapabilityPreflightResult {
  organizationId: string;
  vehicleId: string;
  provider: string;
  checkedAt: Date;
  signals: AssessedBatteryCapabilitySignal[];
  queryError: string | null;
}
