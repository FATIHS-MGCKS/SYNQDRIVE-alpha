import type { RentalDrivingAnalysisAssessmentStatus } from '@prisma/client';
import type { DrivingAttributionType } from '../vehicle-intelligence/trips/driving-attribution-roles/driving-attribution-roles.types';
import type { RentalDrivingNormalizedMetrics } from './rental-driving-analysis.metrics';
import type { RentalDrivingAssessmentSummary } from './rental-driving-analysis.types';
import {
  RENTAL_PATTERN_SUMMARY_CONFIG as CFG,
  RENTAL_PATTERN_SUMMARY_VERSION,
} from './rental-driving-analysis.pattern-summary.config';

export type RentalPatternSubjectScope = 'BOOKING_CUSTOMER' | 'DRIVER_CONDUCT';

export type RentalPatternRecommendationEligibility =
  | 'none'
  | 'review_only'
  | 'operational_recommendation';

export type RentalPatternHistoryEntry = {
  rentalAnalysisId: string;
  bookingId: string;
  periodEndIso: string;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  attributionType: DrivingAttributionType | null;
  analysisSource: 'booking_assignment' | 'time_window_fallback' | 'none';
  customerDecisionEligible: boolean;
  calculationVersion: string;
  assessmentStatus: RentalDrivingAnalysisAssessmentStatus;
  analysisCompleteness: 'FULL' | 'PARTIAL' | 'INSUFFICIENT';
  assessmentSummary?: RentalDrivingAssessmentSummary | null;
  rentalMetrics?: RentalDrivingNormalizedMetrics | null;
  overallLevel?: string | null;
};

export type RentalPatternSummaryInput = {
  scope: RentalPatternSubjectScope;
  subjectId: string | null;
  rentals: RentalPatternHistoryEntry[];
};

export type RentalPatternSummaryResult = {
  version: typeof RENTAL_PATTERN_SUMMARY_VERSION;
  scope: RentalPatternSubjectScope;
  subjectId: string | null;
  assessedRentals: number;
  concerningRentals: number;
  repeatedPattern: boolean;
  strongSingleIncident: boolean;
  attributionCoverage: number | null;
  dataCoverage: number | null;
  recommendationEligibility: RentalPatternRecommendationEligibility;
  automaticBlockingEnabled: false;
  reasons: string[];
};

const UNCLEAR_ATTRIBUTION_TYPES = new Set<DrivingAttributionType>([
  'PRIVATE_UNASSIGNED',
  'UNKNOWN',
  'VEHICLE_ONLY',
]);

const DRIVER_CONDUCT_ATTRIBUTION_TYPES = new Set<DrivingAttributionType>([
  'CONFIRMED_DRIVER',
  'ASSIGNED_DRIVER',
  'BOOKING_CUSTOMER',
]);

function roundPct(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function isCompatibleModelProfile(version: string): boolean {
  return (CFG.COMPATIBLE_CALCULATION_VERSIONS as readonly string[]).includes(version);
}

function matchesScope(entry: RentalPatternHistoryEntry, input: RentalPatternSummaryInput): boolean {
  if (!input.subjectId) return false;
  if (input.scope === 'BOOKING_CUSTOMER') {
    return entry.bookingCustomerId === input.subjectId;
  }
  if (entry.actualDriverId === input.subjectId) return true;
  return !entry.actualDriverId && entry.assignedDriverId === input.subjectId;
}

function isClearlyAttributed(entry: RentalPatternHistoryEntry, scope: RentalPatternSubjectScope): boolean {
  if (entry.analysisSource !== 'booking_assignment') return false;
  if (!entry.attributionType || UNCLEAR_ATTRIBUTION_TYPES.has(entry.attributionType)) {
    return false;
  }
  if (scope === 'DRIVER_CONDUCT') {
    return DRIVER_CONDUCT_ATTRIBUTION_TYPES.has(entry.attributionType);
  }
  return true;
}

function isAssessableRental(entry: RentalPatternHistoryEntry): boolean {
  if (!isCompatibleModelProfile(entry.calculationVersion)) return false;
  if (entry.analysisSource === 'none' || entry.analysisSource === 'time_window_fallback') {
    return false;
  }
  if (entry.assessmentStatus === 'NOT_ASSESSABLE' || entry.assessmentStatus === 'FAILED') {
    return false;
  }
  if (entry.assessmentStatus === 'PROVISIONAL') return false;
  if (entry.analysisCompleteness === 'INSUFFICIENT') return false;
  return entry.assessmentStatus === 'COMPLETE' || entry.assessmentStatus === 'PARTIAL';
}

function hasQualifiedEvidence(entry: RentalPatternHistoryEntry): boolean {
  const metrics = entry.rentalMetrics;
  if (!metrics) return false;
  if (metrics.driverConduct.reliability === 'UNRELIABLE') return false;

  const nativeShare = metrics.evidenceShares.nativeEvidenceShare.value ?? 0;
  const proxyShare = metrics.evidenceShares.proxyShare.value ?? 0;
  const assessableShare = metrics.evidenceShares.assessableDistanceShare.value ?? 0;

  const proxyOnly =
    proxyShare >= CFG.MAX_PROXY_ONLY_SHARE_PCT &&
    nativeShare < CFG.MIN_NATIVE_EVIDENCE_SHARE_PCT;

  if (proxyOnly) return false;
  if (assessableShare < CFG.MIN_DATA_COVERAGE_PCT) return false;
  return nativeShare >= CFG.MIN_NATIVE_EVIDENCE_SHARE_PCT || proxyShare < CFG.MAX_PROXY_ONLY_SHARE_PCT;
}

function isConcerningRental(entry: RentalPatternHistoryEntry): boolean {
  if (!isAssessableRental(entry) || !hasQualifiedEvidence(entry)) return false;
  const metrics = entry.rentalMetrics;
  if (!metrics) return false;

  const conduct = metrics.driverConduct.level;
  const harshPer100Km = metrics.harshEvents.per100Km.value ?? 0;
  const abusePer100Km = metrics.abuseEvents.per100Km.value ?? 0;

  return (
    conduct === 'elevated' ||
    conduct === 'high' ||
    harshPer100Km >= CFG.STRONG_SINGLE_HARSH_PER_100KM ||
    abusePer100Km >= 1.5
  );
}

function isStrongSingleIncident(entry: RentalPatternHistoryEntry): boolean {
  if (!isConcerningRental(entry)) return false;
  const metrics = entry.rentalMetrics!;
  return (
    metrics.driverConduct.level === 'high' ||
    (metrics.harshEvents.per100Km.value ?? 0) >= CFG.STRONG_SINGLE_HARSH_PER_100KM ||
    metrics.strongEventClusters.clusterCount > 0
  );
}

/**
 * Customer/driver rental pattern summary (P64).
 * Informational only — never enables automatic blocking.
 */
export function buildRentalPatternSummary(
  input: RentalPatternSummaryInput,
): RentalPatternSummaryResult {
  const reasons: string[] = [];
  const scoped = input.rentals
    .filter((entry) => matchesScope(entry, input))
    .sort((a, b) => b.periodEndIso.localeCompare(a.periodEndIso))
    .slice(0, CFG.LOOKBACK_RENTALS);

  if (!input.subjectId) {
    return emptyPatternSummary(input.scope, null, ['SUBJECT_UNKNOWN']);
  }

  if (scoped.length === 0) {
    return emptyPatternSummary(input.scope, input.subjectId, ['NO_RENTAL_HISTORY']);
  }

  const attributed = scoped.filter((entry) => isClearlyAttributed(entry, input.scope));
  const assessable = scoped.filter((entry) => isAssessableRental(entry));
  const qualified = assessable.filter((entry) => hasQualifiedEvidence(entry));
  const concerning = qualified.filter((entry) => isConcerningRental(entry));

  const attributionCoverage =
    scoped.length > 0 ? roundPct((attributed.length / scoped.length) * 100) : null;
  const dataCoverage =
    scoped.length > 0 ? roundPct((qualified.length / scoped.length) * 100) : null;

  const repeatedPattern =
    concerning.length >= CFG.REPEATED_PATTERN_MIN_CONCERNING_RENTALS &&
    assessable.length >= CFG.MIN_ASSESSED_RENTALS &&
    attributed.length >= CFG.MIN_ATTRIBUTED_RENTALS_FOR_PATTERN;

  const strongSingleIncident =
    concerning.length === 1 &&
    isStrongSingleIncident(concerning[0]) &&
    !repeatedPattern;

  let recommendationEligibility: RentalPatternRecommendationEligibility = 'none';

  if (assessable.length < CFG.MIN_ASSESSED_RENTALS) {
    reasons.push('INSUFFICIENT_ASSESSED_RENTALS');
  }
  if (attributed.length < CFG.MIN_ATTRIBUTED_RENTALS_FOR_PATTERN) {
    reasons.push('INSUFFICIENT_ATTRIBUTED_RENTALS');
  }
  if ((attributionCoverage ?? 0) < CFG.MIN_ATTRIBUTION_COVERAGE_PCT) {
    reasons.push('LOW_ATTRIBUTION_COVERAGE');
  }
  if ((dataCoverage ?? 0) < CFG.MIN_DATA_COVERAGE_PCT) {
    reasons.push('LOW_DATA_COVERAGE');
  }
  if (qualified.length === 0) {
    reasons.push('NO_QUALIFIED_EVIDENCE');
  }

  if (repeatedPattern) {
    reasons.push('REPEATED_CONCERNING_RENTAL_PATTERN');
    recommendationEligibility =
      (dataCoverage ?? 0) >= CFG.MIN_DATA_COVERAGE_PCT &&
      (attributionCoverage ?? 0) >= CFG.MIN_ATTRIBUTION_COVERAGE_PCT
        ? 'operational_recommendation'
        : 'review_only';
  } else if (strongSingleIncident) {
    reasons.push('STRONG_SINGLE_INCIDENT');
    recommendationEligibility = 'review_only';
  } else if (concerning.length > 0) {
    reasons.push('CONCERNING_RENTAL_WITHOUT_REPEAT_PATTERN');
    recommendationEligibility = 'review_only';
  } else {
    reasons.push('NO_CONCERNING_PATTERN');
  }

  if (input.scope === 'DRIVER_CONDUCT') {
    reasons.push('DRIVER_CONDUCT_SCOPE_SEPARATE_FROM_CONTRACT_CUSTOMER');
  } else {
    reasons.push('BOOKING_CUSTOMER_SCOPE_SEPARATE_FROM_DRIVER_CONDUCT');
  }

  reasons.push('AUTOMATIC_BLOCKING_DISABLED');

  return {
    version: RENTAL_PATTERN_SUMMARY_VERSION,
    scope: input.scope,
    subjectId: input.subjectId,
    assessedRentals: assessable.length,
    concerningRentals: concerning.length,
    repeatedPattern,
    strongSingleIncident,
    attributionCoverage,
    dataCoverage,
    recommendationEligibility,
    automaticBlockingEnabled: false,
    reasons: [...new Set(reasons)],
  };
}

function emptyPatternSummary(
  scope: RentalPatternSubjectScope,
  subjectId: string | null,
  reasons: string[],
): RentalPatternSummaryResult {
  return {
    version: RENTAL_PATTERN_SUMMARY_VERSION,
    scope,
    subjectId,
    assessedRentals: 0,
    concerningRentals: 0,
    repeatedPattern: false,
    strongSingleIncident: false,
    attributionCoverage: null,
    dataCoverage: null,
    recommendationEligibility: 'none',
    automaticBlockingEnabled: false,
    reasons: [...reasons, 'AUTOMATIC_BLOCKING_DISABLED'],
  };
}

export function resolveRentalPatternSummaries(input: {
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  rentals: RentalPatternHistoryEntry[];
}): {
  bookingCustomer: RentalPatternSummaryResult;
  driverConduct: RentalPatternSummaryResult | null;
} {
  const driverSubjectId = input.actualDriverId ?? input.assignedDriverId;
  return {
    bookingCustomer: buildRentalPatternSummary({
      scope: 'BOOKING_CUSTOMER',
      subjectId: input.bookingCustomerId,
      rentals: input.rentals,
    }),
    driverConduct: driverSubjectId
      ? buildRentalPatternSummary({
          scope: 'DRIVER_CONDUCT',
          subjectId: driverSubjectId,
          rentals: input.rentals,
        })
      : null,
  };
}

export function buildRentalPatternHistoryEntry(input: {
  rentalAnalysisId: string;
  bookingId: string;
  periodEnd: Date;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  attributionType: DrivingAttributionType | null;
  analysisSource: 'booking_assignment' | 'time_window_fallback' | 'none';
  customerDecisionEligible: boolean;
  calculationVersion: string;
  assessmentStatus: RentalDrivingAnalysisAssessmentStatus;
  analysisCompleteness: 'FULL' | 'PARTIAL' | 'INSUFFICIENT';
  assessmentSummary?: RentalDrivingAssessmentSummary | null;
  rentalMetrics?: RentalDrivingNormalizedMetrics | null;
  overallLevel?: string | null;
}): RentalPatternHistoryEntry {
  return {
    rentalAnalysisId: input.rentalAnalysisId,
    bookingId: input.bookingId,
    periodEndIso: input.periodEnd.toISOString(),
    bookingCustomerId: input.bookingCustomerId,
    assignedDriverId: input.assignedDriverId,
    actualDriverId: input.actualDriverId,
    attributionType: input.attributionType,
    analysisSource: input.analysisSource,
    customerDecisionEligible: input.customerDecisionEligible,
    calculationVersion: input.calculationVersion,
    assessmentStatus: input.assessmentStatus,
    analysisCompleteness: input.analysisCompleteness,
    assessmentSummary: input.assessmentSummary,
    rentalMetrics: input.rentalMetrics,
    overallLevel: input.overallLevel,
  };
}
