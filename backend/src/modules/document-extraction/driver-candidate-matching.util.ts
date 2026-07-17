import {
  normalizeFullName,
  normalizeLicenseNumber,
} from '@modules/customers/utils/customer-normalizer.util';
import {
  DRIVER_CANDIDATE_CONFLICT_CODES,
  DRIVER_CANDIDATE_MATCH_REASONS,
  type DriverBookingPoolContext,
  type DriverCandidateConflict,
  type DriverCandidateMatch,
  type DriverCandidateMatchReason,
  type DriverCandidateResolverInput,
  type DriverCandidateSearchRecord,
  type DriverResolverHints,
  type DriverResolverPrivateHints,
} from './driver-candidate-resolver.types';

const PLAUSIBLE_CONFIDENCE_THRESHOLD = 0.55;
const NAME_ONLY_MAX_CONFIDENCE = 0.45;

const MATCH_BASE_SCORE: Record<DriverCandidateMatchReason, number> = {
  [DRIVER_CANDIDATE_MATCH_REASONS.DRIVER_ID_EXACT]: 0.97,
  [DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT]: 0.92,
  [DRIVER_CANDIDATE_MATCH_REASONS.TRIP_DRIVER_ASSIGNMENT]: 0.9,
  [DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_PRIMARY_DRIVER]: 0.88,
  [DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_ADDITIONAL_DRIVER]: 0.82,
  [DRIVER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT]: 0.8,
  [DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT]: 0.58,
};

const STRONG_MATCH_REASONS: DriverCandidateMatchReason[] = [
  DRIVER_CANDIDATE_MATCH_REASONS.DRIVER_ID_EXACT,
  DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT,
  DRIVER_CANDIDATE_MATCH_REASONS.TRIP_DRIVER_ASSIGNMENT,
  DRIVER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

function normalizeOcrName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildDisplayLabel(driver: DriverCandidateSearchRecord): string {
  const initials = `${driver.firstName?.charAt(0) ?? '?'}${driver.lastName?.charAt(0) ?? '?'}`;
  return `Fahrer ${initials}`;
}

function resolveDriverRole(
  driverId: string,
  pool: DriverBookingPoolContext | null,
): 'PRIMARY' | 'ADDITIONAL' | 'UNKNOWN' {
  if (!pool) return 'UNKNOWN';
  if (pool.primaryDriverId === driverId) return 'PRIMARY';
  if (pool.additionalDriverIds.includes(driverId)) return 'ADDITIONAL';
  return 'UNKNOWN';
}

export function buildDriverResolverPrivateHints(
  input: DriverCandidateResolverInput,
): DriverResolverPrivateHints {
  const data = input.extractedData;
  const driverName =
    toStr(data.driverName) ??
    toStr(data.lesseeName) ??
    toStr(data.additionalDriverName);

  const driverId =
    (isUuid(toStr(data.driverId)) ? toStr(data.driverId) : null) ??
    (isUuid(toStr(data.driverCustomerId)) ? toStr(data.driverCustomerId) : null);

  return {
    driverName,
    licenseNumber: toStr(data.licenseNumber) ?? toStr(data.driverLicenseNumber),
    driverId,
    documentContextDriverId: input.uploadContextDriverId ?? null,
  };
}

export function buildDriverResolverHints(
  privateHints: DriverResolverPrivateHints,
  linkedBookingId?: string | null,
  tripDriverId?: string | null,
): DriverResolverHints {
  return {
    driverNamePresent: Boolean(privateHints.driverName),
    licensePresent: Boolean(privateHints.licenseNumber),
    driverIdPresent: Boolean(privateHints.driverId),
    bookingLinkPresent: Boolean(linkedBookingId),
    tripAssignmentPresent: Boolean(tripDriverId),
    documentContextDriverId: privateHints.documentContextDriverId ?? null,
    linkedBookingId: linkedBookingId ?? null,
  };
}

interface ScoredDriverCandidate {
  driverCustomerId: string;
  driver: DriverCandidateSearchRecord;
  reasons: DriverCandidateMatchReason[];
  conflicts: DriverCandidateConflict[];
  score: number;
}

function hasAnyReason(
  reasons: DriverCandidateMatchReason[],
  allowed: DriverCandidateMatchReason[],
): boolean {
  return reasons.some((reason) => allowed.includes(reason));
}

function pushReason(
  map: Map<string, ScoredDriverCandidate>,
  driver: DriverCandidateSearchRecord,
  reason: DriverCandidateMatchReason,
  score: number,
) {
  const existing = map.get(driver.id);
  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.score = Math.max(existing.score, score);
    return;
  }
  map.set(driver.id, {
    driverCustomerId: driver.id,
    driver,
    reasons: [reason],
    conflicts: [],
    score,
  });
}

function nameMatches(driver: DriverCandidateSearchRecord, ocrName: string): boolean {
  const normalizedOcr = normalizeOcrName(ocrName);
  if (driver.fullNameNormalized && driver.fullNameNormalized === normalizedOcr) {
    return true;
  }
  const derived = normalizeFullName(driver.firstName, driver.lastName);
  return derived === normalizedOcr;
}

function isEligibleDriver(
  driverId: string,
  pool: DriverBookingPoolContext | null,
  privateHints: DriverResolverPrivateHints,
): boolean {
  if (!pool) {
    return (
      driverId === privateHints.driverId ||
      driverId === privateHints.documentContextDriverId
    );
  }

  if (driverId === pool.bookingCustomerId && !pool.allowedDriverIds.includes(driverId)) {
    return false;
  }

  if (pool.allowedDriverIds.length === 0) {
    return driverId !== pool.bookingCustomerId;
  }

  return pool.allowedDriverIds.includes(driverId);
}

export function scoreDriverCandidates(input: {
  drivers: DriverCandidateSearchRecord[];
  privateHints: DriverResolverPrivateHints;
  bookingPool: DriverBookingPoolContext | null;
}): DriverCandidateMatch[] {
  const { drivers, privateHints, bookingPool } = input;
  const scored = new Map<string, ScoredDriverCandidate>();
  const normalizedLicense = privateHints.licenseNumber
    ? normalizeLicenseNumber(privateHints.licenseNumber)
    : null;

  for (const driver of drivers) {
    if (!isEligibleDriver(driver.id, bookingPool, privateHints)) {
      continue;
    }

    if (privateHints.driverId && privateHints.driverId === driver.id) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.DRIVER_ID_EXACT,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.DRIVER_ID_EXACT],
      );
    }

    if (
      privateHints.documentContextDriverId &&
      privateHints.documentContextDriverId === driver.id
    ) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT],
      );
    }

    if (
      normalizedLicense &&
      driver.licenseNumberNormalized &&
      driver.licenseNumberNormalized === normalizedLicense
    ) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT],
      );
    }

    if (bookingPool?.tripDriverId && bookingPool.tripDriverId === driver.id) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.TRIP_DRIVER_ASSIGNMENT,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.TRIP_DRIVER_ASSIGNMENT],
      );
    }

    if (bookingPool?.primaryDriverId && bookingPool.primaryDriverId === driver.id) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_PRIMARY_DRIVER,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_PRIMARY_DRIVER],
      );
    }

    if (bookingPool?.additionalDriverIds.includes(driver.id)) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_ADDITIONAL_DRIVER,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_ADDITIONAL_DRIVER],
      );
    }

    if (privateHints.driverName && nameMatches(driver, privateHints.driverName)) {
      pushReason(
        scored,
        driver,
        DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
        MATCH_BASE_SCORE[DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT],
      );
    }
  }

  const ambiguousPool =
    Boolean(bookingPool && bookingPool.allowedDriverIds.length > 1);
  const duplicateNameCustomerIds = collectDuplicateNameDriverIds(scored);

  const strongDisambiguatedIds = collectStrongDisambiguatedDriverIds(scored);

  const filtered = [...scored.values()].filter((row) => {
    if (strongDisambiguatedIds.size === 1 && !strongDisambiguatedIds.has(row.driverCustomerId)) {
      return false;
    }
    if (duplicateNameCustomerIds.has(row.driverCustomerId)) {
      return true;
    }
    if (
      ambiguousPool &&
      bookingPool &&
      strongDisambiguatedIds.size === 0 &&
      bookingPool.allowedDriverIds.includes(row.driverCustomerId)
    ) {
      return true;
    }
    const nameOnly =
      row.reasons.length === 1 &&
      row.reasons[0] === DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT;
    const weakNameOnly =
      hasAnyReason(row.reasons, [DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT]) &&
      !hasAnyReason(row.reasons, STRONG_MATCH_REASONS) &&
      !hasAnyReason(row.reasons, [
        DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_PRIMARY_DRIVER,
        DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_ADDITIONAL_DRIVER,
      ]);
    return !nameOnly && !weakNameOnly;
  });

  return finalizeRankedDriverCandidates(filtered, bookingPool, duplicateNameCustomerIds);
}

function collectDuplicateNameDriverIds(
  scored: Map<string, ScoredDriverCandidate>,
): Set<string> {
  const byNormalizedName = new Map<string, string[]>();

  for (const row of scored.values()) {
    if (!row.reasons.includes(DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT)) {
      continue;
    }
    const normalizedName = row.driver.fullNameNormalized;
    if (!normalizedName) continue;
    const existing = byNormalizedName.get(normalizedName) ?? [];
    existing.push(row.driverCustomerId);
    byNormalizedName.set(normalizedName, existing);
  }

  const duplicateIds = new Set<string>();
  for (const driverIds of byNormalizedName.values()) {
    if (driverIds.length > 1) {
      driverIds.forEach((driverId) => duplicateIds.add(driverId));
    }
  }
  return duplicateIds;
}

function collectStrongDisambiguatedDriverIds(
  scored: Map<string, ScoredDriverCandidate>,
): Set<string> {
  const strongMatches = [...scored.values()].filter((row) =>
    hasAnyReason(row.reasons, STRONG_MATCH_REASONS),
  );
  if (strongMatches.length === 1) {
    return new Set([strongMatches[0].driverCustomerId]);
  }

  const nameMatches = [...scored.values()].filter((row) =>
    row.reasons.includes(DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT),
  );
  if (nameMatches.length === 1) {
    return new Set([nameMatches[0].driverCustomerId]);
  }

  return new Set();
}

function finalizeRankedDriverCandidates(
  scored: ScoredDriverCandidate[],
  bookingPool: DriverBookingPoolContext | null,
  duplicateNameCustomerIds: Set<string>,
): DriverCandidateMatch[] {
  const sorted = scored
    .map((row) => ({
      driverCustomerId: row.driverCustomerId,
      confidence: Math.min(1, Math.round(row.score * 1000) / 1000),
      matchReasons: sortDriverReasons(row.reasons),
      conflicts: row.conflicts,
      rank: 0,
      confirmationRequired: true,
      displayLabel: buildDisplayLabel(row.driver),
      driverRole: resolveDriverRole(row.driverCustomerId, bookingPool),
    }))
    .sort(
      (a, b) =>
        b.confidence - a.confidence || a.driverCustomerId.localeCompare(b.driverCustomerId),
    );

  const ambiguousPool =
    Boolean(bookingPool && bookingPool.allowedDriverIds.length > 1);
  const strongUniqueMatch =
    sorted.filter(
      (candidate) =>
        hasAnyReason(candidate.matchReasons, STRONG_MATCH_REASONS) &&
        candidate.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD,
    ).length === 1;
  const ambiguousNameMatch = duplicateNameCustomerIds.size > 1;

  return sorted.map((candidate, index) => {
    const nameOnly =
      candidate.matchReasons.length === 1 &&
      candidate.matchReasons[0] === DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT;
    const confidence = nameOnly
      ? Math.min(candidate.confidence, NAME_ONLY_MAX_CONFIDENCE)
      : candidate.confidence;

    const conflicts = [...candidate.conflicts];
    if (ambiguousPool && !strongUniqueMatch) {
      conflicts.push({
        code: DRIVER_CANDIDATE_CONFLICT_CODES.AMBIGUOUS_DRIVER_POOL,
        field: 'driver',
        message: 'Mehrere zugelassene Fahrer — keine automatische Zuordnung',
        severity: 'WARNING',
      });
    }
    if (ambiguousNameMatch && candidate.matchReasons.includes(DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT)) {
      conflicts.push({
        code: DRIVER_CANDIDATE_CONFLICT_CODES.DUPLICATE_NAME,
        field: 'driverName',
        message: 'Mehrere gleichnamige Fahrer — manuelle Auswahl erforderlich',
        severity: 'WARNING',
      });
    }

    return {
      ...candidate,
      confidence,
      rank: index + 1,
      confirmationRequired: true,
      conflicts,
    };
  });
}

function sortDriverReasons(
  reasons: DriverCandidateMatchReason[],
): DriverCandidateMatchReason[] {
  const priority: DriverCandidateMatchReason[] = [
    DRIVER_CANDIDATE_MATCH_REASONS.DRIVER_ID_EXACT,
    DRIVER_CANDIDATE_MATCH_REASONS.LICENSE_EXACT,
    DRIVER_CANDIDATE_MATCH_REASONS.TRIP_DRIVER_ASSIGNMENT,
    DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_PRIMARY_DRIVER,
    DRIVER_CANDIDATE_MATCH_REASONS.BOOKING_ADDITIONAL_DRIVER,
    DRIVER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
    DRIVER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
  ];
  return [...reasons].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

export function readDriverCandidatePipelineState(
  plausibility: unknown,
): import('./driver-candidate-resolver.types').DriverCandidatePipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const driverCandidates = (pipeline as Record<string, unknown>).driverCandidates;
  if (!driverCandidates || typeof driverCandidates !== 'object' || Array.isArray(driverCandidates)) {
    return null;
  }
  return driverCandidates as import('./driver-candidate-resolver.types').DriverCandidatePipelineState;
}

export function isDriverUnassignedForFine(input: {
  documentType: string;
  candidates: DriverCandidateMatch[];
  ambiguousDriverPool: boolean;
}): boolean {
  if (input.documentType !== 'FINE') return false;
  if (input.candidates.length === 0) return true;
  if (input.ambiguousDriverPool) {
    const strongMatches = input.candidates.filter((candidate) =>
      candidate.matchReasons.some((reason) => STRONG_MATCH_REASONS.includes(reason)),
    );
    return strongMatches.length !== 1;
  }
  return input.candidates.length > 1;
}
