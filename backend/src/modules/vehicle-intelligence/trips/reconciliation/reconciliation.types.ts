import type { DetectorFinding } from '../detectors/detector.interfaces';

// ═══════════════════════════════════════════════════════════════
//  RECONCILIATION TIERS
// ═══════════════════════════════════════════════════════════════

export type ReconciliationTier = 'fast' | 'warm' | 'cold';

// ═══════════════════════════════════════════════════════════════
//  REPAIR TYPES
// ═══════════════════════════════════════════════════════════════

export const REPAIR_TYPES = {
  MISSING_TRIP: 'MISSING_TRIP',
  MISSING_END: 'MISSING_END',
  STALE_ONGOING: 'STALE_ONGOING',
  SUSPICIOUS_LONG_OPEN: 'SUSPICIOUS_LONG_OPEN',
  DUPLICATE: 'DUPLICATE',
  SPLIT_MERGE: 'SPLIT_MERGE',
  // Retroactive detection that a finalized trip actually contained a
  // mid-trip ignition-off window (vehicle parked with engine off for a few
  // minutes, then restarted). Reconciliation repairs split these into two
  // canonical trips. Complements live FSM detection in processActiveTick.
  INTRA_TRIP_GAP_SPLIT: 'INTRA_TRIP_GAP_SPLIT',
} as const;

export type RepairType = (typeof REPAIR_TYPES)[keyof typeof REPAIR_TYPES];

export const REPAIR_STATUS = {
  PROPOSED: 'PROPOSED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type RepairStatus = (typeof REPAIR_STATUS)[keyof typeof REPAIR_STATUS];

// ═══════════════════════════════════════════════════════════════
//  RECONCILIATION RESULT
// ═══════════════════════════════════════════════════════════════

export interface ReconciliationResult {
  vehicleId: string;
  tier: ReconciliationTier;
  windowFrom: Date;
  windowTo: Date;
  repairsProposed: number;
  repairsApplied: number;
  repairsRejected: number;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
//  TRIP ANOMALY
// ═══════════════════════════════════════════════════════════════

export interface TripAnomaly {
  vehicleId: string;
  tripId?: string;
  type: RepairType;
  windowFrom: Date;
  windowTo: Date;
  detectorFindings?: DetectorFinding[];
}
