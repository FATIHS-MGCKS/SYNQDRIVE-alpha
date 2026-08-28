import type { EnergyEventConfidence } from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';

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
  | 'DIMO_ACCESS_FAILED';

export interface EnergyRecoveryVehicleInventoryRow {
  vehicleId: string | null;
  label: string;
  tokenId: number;
  provider: string;
  powertrain: 'ICE' | 'EV' | 'UNKNOWN';
  dimoAccessAvailable: boolean;
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
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
  startLatitude: number | null;
  startLongitude: number | null;
  confidence: EnergyEventConfidence;
  detectorConfigVersion: string;
  manualReviewReasons: string[];
  existingRowId: string | null;
  windowFrom: string;
  windowTo: string;
}

export interface EnergyRecoveryDryRunReport {
  generatedAt: string;
  mainSha: string;
  detectorConfigVersion: string;
  refuelDetectorConfig: { minIncreasePercent: number };
  rechargeDetectorConfig: 'default';
  outageStart: string;
  recoveryCutoff: string;
  windowSizeHours: number;
  windowSemantics: string;
  vehicles: EnergyRecoveryVehicleInventoryRow[];
  dimoRequestCount: number;
  refuelDetections: number;
  rechargeDetections: number;
  summary: Record<EnergyRecoveryClassification, number>;
  candidates: EnergyRecoveryCandidate[];
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
    windowsPerVehicle: number;
    mechanismsPerWindow: number;
    expectedDimoRequests: number;
    worstCaseWithRetries: number;
    proposedConcurrency: number;
    interRequestDelayMs: number;
    estimatedRuntimeMinutes: number;
  };
  acceptance: {
    ksMx2024: {
      found: boolean;
      classification: EnergyRecoveryClassification | 'NOT_FOUND';
      segmentStart: string | null;
    };
    teslaRecharge: {
      detectedSessions: number;
      wouldCreate: number;
      alreadyIdentical: number;
      manualReview: number;
    };
  };
  dbWritesPerformed: false;
  backfillGate: string;
  manualReviewCount: number;
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
    startTime: Date;
    endTime: Date;
    fuelDeltaLiters: number | null;
    fuelDeltaPercent: number | null;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    confidence: EnergyEventConfidence;
  }>;
  detectorConfigVersion: string;
}
