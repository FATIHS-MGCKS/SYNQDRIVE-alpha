import type { VehicleTrip, TripSource } from '@prisma/client';
import type { DetectorFinding } from '../detectors/detector.interfaces';

// ═══════════════════════════════════════════════════════════════
//  DECISION RESULTS
// ═══════════════════════════════════════════════════════════════

export interface StartDecision {
  shouldStart: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  mode: string;
  reason: string;
  findings: DetectorFinding[];
}

export interface ContinuityDecision {
  verdict: 'ACTIVE' | 'IDLE' | 'POSSIBLE_END';
  endMode?: string;
  endConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  findings: DetectorFinding[];
}

export interface EndDecision {
  shouldEnd: boolean;
  shouldReopen: boolean;
  detectedEndAt?: Date;
  cusumSegmentStart?: Date;
  cusumSegmentEnd?: Date;
  endMode: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  findings: DetectorFinding[];
}

export interface RepairDecision {
  shouldApply: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  findings: DetectorFinding[];
}

// ═══════════════════════════════════════════════════════════════
//  MUTATION PARAMS
// ═══════════════════════════════════════════════════════════════

export interface CreateTripParams {
  vehicleId: string;
  organizationId: string | null;
  dimoSegmentId?: string;
  startTime: Date;
  startLatitude?: number | null;
  startLongitude?: number | null;
  startOdometerKm?: number | null;
  startFuelLevel?: number | null;
  startEvSoc?: number | null;
  detectionProfile?: string;
  startDetectionMode?: string;
  startConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  tripSource?: TripSource;
}

export interface FinalizeMeta {
  endTime: Date;
  endLatitude?: number | null;
  endLongitude?: number | null;
  endDetectionMode?: string;
  endConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  cusumSegmentStart?: Date | null;
  cusumSegmentEnd?: Date | null;
  durationMs?: number;
  distanceKm?: number | null;
  rawDetectionMeta?: Record<string, unknown>;
  discardReason?: string;
}

// ═══════════════════════════════════════════════════════════════
//  MID-TRIP GAP SPLIT
// ═══════════════════════════════════════════════════════════════
//
// Splits a single trip into two canonical trips at a detected mid-trip
// ignition-off window. Used by both the live FSM path (processActiveTick
// detects a stationary silence) and the retroactive reconciliation scan
// (IntraTripGap repair). See START_DETECTION_MODES.MID_TRIP_GAP_SPLIT and
// END_DETECTION_MODES.MID_TRIP_GAP_SPLIT.
export interface SplitTripAtGapParams {
  tripId: string;
  firstEndAt: Date;
  firstEndLatitude?: number | null;
  firstEndLongitude?: number | null;
  firstEndDistanceKm?: number | null;
  secondStartAt: Date;
  secondStartLatitude?: number | null;
  secondStartLongitude?: number | null;
  secondStartOdometerKm?: number | null;
  gapMs: number;
  detectionProfile?: string;
  reason: string;
  triggeredBy: 'LIVE_FSM' | 'RECONCILIATION';
}

export interface SplitTripAtGapResult {
  firstTripId: string;
  secondTripId: string;
  movedWaypoints: number;
}

// ═══════════════════════════════════════════════════════════════
//  PARTIAL BOUNDARY EXTENSION (canonical delayed-start repair)
// ═══════════════════════════════════════════════════════════════

export interface RepairTripBoundariesParams {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  providerSegmentId: string;
  providerMechanism: string;
  oldStartTime: Date;
  oldEndTime: Date;
  newStartTime: Date;
  newEndTime: Date;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  distanceKm?: number | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  source: string;
  coverageMetrics?: Record<string, unknown>;
}

export interface RepairTripBoundariesAuditParams {
  auditId: string;
  repairType: string;
  windowFrom: Date;
  windowTo: Date;
  confidence: string;
  reason: string;
  detectorEvidence: Record<string, unknown>;
}

export class BoundaryRepairConcurrentMutationError extends Error {
  constructor(tripId: string) {
    super(`Concurrent boundary repair mutation detected for trip ${tripId}`);
    this.name = 'BoundaryRepairConcurrentMutationError';
  }
}
