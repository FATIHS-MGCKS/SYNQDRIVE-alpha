import type { EnergyEventConfidence } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import type { DbComparisonStatus } from './energy-events-recovery-read.repository';

export type EnergyRecoveryClassification =
  | 'WOULD_CREATE'
  | 'WOULD_UPDATE'
  | 'ALREADY_IDENTICAL'
  | 'WOULD_SKIP_NOT_PERSISTABLE'
  | 'WOULD_REPLACE_LEGACY_SUBSEGMENTS'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'FETCH_FAILED';

export type EnergyVehicleEnergyClass =
  | 'REFUEL_CANDIDATE'
  | 'RECHARGE_CANDIDATE'
  | 'BOTH'
  | 'NO_ENERGY_SIGNAL'
  | 'DIMO_ACCESS_FAILED'
  | 'CAPABILITY_UNKNOWN';

export type ManualReviewDisposition =
  | 'APPROVE_FOR_BACKFILL'
  | 'EXCLUDE_FROM_BACKFILL'
  | 'NEEDS_FURTHER_EVIDENCE';

export interface EnergyRecoveryVehicleInventoryRow {
  vehicleId: string | null;
  label: string;
  tokenId: number;
  provider: string;
  powertrain: 'ICE' | 'EV' | 'UNKNOWN';
  dimoAccessAvailable: boolean;
  dbVehicleMapped: boolean;
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
  capabilityLookupStatus: 'ok' | 'failed';
  existingEventCountInWindow: number;
  energyClass: EnergyVehicleEnergyClass;
}

export interface EnergyRecoveryCandidate {
  classification: EnergyRecoveryClassification;
  mechanism: 'refuel' | 'recharge';
  vehicleId: string;
  tokenId: number;
  label: string;
  dimoSegmentId: string;
  coalescedFromSegmentIds: string[];
  startTime: string;
  endTime: string;
  durationSeconds: number;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm?: number | null;
  odometerEndKm?: number | null;
  confidence: EnergyEventConfidence;
  detectorConfigVersion: string;
  manualReviewReasons: string[];
  overlapRelation?: string | null;
  existingDbRelation?: string | null;
  existingRowId: string | null;
  windowFrom: string;
  windowTo: string;
  startedBeforeRange?: boolean;
}

export interface ManualReviewEntry {
  vehicle: string;
  tokenId: number;
  mechanism: 'refuel' | 'recharge';
  startTime: string;
  endTime: string;
  durationSeconds: number;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerDeltaKm: number | null;
  confidence: EnergyEventConfidence;
  plausibilityReasons: string[];
  telemetryEvidenceNotes: string[];
  overlapRelation: string | null;
  existingDbRelation: string | null;
  existingRowId: string | null;
  dimoSegmentId: string;
  recommendation: ManualReviewDisposition;
}

export interface DimoRequestAccounting {
  telemetryGraphqlRequests: number;
  tokenExchangeRequests: number;
  mechanismRequests: number;
  retries: number;
}

export interface EnergyRecoveryDryRunReport {
  generatedAt: string;
  codeShaUnderTest: string;
  baseMainSha: string;
  detectorConfigVersion: string;
  refuelDetectorConfig: { minIncreasePercent: number };
  rechargeDetectorConfig: 'default';
  outageStart: string;
  recoveryCutoff: string;
  windowSizeHours: number;
  windowSizesHours: number[];
  windowSemantics: string;
  mode: 'full' | 'quick';
  dbComparisonEnabled: boolean;
  dbComparisonStatus: DbComparisonStatus;
  dbVehicleMappingFailures: number;
  vehicles: EnergyRecoveryVehicleInventoryRow[];
  requestAccounting: DimoRequestAccounting;
  refuelDetections: number;
  rechargeDetections: number;
  deduplicatedCandidateCount: number;
  summary: Record<EnergyRecoveryClassification, number>;
  candidates: EnergyRecoveryCandidate[];
  manualReviewReport: ManualReviewEntry[];
  legacySubsegmentsWouldReplace: string[];
  fetchFailures: Array<{
    vehicleId: string;
    tokenId: number;
    mechanism: string;
    windowFrom: string;
    windowTo: string;
    httpStatus?: number;
    message?: string;
  }>;
  trafficBudget: {
    eligibleVehicles: number;
    inaccessibleVehicles: number;
    capabilityUnknownVehicles: number;
    windowsPerVehicle: number;
    mechanismsPerWindowAverage: number;
    expectedTelemetryGraphqlRequests: number;
    worstCaseWithRetries: number;
    proposedConcurrency: number;
    interRequestDelayMs: number;
    estimatedRuntimeMinutes: number;
  };
  acceptance: {
    canonicalRefuel: {
      found: boolean;
      classification: EnergyRecoveryClassification | 'NOT_FOUND';
      segmentStart: string | null;
    };
    canonicalEvRecharge: {
      detectedSessions: number;
      wouldCreate: number;
      alreadyIdentical: number;
      manualReview: number;
    };
  };
  dbWritesPerformed: false;
  backfillGate: string;
  manualReviewCount: number;
  gateBlockers: string[];
}

export interface EnergyRecoverySimulateInput {
  vehicleId: string;
  label: string;
  tokenId: number;
  windowFrom: Date;
  windowTo: Date;
  segments: DimoEnergyEventSegment[];
  mechanismOutcomes: EnergyMechanismFetchOutcome[];
  existingEvents: Array<{
    id: string;
    dimoSegmentId: string;
    kind: string;
    detectionMechanism: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    startLatitude: number | null;
    startLongitude: number | null;
    endLatitude: number | null;
    endLongitude: number | null;
    fuelDeltaLiters: number | null;
    fuelDeltaPercent: number | null;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    odometerStartKm: number | null;
    odometerEndKm: number | null;
    confidence: EnergyEventConfidence;
    rawDetectionMeta: unknown;
  }>;
  detectorConfigVersion: string;
}
