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
  /** Extend an existing canonical trip when provider truth proves earlier/later boundaries. */
  PARTIAL_TRIP_BOUNDARY_EXTENSION: 'PARTIAL_TRIP_BOUNDARY_EXTENSION',
} as const;

export type RepairType = (typeof REPAIR_TYPES)[keyof typeof REPAIR_TYPES];

export const REPAIR_STATUS = {
  PROPOSED: 'PROPOSED',
  /** Boundary mutation committed; downstream refresh may still be pending. */
  BOUNDARY_APPLIED: 'BOUNDARY_APPLIED',
  /** Downstream refresh queue accepted — full lifecycle completion is boundaryRefresh=COMPLETED. */
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  // Evaluated, then withheld because canonical trips already represent the
  // window. Distinct from REJECTED, which means an attempted repair failed.
  SUPPRESSED: 'SUPPRESSED',
} as const;

/** Durable downstream refresh state stored in TripRepair.detectorEvidence. */
export const BOUNDARY_REFRESH_STATE = {
  PENDING: 'PENDING',
  ENQUEUED: 'ENQUEUED',
  COMPLETED: 'COMPLETED',
} as const;

export type BoundaryRefreshState =
  (typeof BOUNDARY_REFRESH_STATE)[keyof typeof BOUNDARY_REFRESH_STATE];

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
  /** True when execution was skipped due to an active reconciliation mutex or Redis outage. */
  skipped?: boolean;
  skipReason?: 'LOCKED' | 'REDIS_UNAVAILABLE';
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
