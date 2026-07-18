import type { VendorCategory } from '@prisma/client';
import { normalizeEmail, normalizeIdNumber } from '@modules/customers/utils/customer-normalizer.util';
import { readSupplier } from './document-invoice-extraction.rules';
import { readServiceWorkshopName } from './document-service-extraction.rules';
import { readIssuingOrganization } from './document-inspection-extraction.rules';
import {
  PARTNER_CANDIDATE_CONFLICT_CODES,
  PARTNER_CANDIDATE_MATCH_REASONS,
  PARTNER_KIND,
  type PartnerCandidateConflict,
  type PartnerCandidateMatch,
  type PartnerCandidateMatchReason,
  type PartnerCandidateResolverInput,
  type PartnerCandidateSearchRecord,
  type PartnerHistoricalSignals,
  type PartnerKind,
  type PartnerNewSuggestion,
  type PartnerRelationshipContext,
  type PartnerResolverHints,
  type PartnerResolverPrivateHints,
} from './partner-candidate-resolver.types';

const PLAUSIBLE_CONFIDENCE_THRESHOLD = 0.55;
const NAME_ONLY_MAX_CONFIDENCE = 0.45;

const MATCH_BASE_SCORE: Record<PartnerCandidateMatchReason, number> = {
  [PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT]: 0.97,
  [PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT]: 0.95,
  [PARTNER_CANDIDATE_MATCH_REASONS.VAT_ID_EXACT]: 0.94,
  [PARTNER_CANDIDATE_MATCH_REASONS.TAX_ID_EXACT]: 0.93,
  [PARTNER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT]: 0.88,
  [PARTNER_CANDIDATE_MATCH_REASONS.INVOICE_RELATIONSHIP]: 0.75,
  [PARTNER_CANDIDATE_MATCH_REASONS.SERVICE_RELATIONSHIP]: 0.73,
  [PARTNER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH]: 0.7,
  [PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT]: 0.65,
  [PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED]: 0.52,
};

const STRONG_MATCH_REASONS: PartnerCandidateMatchReason[] = [
  PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT,
  PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT,
  PARTNER_CANDIDATE_MATCH_REASONS.VAT_ID_EXACT,
  PARTNER_CANDIDATE_MATCH_REASONS.TAX_ID_EXACT,
  PARTNER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
];

const SUPPLIER_CATEGORIES: VendorCategory[] = ['PARTS_DEALER', 'ONLINE_SUPPLIER'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function normalizePartnerName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIban(value: string): string | null {
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return normalized.length >= 15 ? normalized : null;
}

export function resolveExpectedPartnerKind(documentType: string): PartnerKind {
  if (documentType === 'FINE') return PARTNER_KIND.AUTHORITY;
  if (documentType === 'DAMAGE' || documentType === 'ACCIDENT') return PARTNER_KIND.INSURANCE;
  return PARTNER_KIND.WORKSHOP;
}

export function readPartnerOrganizationName(
  documentType: string,
  data: Record<string, unknown>,
): string | null {
  if (documentType === 'FINE') {
    return toStr(data.issuingAuthority);
  }
  if (documentType === 'INVOICE') {
    return readSupplier(data);
  }
  if (
    documentType === 'SERVICE' ||
    documentType === 'OIL_CHANGE' ||
    documentType === 'TIRE' ||
    documentType === 'BRAKE' ||
    documentType === 'BATTERY'
  ) {
    return readServiceWorkshopName(data);
  }
  if (documentType === 'TUV_REPORT' || documentType === 'BOKRAFT_REPORT') {
    return readIssuingOrganization(data);
  }
  if (documentType === 'DAMAGE' || documentType === 'ACCIDENT') {
    return (
      toStr(data.insurerName) ??
      toStr(data.insuranceCompany) ??
      toStr(data.issuer) ??
      toStr(data.workshopName)
    );
  }
  return (
    readSupplier(data) ??
    readServiceWorkshopName(data) ??
    toStr(data.issuingAuthority) ??
    toStr(data.issuer)
  );
}

export function vendorCategoryToPartnerKind(category: VendorCategory): PartnerKind {
  if (category === 'INSURANCE') return PARTNER_KIND.INSURANCE;
  if (SUPPLIER_CATEGORIES.includes(category)) return PARTNER_KIND.SUPPLIER;
  return PARTNER_KIND.WORKSHOP;
}

export function isPartnerKindAligned(expected: PartnerKind, category: VendorCategory): boolean {
  if (expected === PARTNER_KIND.AUTHORITY) return false;
  const actual = vendorCategoryToPartnerKind(category);
  return actual === expected;
}

function buildPartnerDisplayLabel(name: string, kind: PartnerKind): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const initials = tokens
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase())
    .join('');
  const prefix =
    kind === PARTNER_KIND.AUTHORITY
      ? 'Behörde'
      : kind === PARTNER_KIND.INSURANCE
        ? 'Versicherung'
        : kind === PARTNER_KIND.SUPPLIER
          ? 'Lieferant'
          : 'Werkstatt';
  return `${prefix} ${initials || '?'}`;
}

export function buildPartnerResolverPrivateHints(
  input: PartnerCandidateResolverInput,
): PartnerResolverPrivateHints {
  const data = input.extractedData;
  return {
    organizationName: readPartnerOrganizationName(input.documentType, data),
    iban: toStr(data.iban) ?? toStr(data.supplierIban),
    vatId:
      toStr(data.vatId) ??
      toStr(data.vatNumber) ??
      toStr(data.umsatzsteuerId) ??
      toStr(data.ustId),
    taxId: toStr(data.taxId) ?? toStr(data.taxNumber) ?? toStr(data.steuernummer),
    email: toStr(data.email) ?? toStr(data.supplierEmail) ?? toStr(data.contactEmail),
    addressLine: toStr(data.address) ?? toStr(data.street) ?? toStr(data.supplierAddress),
    city: toStr(data.city),
    postalCode: toStr(data.zip) ?? toStr(data.postalCode),
    vendorId: isUuid(toStr(data.vendorId)) ? toStr(data.vendorId) : null,
  };
}

export function buildPartnerResolverHints(
  privateHints: PartnerResolverPrivateHints,
  expectedPartnerKind: PartnerKind,
): PartnerResolverHints {
  return {
    organizationNamePresent: Boolean(privateHints.organizationName),
    ibanPresent: Boolean(privateHints.iban),
    vatIdPresent: Boolean(privateHints.vatId),
    taxIdPresent: Boolean(privateHints.taxId),
    emailPresent: Boolean(privateHints.email),
    addressPresent: Boolean(privateHints.addressLine || (privateHints.city && privateHints.postalCode)),
    vendorIdPresent: Boolean(privateHints.vendorId),
    expectedPartnerKind,
  };
}

interface ScoredPartnerCandidate {
  vendorId: string;
  vendor: PartnerCandidateSearchRecord;
  reasons: PartnerCandidateMatchReason[];
  conflicts: PartnerCandidateConflict[];
  score: number;
}

function hasAnyReason(
  reasons: PartnerCandidateMatchReason[],
  allowed: PartnerCandidateMatchReason[],
): boolean {
  return reasons.some((reason) => allowed.includes(reason));
}

function pushReason(
  map: Map<string, ScoredPartnerCandidate>,
  vendor: PartnerCandidateSearchRecord,
  reason: PartnerCandidateMatchReason,
  score: number,
) {
  const existing = map.get(vendor.id);
  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.score = Math.max(existing.score, score);
    return;
  }
  map.set(vendor.id, {
    vendorId: vendor.id,
    vendor,
    reasons: [reason],
    conflicts: [],
    score,
  });
}

function addressMatches(
  vendor: PartnerCandidateSearchRecord,
  hints: PartnerResolverPrivateHints,
): boolean {
  const line = hints.addressLine ? normalizePartnerName(hints.addressLine) : null;
  const city = hints.city ? normalizePartnerName(hints.city) : null;
  const zip = hints.postalCode ? hints.postalCode.replace(/\s+/g, '') : null;

  if (line && vendor.street && normalizePartnerName(vendor.street) === line) {
    return true;
  }

  if (city && zip && vendor.city && vendor.postalCode) {
    return (
      normalizePartnerName(vendor.city) === city &&
      vendor.postalCode.replace(/\s+/g, '') === zip
    );
  }

  return false;
}

function applyHistoricalSignals(
  scored: Map<string, ScoredPartnerCandidate>,
  vendors: PartnerCandidateSearchRecord[],
  privateHints: PartnerResolverPrivateHints,
  historicalByVendor: Map<string, PartnerHistoricalSignals>,
) {
  const iban = privateHints.iban ? normalizeIban(privateHints.iban) : null;
  const vatId = privateHints.vatId ? normalizeIdNumber(privateHints.vatId) : null;
  const taxId = privateHints.taxId ? normalizeIdNumber(privateHints.taxId) : null;

  for (const vendor of vendors) {
    const historical = historicalByVendor.get(vendor.id);
    if (!historical) continue;

    if (iban && historical.ibans.has(iban)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT],
      );
    }
    if (vatId && historical.vatIds.has(vatId)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.VAT_ID_EXACT,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.VAT_ID_EXACT],
      );
    }
    if (taxId && historical.taxIds.has(taxId)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.TAX_ID_EXACT,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.TAX_ID_EXACT],
      );
    }
  }
}

export function scorePartnerCandidates(input: {
  vendors: PartnerCandidateSearchRecord[];
  privateHints: PartnerResolverPrivateHints;
  expectedPartnerKind: PartnerKind;
  relationships: PartnerRelationshipContext;
}): PartnerCandidateMatch[] {
  const { vendors, privateHints, expectedPartnerKind, relationships } = input;
  const scored = new Map<string, ScoredPartnerCandidate>();
  const normalizedOcrName = privateHints.organizationName
    ? normalizePartnerName(privateHints.organizationName)
    : null;
  const email = privateHints.email ? normalizeEmail(privateHints.email) : null;

  for (const vendor of vendors) {
    if (privateHints.vendorId && privateHints.vendorId === vendor.id) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT],
      );
    }

    if (email) {
      const vendorEmail = normalizeEmail(vendor.email);
      const contactEmail = normalizeEmail(vendor.contactEmail);
      if ((vendorEmail && vendorEmail === email) || (contactEmail && contactEmail === email)) {
        pushReason(
          scored,
          vendor,
          PARTNER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
          MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT],
        );
      }
    }

    if (relationships.invoiceVendorIds.has(vendor.id)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.INVOICE_RELATIONSHIP,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.INVOICE_RELATIONSHIP],
      );
    }

    if (relationships.serviceVendorIds.has(vendor.id)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.SERVICE_RELATIONSHIP,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.SERVICE_RELATIONSHIP],
      );
    }

    if (normalizedOcrName) {
      const vendorNameNormalized = normalizePartnerName(vendor.name);
      if (vendorNameNormalized === normalizedOcrName) {
        pushReason(
          scored,
          vendor,
          PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
          MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT],
        );
      } else if (
        vendorNameNormalized.includes(normalizedOcrName) ||
        normalizedOcrName.includes(vendorNameNormalized)
      ) {
        const shorter = Math.min(vendorNameNormalized.length, normalizedOcrName.length);
        const longer = Math.max(vendorNameNormalized.length, normalizedOcrName.length);
        if (shorter / longer >= 0.85) {
          pushReason(
            scored,
            vendor,
            PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED,
            MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED],
          );
        }
      }
    }

    if (addressMatches(vendor, privateHints)) {
      pushReason(
        scored,
        vendor,
        PARTNER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH,
        MATCH_BASE_SCORE[PARTNER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH],
      );
    }
  }

  applyHistoricalSignals(scored, vendors, privateHints, relationships.historicalByVendor);

  const duplicateNameVendorIds = collectDuplicateNameVendorIds(scored);

  const filtered = [...scored.values()].filter((row) => {
    if (duplicateNameVendorIds.has(row.vendorId)) {
      return true;
    }
    const nameOnly =
      row.reasons.length === 1 &&
      row.reasons[0] === PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED;
    const weakNameOnly =
      row.reasons.length === 1 &&
      row.reasons[0] === PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED;
    return !nameOnly && !weakNameOnly;
  });

  return finalizeRankedPartnerCandidates(
    filtered,
    expectedPartnerKind,
    duplicateNameVendorIds,
  );
}

function collectDuplicateNameVendorIds(
  scored: Map<string, ScoredPartnerCandidate>,
): Set<string> {
  const byName = new Map<string, string[]>();
  for (const row of scored.values()) {
    if (
      !row.reasons.includes(PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT) &&
      !row.reasons.includes(PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED)
    ) {
      continue;
    }
    const normalized = normalizePartnerName(row.vendor.name);
    const existing = byName.get(normalized) ?? [];
    existing.push(row.vendorId);
    byName.set(normalized, existing);
  }
  const duplicateIds = new Set<string>();
  for (const vendorIds of byName.values()) {
    if (vendorIds.length > 1) {
      vendorIds.forEach((vendorId) => duplicateIds.add(vendorId));
    }
  }
  return duplicateIds;
}

function finalizeRankedPartnerCandidates(
  scored: ScoredPartnerCandidate[],
  expectedPartnerKind: PartnerKind,
  duplicateNameVendorIds: Set<string>,
): PartnerCandidateMatch[] {
  const sorted = scored
    .map((row) => ({
      vendorId: row.vendorId,
      confidence: Math.min(1, Math.round(row.score * 1000) / 1000),
      matchReasons: sortPartnerReasons(row.reasons),
      conflicts: row.conflicts,
      rank: 0,
      confirmationRequired: true,
      displayLabel: buildPartnerDisplayLabel(row.vendor.name, vendorCategoryToPartnerKind(row.vendor.category)),
      partnerKind: vendorCategoryToPartnerKind(row.vendor.category),
      vendorCategory: row.vendor.category,
    }))
    .sort((a, b) => b.confidence - a.confidence || a.vendorId.localeCompare(b.vendorId));

  const multiplePlausible =
    sorted.filter((candidate) => candidate.confidence >= PLAUSIBLE_CONFIDENCE_THRESHOLD).length > 1;
  const ambiguousNameMatch = duplicateNameVendorIds.size > 1;

  return sorted.map((candidate, index) => {
    const nameOnly =
      candidate.matchReasons.length === 1 &&
      (candidate.matchReasons[0] === PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT ||
        candidate.matchReasons[0] === PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED);
    const confidence = nameOnly
      ? Math.min(candidate.confidence, NAME_ONLY_MAX_CONFIDENCE)
      : candidate.confidence;

    const conflicts = [...candidate.conflicts];
    if (!isPartnerKindAligned(expectedPartnerKind, candidate.vendorCategory)) {
      conflicts.push({
        code: PARTNER_CANDIDATE_CONFLICT_CODES.CATEGORY_MISMATCH,
        field: 'partnerKind',
        message:
          expectedPartnerKind === PARTNER_KIND.AUTHORITY
            ? 'Behörde und Werkstatt/Anbieter fachlich getrennt — Kategorie prüfen'
            : 'Partnerkategorie passt nicht zum Dokumentkontext',
        severity: expectedPartnerKind === PARTNER_KIND.AUTHORITY ? 'BLOCKER' : 'WARNING',
      });
    }
    if (ambiguousNameMatch && duplicateNameVendorIds.has(candidate.vendorId)) {
      conflicts.push({
        code: PARTNER_CANDIDATE_CONFLICT_CODES.DUPLICATE_NAME,
        field: 'organizationName',
        message: 'Mehrere gleichnamige Anbieter — manuelle Auswahl erforderlich',
        severity: 'WARNING',
      });
    }
    if (multiplePlausible) {
      conflicts.push({
        code: PARTNER_CANDIDATE_CONFLICT_CODES.MULTIPLE_PLAUSIBLE,
        field: 'partner',
        message: 'Mehrere plausible Partnerkandidaten — keine automatische Zuordnung',
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

export function buildNewPartnerSuggestion(input: {
  privateHints: PartnerResolverPrivateHints;
  expectedPartnerKind: PartnerKind;
  documentType: string;
  candidates: PartnerCandidateMatch[];
}): PartnerNewSuggestion | null {
  if (input.candidates.length > 0) return null;
  if (!input.privateHints.organizationName) return null;

  const sourceField =
    input.documentType === 'FINE'
      ? 'issuingAuthority'
      : input.documentType === 'INVOICE'
        ? 'supplier'
        : 'organizationName';

  return {
    partnerKind: input.expectedPartnerKind,
    confirmationRequired: true,
    displayLabel: buildPartnerDisplayLabel(
      input.privateHints.organizationName,
      input.expectedPartnerKind,
    ),
    sourceField,
  };
}

function sortPartnerReasons(
  reasons: PartnerCandidateMatchReason[],
): PartnerCandidateMatchReason[] {
  const priority: PartnerCandidateMatchReason[] = [
    PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.VAT_ID_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.TAX_ID_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.INVOICE_RELATIONSHIP,
    PARTNER_CANDIDATE_MATCH_REASONS.SERVICE_RELATIONSHIP,
    PARTNER_CANDIDATE_MATCH_REASONS.ADDRESS_MATCH,
    PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
    PARTNER_CANDIDATE_MATCH_REASONS.NAME_NORMALIZED,
  ];
  return [...reasons].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

export function readPartnerCandidatePipelineState(
  plausibility: unknown,
): import('./partner-candidate-resolver.types').PartnerCandidatePipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const partnerCandidates = (pipeline as Record<string, unknown>).partnerCandidates;
  if (!partnerCandidates || typeof partnerCandidates !== 'object' || Array.isArray(partnerCandidates)) {
    return null;
  }
  return partnerCandidates as import('./partner-candidate-resolver.types').PartnerCandidatePipelineState;
}

export function extractHistoricalSignalsFromInvoiceData(
  extractedData: unknown,
): { iban: string | null; vatId: string | null; taxId: string | null } {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return { iban: null, vatId: null, taxId: null };
  }
  const data = extractedData as Record<string, unknown>;
  const ibanRaw = toStr(data.iban) ?? toStr(data.supplierIban);
  const vatRaw =
    toStr(data.vatId) ?? toStr(data.vatNumber) ?? toStr(data.umsatzsteuerId) ?? toStr(data.ustId);
  const taxRaw = toStr(data.taxId) ?? toStr(data.taxNumber) ?? toStr(data.steuernummer);
  return {
    iban: ibanRaw ? normalizeIban(ibanRaw) : null,
    vatId: vatRaw ? normalizeIdNumber(vatRaw) : null,
    taxId: taxRaw ? normalizeIdNumber(taxRaw) : null,
  };
}
