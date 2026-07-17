import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import type { DocumentClassificationLlmResponse } from '@modules/ai/documents/document-classification.types';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SUBTYPES,
  DOCUMENT_TAXONOMY_VERSION,
  type DocumentCategory,
  type DocumentSubtype,
} from './document-taxonomy.types';
import {
  normalizeDocumentCategoryToken,
  normalizeDocumentSubtype,
  resolveDocumentTaxonomy,
  resolveLegacyDocumentTypeFromTaxonomy,
} from './document-taxonomy.util';
import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import { isApplyDocumentType } from './document-extraction.schemas';
import type {
  ClassificationAlternativeCandidate,
  ClassificationDetectedIdentifier,
  ClassificationIdentifierType,
  DocumentClassificationContract,
} from './document-classification-contract.types';
import {
  CLASSIFICATION_IDENTIFIER_TYPES,
  DOCUMENT_CLASSIFICATION_CONTRACT_VERSION,
} from './document-classification-contract.types';

const GENERAL_CORRESPONDENCE_SUBTYPES = new Set<DocumentSubtype>([
  'CUSTOMER_CORRESPONDENCE',
  'INSURANCE_LETTER',
  'DRIVER_DOCUMENT',
  'OTHER',
]);

const CORRESPONDENCE_RATIONALE_PATTERN =
  /\b(letter|correspondence|kundenbrief|anschreiben|mitteilung|schreiben|addressee|recipient)\b/i;

const WORKSHOP_EVIDENCE_PATTERN =
  /\b(workshop|wartung|service|inspection|ölwechsel|maintenance|werkstatt|prüfbericht|rechnung)\b/i;

const ALTERNATIVE_COMPETITION_GAP = 0.15;
const ALTERNATIVE_COMPETITION_MIN = 0.55;

export function normalizeClassificationCategory(
  value: string | null | undefined,
): DocumentCategory | null {
  return normalizeDocumentCategoryToken(value);
}

export function normalizeClassificationSubtype(
  value: string | null | undefined,
): DocumentSubtype | null {
  return normalizeDocumentSubtype(value);
}

export function sanitizeDetectedIdentifierValue(
  identifierType: ClassificationIdentifierType,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (identifierType === 'license_plate') {
    const compact = trimmed.replace(/\s+/g, ' ').toUpperCase();
    if (compact.length <= 4) return compact;
    return `${compact.slice(0, 2)}***${compact.slice(-2)}`;
  }

  if (identifierType === 'vin' && trimmed.length > 6) {
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
  }

  if (identifierType === 'iban' && trimmed.length > 8) {
    return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
  }

  if (identifierType === 'tax_id' && trimmed.length > 6) {
    return `${trimmed.slice(0, 3)}…${trimmed.slice(-2)}`;
  }

  if (trimmed.length > 24) {
    return `${trimmed.slice(0, 10)}…${trimmed.slice(-4)}`;
  }

  return trimmed;
}

export function sanitizeDetectedIdentifiers(
  raw: unknown,
  maxPage: number | null,
): ClassificationDetectedIdentifier[] {
  if (!Array.isArray(raw)) return [];

  const identifiers: ClassificationDetectedIdentifier[] = [];
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const identifierTypeRaw = typeof row.identifierType === 'string' ? row.identifierType : 'other';
    const identifierType = (CLASSIFICATION_IDENTIFIER_TYPES as readonly string[]).includes(
      identifierTypeRaw,
    )
      ? (identifierTypeRaw as ClassificationIdentifierType)
      : 'other';
    const value =
      typeof row.value === 'string'
        ? sanitizeDetectedIdentifierValue(identifierType, row.value)
        : '';
    if (!value) continue;
    const evidencePage =
      typeof row.evidencePage === 'number' && Number.isInteger(row.evidencePage) && row.evidencePage >= 1
        ? maxPage == null || row.evidencePage <= maxPage
          ? row.evidencePage
          : null
        : null;
    identifiers.push({ identifierType, value, evidencePage });
  }
  return identifiers;
}

export function normalizeClassificationAlternatives(
  raw: unknown,
  allowed: ReadonlySet<ApplyDocumentExtractionType>,
): ClassificationAlternativeCandidate[] {
  if (!Array.isArray(raw)) return [];

  const alternatives: ClassificationAlternativeCandidate[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const category = normalizeClassificationCategory(
      typeof row.documentCategory === 'string' ? row.documentCategory : null,
    );
    const subtype = normalizeClassificationSubtype(
      typeof row.documentSubtype === 'string' ? row.documentSubtype : null,
    );
    if (!category || !subtype) continue;
    const confidence =
      typeof row.confidence === 'number' && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0;
    const legacyDocumentType = resolveLegacyDocumentTypeFromTaxonomy(category, subtype);
    if (!allowed.has(legacyDocumentType)) continue;
    alternatives.push({
      category,
      subtype,
      confidence,
      legacyDocumentType,
      rationale:
        typeof row.rationale === 'string'
          ? row.rationale.replace(/[\r\n]+/g, ' ').trim().slice(0, 240)
          : null,
    });
  }

  return alternatives.sort((a, b) => b.confidence - a.confidence);
}

export function isUnclearClassificationSubtype(
  subtype: DocumentSubtype | null,
  confidence: number,
  suggestionMinConfidence: number,
): boolean {
  if (!subtype) return true;
  if (subtype === 'OTHER' && confidence < suggestionMinConfidence) return true;
  return false;
}

export function isGeneralCorrespondenceForcedAsService(input: {
  category: DocumentCategory | null;
  subtype: DocumentSubtype | null;
  legacyDocumentType: ApplyDocumentExtractionType | null;
  rationale: string;
  alternatives: ClassificationAlternativeCandidate[];
}): boolean {
  const primaryLooksGeneral =
    (input.category === 'CUSTOMER' ||
      input.category === 'GENERAL' ||
      input.category === 'DRIVER' ||
      input.category === 'INSURANCE') &&
    input.subtype != null &&
    GENERAL_CORRESPONDENCE_SUBTYPES.has(input.subtype);

  if (primaryLooksGeneral) return false;

  const forcedServicePrimary =
    input.subtype === 'SERVICE_REPORT' || input.legacyDocumentType === 'SERVICE';

  if (!forcedServicePrimary) return false;

  const correspondenceAlternative = input.alternatives.find(
    (row) =>
      GENERAL_CORRESPONDENCE_SUBTYPES.has(row.subtype) &&
      row.confidence >= ALTERNATIVE_COMPETITION_MIN,
  );
  if (correspondenceAlternative) return true;

  return (
    CORRESPONDENCE_RATIONALE_PATTERN.test(input.rationale) &&
    !WORKSHOP_EVIDENCE_PATTERN.test(input.rationale)
  );
}

export function hasCompetingAlternativeCandidates(
  confidence: number,
  alternatives: ClassificationAlternativeCandidate[],
  primarySubtype: DocumentSubtype | null,
): boolean {
  if (alternatives.length === 0 || !primarySubtype) return false;
  const top = alternatives[0];
  if (top.subtype === primarySubtype) return false;
  if (top.confidence < ALTERNATIVE_COMPETITION_MIN) return false;
  return confidence - top.confidence <= ALTERNATIVE_COMPETITION_GAP;
}

export function buildDocumentClassificationContract(input: {
  raw: DocumentClassificationLlmResponse | null | undefined;
  allowed: readonly ApplyDocumentExtractionType[];
  maxPage: number | null;
  modelVersion: string | null;
}): DocumentClassificationContract {
  const allowedSet = new Set(input.allowed);
  const category = normalizeClassificationCategory(input.raw?.documentCategory);
  const subtype = normalizeClassificationSubtype(input.raw?.documentSubtype);
  const alternatives = normalizeClassificationAlternatives(input.raw?.alternatives, allowedSet);

  let legacyDocumentType: ApplyDocumentExtractionType | null = null;
  let detectedDocumentType: ApplyDocumentExtractionType | typeof CLASSIFICATION_UNKNOWN =
    CLASSIFICATION_UNKNOWN;

  if (category && subtype) {
    legacyDocumentType = resolveLegacyDocumentTypeFromTaxonomy(category, subtype);
    if (allowedSet.has(legacyDocumentType)) {
      detectedDocumentType = legacyDocumentType;
    }
  }

  const legacyFromModel = input.raw?.detectedDocumentType;
  if (
    legacyFromModel &&
    legacyFromModel !== CLASSIFICATION_UNKNOWN &&
    isApplyDocumentType(legacyFromModel) &&
    allowedSet.has(legacyFromModel)
  ) {
    if (detectedDocumentType === CLASSIFICATION_UNKNOWN) {
      detectedDocumentType = legacyFromModel;
      legacyDocumentType = legacyFromModel;
    }
    const taxonomy = resolveDocumentTaxonomy({
      legacyDocumentType: legacyFromModel,
      documentSubtype: subtype,
      source: 'classification',
    });
    if (!category) {
      return buildDocumentClassificationContract({
        raw: {
          ...input.raw,
          documentCategory: taxonomy.documentCategory,
          documentSubtype: taxonomy.documentSubtype,
          detectedDocumentType: legacyFromModel,
          confidence: input.raw?.confidence ?? 0,
          rationale: input.raw?.rationale ?? '',
          sourcePages: input.raw?.sourcePages ?? null,
        },
        allowed: input.allowed,
        maxPage: input.maxPage,
        modelVersion: input.modelVersion,
      });
    }
  }

  const confidence =
    typeof input.raw?.confidence === 'number' && Number.isFinite(input.raw.confidence)
      ? Math.min(1, Math.max(0, input.raw.confidence))
      : 0;

  const rationale =
    typeof input.raw?.rationale === 'string'
      ? input.raw.rationale.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
      : '';

  const evidencePages = Array.isArray(input.raw?.sourcePages)
    ? input.raw!.sourcePages.filter(
        (page): page is number =>
          typeof page === 'number' &&
          Number.isInteger(page) &&
          page >= 1 &&
          (input.maxPage == null || page <= input.maxPage),
      )
    : [];

  return {
    contractVersion: DOCUMENT_CLASSIFICATION_CONTRACT_VERSION,
    category,
    subtype,
    confidence,
    alternatives,
    rationale,
    evidencePages,
    detectedIdentifiers: sanitizeDetectedIdentifiers(input.raw?.detectedIdentifiers, input.maxPage),
    modelVersion: input.modelVersion,
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    legacyDocumentType,
    detectedDocumentType,
  };
}

export function listClassificationTaxonomyOptions(): {
  categories: readonly DocumentCategory[];
  subtypes: readonly DocumentSubtype[];
} {
  return { categories: DOCUMENT_CATEGORIES, subtypes: DOCUMENT_SUBTYPES };
}
