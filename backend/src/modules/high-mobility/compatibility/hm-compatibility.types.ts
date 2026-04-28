/**
 * High Mobility Compatibility — canonical type contracts (V4.6.77)
 *
 * These are the shapes the frontend consumes. They are NOT raw Prisma rows.
 * The service builds these from the database + OEM routing rules so that
 * the same response can later power the landing-page compatibility checker
 * and onboarding assistant without extra shaping work.
 *
 * Important product rules reflected here:
 *  - Eligibility absence does NOT imply "unsupported". Onboarding mode
 *    (PRECHECK_CONNECT / DIRECT_CONNECT / MANUAL_REVIEW) is a separate axis.
 *  - App suitability is derived from signal coverage (rule 2), the DB
 *    healthAppStatus / telemetryAppStatus / overallStatus fields are
 *    optional overrides for rare edge cases.
 */

// ── Canonical enums (string unions — match Prisma enum names exactly) ────────

export type CompatibilityEligibilityMode =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'SUPPORT_REQUEST'
  | 'VIN_DEPENDENT';

export type CompatibilityOnboardingMode =
  | 'PRECHECK_CONNECT'
  | 'DIRECT_CONNECT'
  | 'MANUAL_REVIEW';

export type CompatibilityAppStatus =
  | 'SUPPORTED'
  | 'PARTIAL'
  | 'NOT_RECOMMENDED';

export type CompatibilityOverall = 'GOOD' | 'LIMITED' | 'WEAK';

export type CompatibilityConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type CompatibilityApp = 'HEALTH' | 'TELEMETRY';

export type SignalCoverage =
  | 'CONFIRMED'
  | 'EXPECTED'
  | 'UNVERIFIED'
  | 'MISSING';

// ── Aggregate lookup DTOs ────────────────────────────────────────────────────

export interface CompatibilityBrandOption {
  brand: string;             // normalized ("volkswagen")
  displayName: string;       // canonical display ("Volkswagen")
  modelCount: number;
}

export interface CompatibilityModelOption {
  model: string;             // normalized ("golf")
  displayName: string;       // canonical display ("Golf")
  /** Human-readable range string ("MY 2019+", "2018-2023") built from modelYearFrom/To. */
  yearRange: string | null;
}

// ── Check-response DTO ───────────────────────────────────────────────────────

export interface SignalCoverageItem {
  app: CompatibilityApp;
  signalKey: string;          // stable key ("odometer")
  signalLabel: string;        // display ("Odometer")
  signalGroup: string;        // product grouping ("Core Metrics", "Energy")
  required: boolean;
  coverage: SignalCoverage;
  confidence: CompatibilityConfidence;
  notes: string | null;
  displayOrder: number;
}

export interface AppCoverageSummary {
  status: CompatibilityAppStatus;
  /** How many required signal groups are CONFIRMED or EXPECTED. */
  coveredRequired: number;
  /** Total number of required signal groups. */
  totalRequired: number;
  /** Total signals (required + optional). */
  totalSignals: number;
  /** Human-readable rationale for the UI. */
  reason: string;
  signals: SignalCoverageItem[];
}

export interface CompatibilitySummary {
  brand: string;
  brandDisplayName: string;
  model: string;
  modelDisplayName: string;
  modelYearFrom: number | null;
  modelYearTo: number | null;
  supportFromText: string | null;
  overallStatus: CompatibilityOverall;
  /** Why the overall came out that way. */
  overallNotes: string | null;
}

export interface CompatibilityOnboardingInfo {
  eligibilityMode: CompatibilityEligibilityMode;
  onboardingMode: CompatibilityOnboardingMode;
  /** Routing hint from high-mobility-oem-routing (ELIGIBILITY_FIRST, DIRECT_FLEET_CLEARANCE, UNKNOWN). */
  oemPath: 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';
  /** Routing note from high-mobility-oem-routing (e.g. VW Group rationale). */
  routingNote: string | null;
  /** Short explanation tailored for onboarding operators. */
  guidance: string;
}

export interface CompatibilitySourceInfo {
  supportSource: string | null;
  confidence: CompatibilityConfidence;
  lastReviewedAt: string | null; // ISO
  notes: string | null;
}

export interface CompatibilityLookupEcho {
  brand: string;              // as typed by caller
  model: string;              // as typed by caller
  year: number | null;        // as typed by caller
  resolvedBrandNormalized: string | null;
  resolvedModelNormalized: string | null;
}

export interface CompatibilityCheckResponse {
  lookup: CompatibilityLookupEcho;
  found: boolean;
  /** When found = false, summary/onboarding/apps may be null. */
  summary: CompatibilitySummary | null;
  healthApp: AppCoverageSummary | null;
  telemetryApp: AppCoverageSummary | null;
  onboarding: CompatibilityOnboardingInfo | null;
  source: CompatibilitySourceInfo | null;
  /** Operator-facing reason when found = false. */
  notFoundReason: string | null;
  generatedAt: string;        // ISO
}

// ── Derivation thresholds ────────────────────────────────────────────────────
// These are the deterministic rules used to compute AppCoverageSummary.status
// from signal coverage. Keep them here so UI and future landing page stay in sync.

/** Signal coverage that counts as "present enough for the app". */
export const PRESENT_COVERAGES: readonly SignalCoverage[] = ['CONFIRMED', 'EXPECTED'];

/** Signal coverage that counts as "definitely missing — degrades app status". */
export const MISSING_COVERAGES: readonly SignalCoverage[] = ['MISSING'];

/** Ratio of required-covered / required-total ≥ this → SUPPORTED. */
export const SUPPORTED_RATIO = 0.8;

/** Ratio strictly less than this → NOT_RECOMMENDED. */
export const NOT_RECOMMENDED_RATIO = 0.4;

// Between NOT_RECOMMENDED_RATIO and SUPPORTED_RATIO → PARTIAL.
