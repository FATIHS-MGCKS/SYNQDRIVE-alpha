/**
 * Shared types for the offline trip-detection replay harness.
 *
 * This directory is analysis-only tooling. Nothing here is imported by the
 * NestJS application, and nothing here writes to any datastore.
 */

export type SignalName = 'ignition' | 'motion';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type DetectionProfile = 'ICE' | 'EV' | 'HYBRID' | 'UNKNOWN';

export interface StateChange {
  vehicleId: string;
  signal: SignalName;
  changedAt: number;
  newValue: number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  start: number;
  end: number | null;
  status: string;
  source: string;
  distanceKm: number | null;
  dimoSegmentId: string | null;
  isRepaired: boolean;
  createdAt: number;
}

export interface MinuteAgg {
  vehicleId: string;
  minute: number;
  maxSpeed: number | null;
  avgSpeed: number | null;
  samples: number;
  odoMax: number | null;
  odoMin: number | null;
}

export interface VehicleRow {
  id: string;
  plate: string;
  fuelType: string;
  profile: DetectionProfile;
  dimoTokenId: string;
  organizationId: string;
  hardwareType: string;
}

export interface RpmCandidate {
  id: string;
  vehicleId: string;
  observedAt: number;
  observedValue: number;
  tripId: string | null;
  status: string;
}

export interface Interval {
  start: number;
  end: number;
}

/** An evidence-backed drive reconstructed from raw signal transitions. */
export interface GroundTruthDrive extends Interval {
  vehicleId: string;
  /** Which signals contributed to the coalesced envelope. */
  sources: SignalName[];
  /** Number of raw ON intervals coalesced into this envelope. */
  fragmentCount: number;
  maxSpeedKmh: number | null;
  telemetrySamples: number;
  movementProven: boolean;
}

/** A repair candidate as produced by either the baseline or the proposed detector. */
export interface Candidate extends Interval {
  vehicleId: string;
  source: 'CLICKHOUSE_IGNITION' | 'CLICKHOUSE_MOTION' | 'FUSED';
  confidence: Confidence;
  fragmentCount: number;
  evidence: Record<string, unknown>;
}

export interface CoverageResult {
  movementSeconds: number;
  coverageSeconds: number;
  coverageRatio: number;
  missingSeconds: number;
  prefixMissingSeconds: number;
  suffixMissingSeconds: number;
  interiorMissingSeconds: number;
  longestUncoveredSpanSeconds: number;
  canonicalTripCount: number;
  uncovered: Interval[];
}

export const SHAPE = {
  FULL_MISS: 'FULL_MISS',
  PREFIX_TRUNCATION: 'PREFIX_TRUNCATION',
  SUFFIX_TRUNCATION: 'SUFFIX_TRUNCATION',
  INTERIOR_GAP: 'INTERIOR_GAP',
  MULTI_GAP: 'MULTI_GAP',
  HEALTHY: 'HEALTHY',
} as const;

export type GapShape = (typeof SHAPE)[keyof typeof SHAPE];
