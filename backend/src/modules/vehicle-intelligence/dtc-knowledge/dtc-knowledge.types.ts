/**
 * DTC Knowledge Base shared types.
 *
 * Status / urgency / recommendation values are plain string unions (mirroring
 * the string columns on DtcKnowledge / DtcVehicleKnowledge) — no field-level
 * confidence anywhere by product decision.
 */

export type DtcKnowledgeStatus = 'MISSING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

export type DtcKnowledgeSource =
  | 'VEHICLE_SPECIFIC'
  | 'GENERIC'
  | 'PENDING'
  | 'FAILED'
  | 'MISSING';

export type DtcUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type DtcRentalRecommendation =
  | 'RENTABLE'
  | 'CHECK_BEFORE_NEXT_RENTAL'
  | 'BLOCK_UNTIL_INSPECTED'
  | 'DO_NOT_RENT'
  | 'UNKNOWN';

export interface DtcKnowledgeSourceRef {
  type?: string;
  title?: string;
  url?: string;
}

/** Lightweight DTO attached to each active DTC in the API response. */
export interface DtcKnowledgeDto {
  status: DtcKnowledgeStatus;
  source: DtcKnowledgeSource;
  title?: string | null;
  shortDescription?: string | null;
  possibleCauses?: string[];
  possibleEffects?: string[];
  technicalUrgency?: DtcUrgency;
  rentalUrgency?: DtcUrgency;
  rentalRecommendation?: DtcRentalRecommendation;
  recommendedAction?: string | null;
  sources?: DtcKnowledgeSourceRef[];
  lastVerifiedAt?: string | null;
  needsReview?: boolean;
  message?: string | null;
}

/** Vehicle context used to scope vehicle-specific enrichment. */
export interface DtcVehicleContext {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  engineCode?: string | null;
}

// ── Queue ────────────────────────────────────────────────────────────────────

export const DTC_ENRICHMENT_JOB = {
  GENERIC: 'DTC_GENERIC_ENRICHMENT',
  VEHICLE: 'DTC_VEHICLE_ENRICHMENT',
} as const;

export type DtcEnrichmentJobName =
  (typeof DTC_ENRICHMENT_JOB)[keyof typeof DTC_ENRICHMENT_JOB];

/** Payload enqueued for the enrichment worker (no DB job row by design). */
export interface DtcEnrichmentJobData {
  /** Generic knowledge row id (for GENERIC jobs) or the linked generic id. */
  knowledgeId?: string;
  /** Vehicle-specific knowledge row id (for VEHICLE jobs). */
  vehicleKnowledgeId?: string;
  code: string;
  normalizedCode: string;
  language: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  engineCode?: string | null;
}

/** Statuses that mean "already handled" — must not be re-enqueued. */
export const NON_REQUEUEABLE_STATUSES: DtcKnowledgeStatus[] = ['QUEUED', 'PROCESSING', 'READY'];
