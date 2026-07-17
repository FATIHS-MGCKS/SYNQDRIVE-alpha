import { readFineEventDate, readFineReportNumber } from './document-fine-extraction.rules';
import { readCustomer, readInvoiceDate, readInvoiceNumber } from './document-invoice-extraction.rules';
import {
  BOOKING_CANDIDATE_CONFLICT_CODES,
  BOOKING_CANDIDATE_MATCH_REASONS,
  type BookingCandidateConflict,
  type BookingCandidateMatch,
  type BookingCandidateMatchReason,
  type BookingCandidateResolverInput,
  type BookingCandidateSearchRecord,
  type BookingEventTimePrecision,
  type BookingResolverHints,
} from './booking-candidate-resolver.types';

const PLAUSIBLE_CONFIDENCE_THRESHOLD = 0.55;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MISSING_TIME_PENALTY = 0.75;
const DATE_ONLY_PENALTY = 0.88;
const CUSTOMER_ONLY_MAX_CONFIDENCE = 0.45;

const MATCH_BASE_SCORE: Record<BookingCandidateMatchReason, number> = {
  [BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT]: 0.96,
  [BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP]: 0.84,
  [BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT]: 0.8,
  [BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME]: 0.35,
  [BOOKING_CANDIDATE_MATCH_REASONS.INVOICE_REFERENCE]: 0.55,
  [BOOKING_CANDIDATE_MATCH_REASONS.FINE_REFERENCE]: 0.5,
  [BOOKING_CANDIDATE_MATCH_REASONS.VEHICLE_ANCHOR]: 0.2,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function normalizeName(value: string): string {
  return value.toUpperCase().replace(/[\s\-._/]+/g, ' ');
}

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

function parseEventTime(
  documentType: string,
  extractedData: Record<string, unknown>,
): { instant: Date | null; precision: BookingEventTimePrecision } {
  const dateTimeRaw =
    toStr(extractedData.eventDateTime) ??
    (documentType === 'FINE' ? null : toStr(extractedData.eventDateTime));
  if (dateTimeRaw && dateTimeRaw.includes('T')) {
    const parsed = new Date(dateTimeRaw);
    return Number.isNaN(parsed.getTime())
      ? { instant: null, precision: 'missing' }
      : { instant: parsed, precision: 'datetime' };
  }

  const dateRaw =
    documentType === 'FINE'
      ? readFineEventDate(extractedData)
      : readInvoiceDate(extractedData) ?? toStr(extractedData.eventDate);

  if (!dateRaw) {
    return { instant: null, precision: 'missing' };
  }

  const parsed = new Date(dateRaw);
  if (Number.isNaN(parsed.getTime())) {
    return { instant: null, precision: 'missing' };
  }

  return { instant: parsed, precision: 'date' };
}

function eventWindow(
  instant: Date,
  precision: BookingEventTimePrecision,
): { start: Date; end: Date } {
  if (precision === 'datetime') {
    return { start: instant, end: instant };
  }
  const start = new Date(instant);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(instant);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function bookingOverlapsEvent(
  booking: BookingCandidateSearchRecord,
  eventStart: Date,
  eventEnd: Date,
): boolean {
  return booking.startDate <= eventEnd && booking.endDate >= eventStart;
}

function customerNameMatches(
  booking: BookingCandidateSearchRecord,
  customerName: string,
): boolean {
  const normalizedHint = normalizeName(customerName);
  const fullName = normalizeName(
    `${booking.customer.firstName} ${booking.customer.lastName}`.trim(),
  );
  if (fullName && (fullName === normalizedHint || normalizedHint.includes(fullName))) {
    return true;
  }
  if (booking.customer.company) {
    const company = normalizeName(booking.customer.company);
    return company === normalizedHint || normalizedHint.includes(company);
  }
  return false;
}

export function buildBookingResolverHints(
  input: BookingCandidateResolverInput,
): BookingResolverHints {
  const { extractedData, documentType } = input;
  const { instant, precision } = parseEventTime(documentType, extractedData);
  const bookingReference =
    toStr(extractedData.bookingReference) ??
    toStr(extractedData.bookingId) ??
    input.uploadContextBookingId ??
    null;

  return {
    vehicleId: input.vehicleId,
    eventInstant: instant?.toISOString() ?? null,
    eventTimePrecision: precision,
    bookingReference: isUuid(bookingReference) ? bookingReference : bookingReference,
    customerName: readCustomer(extractedData) ?? toStr(extractedData.customerName),
    invoiceReference: readInvoiceNumber(extractedData),
    fineReference: readFineReportNumber(extractedData),
    documentSubtype:
      toStr(extractedData.documentSubtype) ??
      toStr(extractedData.documentKind) ??
      toStr(extractedData.archiveSubtype),
    documentContextBookingId: input.uploadContextBookingId ?? null,
  };
}

interface ScoredBookingCandidate {
  bookingId: string;
  reasons: BookingCandidateMatchReason[];
  conflicts: BookingCandidateConflict[];
  score: number;
  temporalOverlap: boolean;
}

function pushReason(
  map: Map<string, ScoredBookingCandidate>,
  bookingId: string,
  reason: BookingCandidateMatchReason,
  score: number,
  temporalOverlap: boolean,
) {
  const existing = map.get(bookingId);
  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.score = Math.max(existing.score, score);
    existing.temporalOverlap = existing.temporalOverlap || temporalOverlap;
    return;
  }
  map.set(bookingId, {
    bookingId,
    reasons: [reason],
    conflicts: [],
    score,
    temporalOverlap,
  });
}

const STRONG_MATCH_REASONS: BookingCandidateMatchReason[] = [
  BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT,
  BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP,
  BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
];

function hasAnyReason(
  reasons: BookingCandidateMatchReason[],
  allowed: BookingCandidateMatchReason[],
): boolean {
  return reasons.some((reason) => allowed.includes(reason));
}

export function scoreBookingCandidates(input: {
  bookings: BookingCandidateSearchRecord[];
  hints: BookingResolverHints;
}): BookingCandidateMatch[] {
  const { bookings, hints } = input;
  const scored = new Map<string, ScoredBookingCandidate>();
  const eventInstant = hints.eventInstant ? new Date(hints.eventInstant) : null;
  const eventWindowBounds =
    eventInstant && hints.eventTimePrecision !== 'missing'
      ? eventWindow(eventInstant, hints.eventTimePrecision)
      : null;

  let timePenalty = 1;
  if (hints.eventTimePrecision === 'missing') {
    timePenalty = MISSING_TIME_PENALTY;
  } else if (hints.eventTimePrecision === 'date') {
    timePenalty = DATE_ONLY_PENALTY;
  }

  for (const booking of bookings) {
    if (hints.vehicleId && booking.vehicleId !== hints.vehicleId) {
      continue;
    }

    if (hints.documentContextBookingId && hints.documentContextBookingId === booking.id) {
      pushReason(
        scored,
        booking.id,
        BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
        MATCH_BASE_SCORE[BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT] * timePenalty,
        eventWindowBounds ? bookingOverlapsEvent(booking, eventWindowBounds.start, eventWindowBounds.end) : false,
      );
    }

    if (isUuid(hints.bookingReference) && hints.bookingReference === booking.id) {
      pushReason(
        scored,
        booking.id,
        BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT,
        MATCH_BASE_SCORE[BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT],
        eventWindowBounds ? bookingOverlapsEvent(booking, eventWindowBounds.start, eventWindowBounds.end) : false,
      );
    }

    if (eventWindowBounds) {
      const overlaps = bookingOverlapsEvent(
        booking,
        eventWindowBounds.start,
        eventWindowBounds.end,
      );
      if (overlaps) {
        pushReason(
          scored,
          booking.id,
          BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP,
          MATCH_BASE_SCORE[BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP] * timePenalty,
          true,
        );
      }
    }

    if (hints.customerName && customerNameMatches(booking, hints.customerName)) {
      const hasStrongSignal = hasAnyReason(
        scored.get(booking.id)?.reasons ?? [],
        STRONG_MATCH_REASONS,
      );
      if (hasStrongSignal) {
        pushReason(
          scored,
          booking.id,
          BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME,
          MATCH_BASE_SCORE[BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME],
          scored.get(booking.id)?.temporalOverlap ?? false,
        );
      }
    }
  }

  const filtered = [...scored.values()].filter((row) =>
    hasAnyReason(row.reasons, STRONG_MATCH_REASONS) ||
    hasAnyReason(row.reasons, [
      BOOKING_CANDIDATE_MATCH_REASONS.INVOICE_REFERENCE,
      BOOKING_CANDIDATE_MATCH_REASONS.FINE_REFERENCE,
    ]),
  );

  if (hints.eventTimePrecision === 'missing') {
    for (const row of filtered) {
      if (!row.reasons.includes(BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT) &&
          !row.reasons.includes(BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT)) {
        row.conflicts.push({
          code: BOOKING_CANDIDATE_CONFLICT_CODES.MISSING_EVENT_TIME,
          field: 'eventDate',
          message: 'Kein Ereignis-/Dokumentzeitpunkt — zeitliche Zuordnung unsicher',
          severity: 'WARNING',
        });
        row.score *= MISSING_TIME_PENALTY;
      }
    }
  }

  return finalizeRankedBookingCandidates(filtered);
}

function finalizeRankedBookingCandidates(
  scored: ScoredBookingCandidate[],
): BookingCandidateMatch[] {
  const sorted = scored
    .map((row) => ({
      bookingId: row.bookingId,
      confidence: Math.min(1, Math.round(row.score * 1000) / 1000),
      matchReasons: sortBookingReasons(row.reasons),
      conflicts: row.conflicts,
      temporalOverlap: row.temporalOverlap,
      rank: 0,
      confirmationRequired: true,
    }))
    .sort((a, b) => b.confidence - a.confidence || a.bookingId.localeCompare(b.bookingId));

  const overlapMatches = sorted.filter(
    (candidate) =>
      candidate.temporalOverlap && candidate.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD,
  );
  const ambiguousOverlap = overlapMatches.length > 1;
  const multiplePlausible = sorted.filter((c) => c.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD).length > 1;

  return sorted.map((candidate, index) => {
    const customerOnlyCap =
      candidate.matchReasons.length === 1 &&
      candidate.matchReasons[0] === BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME;
    const confidence = customerOnlyCap
      ? Math.min(candidate.confidence, CUSTOMER_ONLY_MAX_CONFIDENCE)
      : candidate.confidence;

    const confirmationRequired =
      ambiguousOverlap ||
      multiplePlausible ||
      confidence < HIGH_CONFIDENCE_THRESHOLD ||
      candidate.conflicts.length > 0 ||
      !hasAnyReason(candidate.matchReasons, STRONG_MATCH_REASONS);

    return {
      ...candidate,
      confidence,
      rank: index + 1,
      confirmationRequired,
      conflicts: ambiguousOverlap
        ? [
            ...candidate.conflicts,
            {
              code: BOOKING_CANDIDATE_CONFLICT_CODES.OVERLAPPING_BOOKINGS,
              field: 'eventDate',
              message: 'Mehrere überlappende Buchungen — Zuordnung bleibt mehrdeutig',
              severity: 'WARNING' as const,
            },
          ]
        : candidate.conflicts,
    };
  });
}

function sortBookingReasons(
  reasons: BookingCandidateMatchReason[],
): BookingCandidateMatchReason[] {
  const priority: BookingCandidateMatchReason[] = [
    BOOKING_CANDIDATE_MATCH_REASONS.BOOKING_REFERENCE_EXACT,
    BOOKING_CANDIDATE_MATCH_REASONS.DATE_OVERLAP,
    BOOKING_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
    BOOKING_CANDIDATE_MATCH_REASONS.INVOICE_REFERENCE,
    BOOKING_CANDIDATE_MATCH_REASONS.FINE_REFERENCE,
    BOOKING_CANDIDATE_MATCH_REASONS.CUSTOMER_NAME,
    BOOKING_CANDIDATE_MATCH_REASONS.VEHICLE_ANCHOR,
  ];
  return [...reasons].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

export function readBookingCandidatePipelineState(
  plausibility: unknown,
): import('./booking-candidate-resolver.types').BookingCandidatePipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const bookingCandidates = (pipeline as Record<string, unknown>).bookingCandidates;
  if (!bookingCandidates || typeof bookingCandidates !== 'object' || Array.isArray(bookingCandidates)) {
    return null;
  }
  return bookingCandidates as import('./booking-candidate-resolver.types').BookingCandidatePipelineState;
}
