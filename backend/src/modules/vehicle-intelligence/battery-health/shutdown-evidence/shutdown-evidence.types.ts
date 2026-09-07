import type {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
} from '@prisma/client';
import type { ShutdownTimestampSource } from './shutdown-evidence.constants';

export interface ShutdownFieldProvenance {
  value: unknown;
  observedAt: string | null;
  timestampSource: ShutdownTimestampSource;
  ageMsAtReference: number | null;
}

export interface ShutdownEvidenceFieldBundle {
  voltage: number | null;
  voltageObservedAt: Date | null;
  voltageTimestampSource: ShutdownTimestampSource;

  speedKmh: number | null;
  speedObservedAt: Date | null;
  speedTimestampSource: ShutdownTimestampSource;

  ignitionOn: boolean | null;
  ignitionObservedAt: Date | null;
  ignitionTimestampSource: ShutdownTimestampSource;

  engineRunning: boolean | null;
  engineRunningObservedAt: Date | null;
  engineRunningTimestampSource: ShutdownTimestampSource;

  isLvCharging: boolean | null;
  isHvCharging: boolean | null;
  chargingContextObservedAt: Date | null;
  chargingContextTimestampSource: ShutdownTimestampSource;

  activeTrip: boolean | null;
  activeTripObservedAt: Date | null;
  activeTripTimestampSource: ShutdownTimestampSource;

  vehicleOnline: boolean | null;
  vehicleOnlineObservedAt: Date | null;

  providerLastSeenAt: Date | null;
}

export interface ShutdownEvidenceClassificationInput {
  fields: ShutdownEvidenceFieldBundle;
  tripEndedAt: Date | null;
  tripStartedAt: Date | null;
  relativeToTripEndMs: number | null;
  referenceAt: Date;
}

export interface ShutdownEvidenceClassificationResult {
  evidenceClass: BatteryShutdownEvidenceClass;
  confidenceClass: BatteryShutdownEvidenceConfidenceClass;
  stateCompleteness: BatteryShutdownStateCompleteness;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  stateTimestampSkewMs: number | null;
  maxFieldTimestampSkewMs: number | null;
}

export interface TripShutdownContextSnapshotField {
  value: unknown;
  observedAt: string | null;
  timestampSource: ShutdownTimestampSource;
  ageMsAtTripEnd: number | null;
}

export interface TripShutdownContextSnapshot {
  tripId: string;
  vehicleId: string;
  tripEndedAt: string;
  capturedAt: string;
  vlsSharedSnapshotTimestamp: {
    observedAt: string | null;
    timestampSource: ShutdownTimestampSource;
    sharedFields: string[];
  };
  fields: {
    voltage: TripShutdownContextSnapshotField;
    speedKmh: TripShutdownContextSnapshotField;
    ignitionOn: TripShutdownContextSnapshotField;
    engineRunning: TripShutdownContextSnapshotField;
    chargingContext: TripShutdownContextSnapshotField;
    vehicleOnline: TripShutdownContextSnapshotField;
  };
  atomicClaim: false;
}

export type ShutdownEvidenceCaptureOutcome =
  | 'created'
  | 'duplicate'
  | 'skipped_flag_off'
  | 'skipped_no_voltage'
  | 'skipped_not_ice'
  | 'skipped_outside_window'
  | 'skipped_no_trip';

export type TripShutdownContextCaptureOutcome =
  | 'created'
  | 'duplicate'
  | 'skipped_flag_off'
  | 'skipped_not_ice';
