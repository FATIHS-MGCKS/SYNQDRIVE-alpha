import {
  LEGAL_BOOKING_CHANNEL,
  LEGAL_CUSTOMER_SEGMENT,
  LEGAL_STATION_SCOPE_MODE,
  type LegalBookingChannel,
  type LegalCustomerSegment,
  type LegalStationScopeMode,
} from './legal-document-scope.constants';

/** Normalized scope dimensions used for overlap and conflict detection. */
export interface LegalDocumentScopeShape {
  id?: string;
  organizationId?: string;
  documentType: string;
  legalVariant?: string | null;
  language: string;
  jurisdictionCountry: string;
  customerSegment: LegalCustomerSegment | string;
  bookingChannel: LegalBookingChannel | string;
  productScope?: string | null;
  stationScopeMode: LegalStationScopeMode | string;
  stationIds?: string[];
  priority: number;
  noticePurpose?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  status?: string;
}

export interface LegalScopeConflict {
  documentAId: string;
  documentBId: string;
  reason: 'OVERLAPPING_SCOPE_SAME_PRIORITY' | 'IDENTICAL_SCOPE_FINGERPRINT';
  overlap: LegalScopeOverlapDetail;
}

export interface LegalScopeOverlapDetail {
  documentType: boolean;
  language: boolean;
  jurisdictionCountry: boolean;
  customerSegment: boolean;
  bookingChannel: boolean;
  productScope: boolean;
  stationScope: boolean;
  validity: boolean;
  legalVariant: boolean;
  noticePurpose: boolean;
}

export function validityRangesOverlap(
  a: { validFrom?: Date | null; validUntil?: Date | null },
  b: { validFrom?: Date | null; validUntil?: Date | null },
  at: Date = new Date(),
): boolean {
  const aFrom = a.validFrom ?? null;
  const aUntil = a.validUntil ?? null;
  const bFrom = b.validFrom ?? null;
  const bUntil = b.validUntil ?? null;

  // Open-ended ranges overlap unless one ends before the other starts.
  const aStarts = aFrom ?? new Date(0);
  const aEnds = aUntil ?? new Date(8640000000000000);
  const bStarts = bFrom ?? new Date(0);
  const bEnds = bUntil ?? new Date(8640000000000000);

  return aStarts < bEnds && bStarts < aEnds;
}

export function customerSegmentsOverlap(
  a: LegalCustomerSegment | string,
  b: LegalCustomerSegment | string,
): boolean {
  if (a === LEGAL_CUSTOMER_SEGMENT.BOTH || b === LEGAL_CUSTOMER_SEGMENT.BOTH) return true;
  return a === b;
}

export function bookingChannelsOverlap(
  a: LegalBookingChannel | string,
  b: LegalBookingChannel | string,
): boolean {
  if (a === LEGAL_BOOKING_CHANNEL.ALL || b === LEGAL_BOOKING_CHANNEL.ALL) return true;
  return a === b;
}

export function productScopesOverlap(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  return a === b;
}

export function stationScopesOverlap(
  a: { stationScopeMode: string; stationIds?: string[] },
  b: { stationScopeMode: string; stationIds?: string[] },
): boolean {
  if (
    a.stationScopeMode === LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE ||
    b.stationScopeMode === LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE
  ) {
    return true;
  }
  const setA = new Set(a.stationIds ?? []);
  const setB = new Set(b.stationIds ?? []);
  for (const id of setA) {
    if (setB.has(id)) return true;
  }
  return false;
}

export function legalVariantsCompatible(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return true;
  return a === b;
}

export function noticePurposesCompatible(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  return a === b;
}

export function scopesOverlap(
  a: LegalDocumentScopeShape,
  b: LegalDocumentScopeShape,
): LegalScopeOverlapDetail | null {
  if (a.documentType !== b.documentType) return null;
  if (a.language !== b.language) return null;
  if (a.jurisdictionCountry !== b.jurisdictionCountry) return null;

  const customerSegment = customerSegmentsOverlap(a.customerSegment, b.customerSegment);
  const bookingChannel = bookingChannelsOverlap(a.bookingChannel, b.bookingChannel);
  const productScope = productScopesOverlap(a.productScope, b.productScope);
  const stationScope = stationScopesOverlap(a, b);
  const validity = validityRangesOverlap(a, b);
  const legalVariant = legalVariantsCompatible(a.legalVariant, b.legalVariant);
  const noticePurpose = noticePurposesCompatible(a.noticePurpose, b.noticePurpose);

  const detail: LegalScopeOverlapDetail = {
    documentType: true,
    language: true,
    jurisdictionCountry: true,
    customerSegment,
    bookingChannel,
    productScope,
    stationScope,
    validity,
    legalVariant,
    noticePurpose,
  };

  const overlaps =
    customerSegment &&
    bookingChannel &&
    productScope &&
    stationScope &&
    validity &&
    legalVariant &&
    noticePurpose;

  return overlaps ? detail : null;
}

export function scopeFingerprint(scope: LegalDocumentScopeShape): string {
  const stationKey = [...(scope.stationIds ?? [])].sort().join(',');
  return [
    scope.documentType,
    scope.legalVariant ?? '',
    scope.language,
    scope.jurisdictionCountry,
    scope.customerSegment,
    scope.bookingChannel,
    scope.productScope ?? '*',
    scope.stationScopeMode,
    stationKey,
    scope.noticePurpose ?? '',
  ].join('|');
}

export function detectScopeConflicts(
  documents: LegalDocumentScopeShape[],
  options?: { excludeId?: string },
): LegalScopeConflict[] {
  const conflicts: LegalScopeConflict[] = [];
  const active = documents.filter((d) => d.id !== options?.excludeId);

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      const overlap = scopesOverlap(a, b);
      if (!overlap) continue;

      if (scopeFingerprint(a) === scopeFingerprint(b)) {
        conflicts.push({
          documentAId: a.id ?? `index:${i}`,
          documentBId: b.id ?? `index:${j}`,
          reason: 'IDENTICAL_SCOPE_FINGERPRINT',
          overlap,
        });
        continue;
      }

      if (a.priority === b.priority) {
        conflicts.push({
          documentAId: a.id ?? `index:${i}`,
          documentBId: b.id ?? `index:${j}`,
          reason: 'OVERLAPPING_SCOPE_SAME_PRIORITY',
          overlap,
        });
      }
    }
  }

  return conflicts;
}

export function findConflictsForCandidate(
  candidate: LegalDocumentScopeShape,
  existing: LegalDocumentScopeShape[],
): LegalScopeConflict[] {
  const candidateId = candidate.id ?? '__candidate__';
  const combined = existing
    .filter((doc) => doc.id !== candidate.id)
    .concat({ ...candidate, id: candidateId });
  return detectScopeConflicts(combined).filter(
    (c) => c.documentAId === candidateId || c.documentBId === candidateId,
  );
}

/** Compare by priority descending, then activated/created order — deterministic, no findFirst. */
export function compareScopePriority(
  a: Pick<LegalDocumentScopeShape, 'priority' | 'id'>,
  b: Pick<LegalDocumentScopeShape, 'priority' | 'id'>,
): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return (a.id ?? '').localeCompare(b.id ?? '');
}
