import {
  normalizeEmail,
  normalizeFullName,
  normalizeIdNumber,
  normalizePhone,
} from '@modules/customers/utils/customer-normalizer.util';
import { readCustomer, readInvoiceNumber } from './document-invoice-extraction.rules';
import { readFineReportNumber } from './document-fine-extraction.rules';
import {
  CUSTOMER_CANDIDATE_CONFLICT_CODES,
  CUSTOMER_CANDIDATE_MATCH_REASONS,
  type CustomerCandidateConflict,
  type CustomerCandidateMatch,
  type CustomerCandidateMatchReason,
  type CustomerCandidateResolverInput,
  type CustomerCandidateSearchRecord,
  type CustomerResolverHints,
  type CustomerResolverPrivateHints,
} from './customer-candidate-resolver.types';

const PLAUSIBLE_CONFIDENCE_THRESHOLD = 0.55;
const NAME_ONLY_MAX_CONFIDENCE = 0.5;

const MATCH_BASE_SCORE: Record<CustomerCandidateMatchReason, number> = {
  [CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT]: 0.97,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK]: 0.93,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT]: 0.88,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.PHONE_EXACT]: 0.86,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH]: 0.72,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT]: 0.62,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT]: 0.8,
  [CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_REFERENCE]: 0.5,
};

const STRONG_MATCH_REASONS: CustomerCandidateMatchReason[] = [
  CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT,
  CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK,
  CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
  CUSTOMER_CANDIDATE_MATCH_REASONS.PHONE_EXACT,
  CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
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

function normalizeCompany(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeAddressToken(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function buildDisplayLabel(customer: CustomerCandidateSearchRecord): string {
  const initials = `${customer.firstName?.charAt(0) ?? '?'}${customer.lastName?.charAt(0) ?? '?'}`;
  if (customer.company?.trim()) {
    return `Firma (${initials})`;
  }
  return `Kunde ${initials}`;
}

export function buildCustomerResolverPrivateHints(
  input: CustomerCandidateResolverInput,
): CustomerResolverPrivateHints {
  const data = input.extractedData;
  const customerNumber =
    toStr(data.customerNumber) ??
    toStr(data.customerReference) ??
    (isUuid(toStr(data.customerId)) ? toStr(data.customerId) : null);

  return {
    customerNumber,
    customerName: readCustomer(data) ?? toStr(data.customerName),
    email: toStr(data.email) ?? toStr(data.customerEmail),
    phone: toStr(data.phone) ?? toStr(data.customerPhone) ?? toStr(data.telephone),
    addressLine: toStr(data.address) ?? toStr(data.street) ?? toStr(data.customerAddress),
    city: toStr(data.city),
    zip: toStr(data.zip) ?? toStr(data.postalCode),
    documentReference: readInvoiceNumber(data) ?? readFineReportNumber(data),
    documentContextCustomerId: input.uploadContextCustomerId ?? null,
    bookingLinkCustomerId: input.bookingLinkCustomerId ?? null,
  };
}

export function buildCustomerResolverHints(
  privateHints: CustomerResolverPrivateHints,
  linkedBookingId?: string | null,
): CustomerResolverHints {
  return {
    customerNumberPresent: Boolean(privateHints.customerNumber),
    bookingLinkPresent: Boolean(privateHints.bookingLinkCustomerId || linkedBookingId),
    namePresent: Boolean(privateHints.customerName),
    emailPresent: Boolean(privateHints.email),
    phonePresent: Boolean(privateHints.phone),
    addressPresent: Boolean(privateHints.addressLine || (privateHints.city && privateHints.zip)),
    documentReferencePresent: Boolean(privateHints.documentReference),
    documentContextCustomerId: privateHints.documentContextCustomerId ?? null,
    linkedBookingId: linkedBookingId ?? null,
  };
}

interface ScoredCustomerCandidate {
  customerId: string;
  customer: CustomerCandidateSearchRecord;
  reasons: CustomerCandidateMatchReason[];
  conflicts: CustomerCandidateConflict[];
  score: number;
}

function hasAnyReason(
  reasons: CustomerCandidateMatchReason[],
  allowed: CustomerCandidateMatchReason[],
): boolean {
  return reasons.some((reason) => allowed.includes(reason));
}

function pushReason(
  map: Map<string, ScoredCustomerCandidate>,
  customer: CustomerCandidateSearchRecord,
  reason: CustomerCandidateMatchReason,
  score: number,
) {
  const existing = map.get(customer.id);
  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.score = Math.max(existing.score, score);
    return;
  }
  map.set(customer.id, {
    customerId: customer.id,
    customer,
    reasons: [reason],
    conflicts: [],
    score,
  });
}

function nameMatches(customer: CustomerCandidateSearchRecord, ocrName: string): boolean {
  const normalizedOcr = normalizeOcrName(ocrName);
  if (customer.fullNameNormalized && customer.fullNameNormalized === normalizedOcr) {
    return true;
  }
  if (customer.company && normalizeCompany(customer.company) === normalizeCompany(ocrName)) {
    return true;
  }
  const derived = normalizeFullName(customer.firstName, customer.lastName);
  return derived === normalizedOcr;
}

function addressMatches(
  customer: CustomerCandidateSearchRecord,
  hints: CustomerResolverPrivateHints,
): boolean {
  const line = hints.addressLine ? normalizeAddressToken(hints.addressLine) : null;
  const city = hints.city ? normalizeAddressToken(hints.city) : null;
  const zip = hints.zip ? hints.zip.replace(/\s+/g, '') : null;

  if (line && customer.address && normalizeAddressToken(customer.address) === line) {
    return true;
  }

  if (city && zip && customer.city && customer.zip) {
    return (
      normalizeAddressToken(customer.city) === city &&
      customer.zip.replace(/\s+/g, '') === zip
    );
  }

  return false;
}

export function scoreCustomerCandidates(input: {
  customers: CustomerCandidateSearchRecord[];
  privateHints: CustomerResolverPrivateHints;
}): CustomerCandidateMatch[] {
  const { customers, privateHints } = input;
  const scored = new Map<string, ScoredCustomerCandidate>();

  for (const customer of customers) {
    if (isUuid(privateHints.customerNumber) && privateHints.customerNumber === customer.id) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT],
      );
    }

    const taxOrIdNumber = privateHints.customerNumber
      ? normalizeIdNumber(privateHints.customerNumber)
      : null;
    if (
      taxOrIdNumber &&
      ((customer.taxId && normalizeIdNumber(customer.taxId) === taxOrIdNumber) ||
        (customer.idNumberNormalized && customer.idNumberNormalized === taxOrIdNumber))
    ) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT],
      );
    }

    if (
      privateHints.bookingLinkCustomerId &&
      privateHints.bookingLinkCustomerId === customer.id
    ) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK],
      );
    }

    if (
      privateHints.documentContextCustomerId &&
      privateHints.documentContextCustomerId === customer.id
    ) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT],
      );
    }

    const email = privateHints.email ? normalizeEmail(privateHints.email) : null;
    if (email && customer.emailNormalized && customer.emailNormalized === email) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT],
      );
    }

    const phone = privateHints.phone ? normalizePhone(privateHints.phone) : null;
    if (
      phone &&
      phone.length >= 6 &&
      customer.phoneNormalized &&
      customer.phoneNormalized === phone
    ) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.PHONE_EXACT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.PHONE_EXACT],
      );
    }

    if (privateHints.customerName && nameMatches(customer, privateHints.customerName)) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT],
      );
    }

    if (addressMatches(customer, privateHints)) {
      pushReason(
        scored,
        customer,
        CUSTOMER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH,
        MATCH_BASE_SCORE[CUSTOMER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH],
      );
    }
  }

  const duplicateNameCustomerIds = collectDuplicateNameCustomerIds(scored);

  const filtered = [...scored.values()].filter((row) => {
    if (duplicateNameCustomerIds.has(row.customerId)) {
      return true;
    }
    const nameOnly =
      row.reasons.length === 1 &&
      row.reasons[0] === CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT;
    const weakNameOnly =
      hasAnyReason(row.reasons, [CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT]) &&
      !hasAnyReason(row.reasons, STRONG_MATCH_REASONS) &&
      !hasAnyReason(row.reasons, [CUSTOMER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH]);
    return !nameOnly && !weakNameOnly;
  });

  return finalizeRankedCustomerCandidates(filtered, duplicateNameCustomerIds);
}

function collectDuplicateNameCustomerIds(
  scored: Map<string, ScoredCustomerCandidate>,
): Set<string> {
  const byNormalizedName = new Map<string, string[]>();

  for (const row of scored.values()) {
    if (!row.reasons.includes(CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT)) {
      continue;
    }
    const normalizedName =
      row.customer.fullNameNormalized ??
      (row.customer.company ? normalizeCompany(row.customer.company) : null);
    if (!normalizedName) {
      continue;
    }
    const existing = byNormalizedName.get(normalizedName) ?? [];
    existing.push(row.customerId);
    byNormalizedName.set(normalizedName, existing);
  }

  const duplicateIds = new Set<string>();
  for (const customerIds of byNormalizedName.values()) {
    if (customerIds.length > 1) {
      customerIds.forEach((customerId) => duplicateIds.add(customerId));
    }
  }
  return duplicateIds;
}

function finalizeRankedCustomerCandidates(
  scored: ScoredCustomerCandidate[],
  duplicateNameCustomerIds: Set<string>,
): CustomerCandidateMatch[] {
  const sorted = scored
    .map((row) => ({
      customerId: row.customerId,
      confidence: Math.min(1, Math.round(row.score * 1000) / 1000),
      matchReasons: sortCustomerReasons(row.reasons),
      conflicts: row.conflicts,
      rank: 0,
      confirmationRequired: true,
      displayLabel: buildDisplayLabel(row.customer),
    }))
    .sort((a, b) => b.confidence - a.confidence || a.customerId.localeCompare(b.customerId));

  const ambiguousNameMatch = duplicateNameCustomerIds.size > 1;
  const multiplePlausible =
    sorted.filter((candidate) => candidate.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD).length > 1;

  return sorted.map((candidate, index) => {
    const nameOnly =
      candidate.matchReasons.length === 1 &&
      candidate.matchReasons[0] === CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT;
    const confidence = nameOnly
      ? Math.min(candidate.confidence, NAME_ONLY_MAX_CONFIDENCE)
      : candidate.confidence;

    const confirmationRequired = true;

    const conflicts = [...candidate.conflicts];
    if (ambiguousNameMatch && candidate.matchReasons.includes(CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT)) {
      conflicts.push({
        code: CUSTOMER_CANDIDATE_CONFLICT_CODES.DUPLICATE_NAME,
        field: 'customerName',
        message: 'Mehrere gleichnamige Kunden — manuelle Auswahl erforderlich',
        severity: 'WARNING',
      });
    }
    if (multiplePlausible) {
      conflicts.push({
        code: CUSTOMER_CANDIDATE_CONFLICT_CODES.MULTIPLE_PLAUSIBLE,
        field: 'customer',
        message: 'Mehrere plausible Kundenkandidaten — keine automatische Zuordnung',
        severity: 'WARNING',
      });
    }

    return {
      ...candidate,
      confidence,
      rank: index + 1,
      confirmationRequired,
      conflicts,
    };
  });
}

function sortCustomerReasons(
  reasons: CustomerCandidateMatchReason[],
): CustomerCandidateMatchReason[] {
  const priority: CustomerCandidateMatchReason[] = [
    CUSTOMER_CANDIDATE_MATCH_REASONS.CUSTOMER_NUMBER_EXACT,
    CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK,
    CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_CONTEXT,
    CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
    CUSTOMER_CANDIDATE_MATCH_REASONS.PHONE_EXACT,
    CUSTOMER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH,
    CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
    CUSTOMER_CANDIDATE_MATCH_REASONS.DOCUMENT_REFERENCE,
  ];
  return [...reasons].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

export function readCustomerCandidatePipelineState(
  plausibility: unknown,
): import('./customer-candidate-resolver.types').CustomerCandidatePipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const customerCandidates = (pipeline as Record<string, unknown>).customerCandidates;
  if (!customerCandidates || typeof customerCandidates !== 'object' || Array.isArray(customerCandidates)) {
    return null;
  }
  return customerCandidates as import('./customer-candidate-resolver.types').CustomerCandidatePipelineState;
}
