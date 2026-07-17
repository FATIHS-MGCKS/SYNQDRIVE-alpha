import type { PublicDocumentExtraction } from './document-extraction.types';
import type { TranslationKey } from '../i18n/translations/en';

export type ClassificationConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

export type DocumentClassificationAlternative = {
  category: string;
  subtype: string;
  legacyDocumentType: string;
  confidence: number;
  rationale?: string | null;
};

export type DocumentClassificationResultView = {
  category: string | null;
  subtype: string | null;
  legacyDocumentType: string | null;
  confidence: number | null;
  confidenceBand: ClassificationConfidenceBand;
  rationale: string | null;
  recognitionReasonKeys: TranslationKey[];
  alternatives: DocumentClassificationAlternative[];
  detectedIdentifiers: Array<{ identifierType: string; value: string; evidencePage?: number | null }>;
  modelVersion: string | null;
  contractVersion: string | null;
  decisionAction: 'AUTO_CONTINUE' | 'AWAIT_USER' | null;
  isUncertain: boolean;
  hasSuggestion: boolean;
};

type StoredClassification = {
  contractVersion?: string;
  category?: string | null;
  subtype?: string | null;
  documentCategory?: string | null;
  documentSubtype?: string | null;
  confidence?: number | null;
  alternatives?: unknown;
  rationale?: string | null;
  detectedIdentifiers?: unknown;
  modelVersion?: string | null;
  model?: string | null;
  legacyDocumentType?: string | null;
  detectedDocumentType?: string | null;
  decisionAction?: string | null;
  hasSuggestion?: boolean;
};

const IDENTIFIER_REASON_KEYS: Record<string, TranslationKey> = {
  fine_number: 'docUpload.classificationReason.fineNumber',
  reference_number: 'docUpload.classificationReason.referenceNumber',
  license_plate: 'docUpload.classificationReason.licensePlate',
  invoice_number: 'docUpload.classificationReason.invoiceNumber',
  vin: 'docUpload.classificationReason.vin',
  customer_number: 'docUpload.classificationReason.customerNumber',
  tax_id: 'docUpload.classificationReason.taxId',
  iban: 'docUpload.classificationReason.iban',
  booking_reference: 'docUpload.classificationReason.bookingReference',
};

const RATIONALE_REASON_PATTERNS: Array<{ pattern: RegExp; key: TranslationKey }> = [
  { pattern: /\b(authority|behörde|behörde|ordnungsamt|amt|penalty notice)\b/i, key: 'docUpload.classificationReason.authority' },
  { pattern: /\b(offense|tatzeit|tatdatum|violation|verstoß|verstoss)\b/i, key: 'docUpload.classificationReason.offenseDate' },
  { pattern: /\b(workshop|wartung|service|maintenance|werkstatt|inspection)\b/i, key: 'docUpload.classificationReason.workshopService' },
  { pattern: /\b(invoice|rechnung|credit note|gutschrift|mahnung|reminder)\b/i, key: 'docUpload.classificationReason.invoiceStructure' },
  { pattern: /\b(damage|schaden|accident|unfall)\b/i, key: 'docUpload.classificationReason.damageAccident' },
  { pattern: /\b(insurance|versicherung)\b/i, key: 'docUpload.classificationReason.insurance' },
  { pattern: /\b(correspondence|letter|anschreiben|mitteilung|schreiben)\b/i, key: 'docUpload.classificationReason.correspondence' },
];

const AUTHORITY_SUBTYPES = new Set(['FINE_NOTICE', 'DRIVER_IDENTIFICATION_REQUEST']);

const HIGH_CONFIDENCE = 0.85;
const MEDIUM_CONFIDENCE = 0.65;
const ALTERNATIVE_COMPETITION_GAP = 0.15;
const ALTERNATIVE_COMPETITION_MIN = 0.55;

function readStoredClassification(plausibility: unknown): StoredClassification | null {
  if (!plausibility || typeof plausibility !== 'object') return null;
  const classification = (plausibility as Record<string, unknown>).classification;
  if (!classification || typeof classification !== 'object') return null;
  return classification as StoredClassification;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value > 1) return Math.min(100, Math.max(0, value)) / 100;
  return Math.min(1, Math.max(0, value));
}

export function resolveClassificationConfidenceBand(
  confidence: number | null,
): ClassificationConfidenceBand {
  if (confidence == null) return 'unknown';
  if (confidence >= HIGH_CONFIDENCE) return 'high';
  if (confidence >= MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

function parseAlternatives(raw: unknown): DocumentClassificationAlternative[] {
  if (!Array.isArray(raw)) return [];
  const rows: DocumentClassificationAlternative[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const category =
      (typeof row.category === 'string' ? row.category : null) ??
      (typeof row.documentCategory === 'string' ? row.documentCategory : null);
    const subtype =
      (typeof row.subtype === 'string' ? row.subtype : null) ??
      (typeof row.documentSubtype === 'string' ? row.documentSubtype : null);
    const legacyDocumentType =
      (typeof row.legacyDocumentType === 'string' ? row.legacyDocumentType : null) ??
      (typeof row.detectedDocumentType === 'string' ? row.detectedDocumentType : null);
    const confidence = normalizeConfidence(row.confidence) ?? 0;
    if (!category || !subtype || !legacyDocumentType) continue;
    rows.push({
      category,
      subtype,
      legacyDocumentType,
      confidence,
      rationale: typeof row.rationale === 'string' ? row.rationale : null,
    });
  }
  return rows.sort((a, b) => b.confidence - a.confidence);
}

function parseDetectedIdentifiers(raw: unknown): DocumentClassificationResultView['detectedIdentifiers'] {
  if (!Array.isArray(raw)) return [];
  const rows: DocumentClassificationResultView['detectedIdentifiers'] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const identifierType = typeof row.identifierType === 'string' ? row.identifierType : 'other';
    const value = typeof row.value === 'string' ? row.value.trim() : '';
    if (!value) continue;
    const evidencePage =
      typeof row.evidencePage === 'number' && Number.isInteger(row.evidencePage) && row.evidencePage >= 1
        ? row.evidencePage
        : null;
    rows.push({ identifierType, value, evidencePage });
  }
  return rows;
}

function hasCompetingAlternative(
  confidence: number | null,
  subtype: string | null,
  alternatives: DocumentClassificationAlternative[],
): boolean {
  if (!subtype || confidence == null || alternatives.length === 0) return false;
  const top = alternatives[0];
  if (top.subtype === subtype) return false;
  if (top.confidence < ALTERNATIVE_COMPETITION_MIN) return false;
  return confidence - top.confidence <= ALTERNATIVE_COMPETITION_GAP;
}

export function buildRecognitionReasonKeys(input: {
  category: string | null;
  subtype: string | null;
  rationale: string | null;
  detectedIdentifiers: DocumentClassificationResultView['detectedIdentifiers'];
}): TranslationKey[] {
  const keys: TranslationKey[] = [];
  const seen = new Set<string>();

  const push = (key: TranslationKey) => {
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  for (const identifier of input.detectedIdentifiers) {
    const mapped = IDENTIFIER_REASON_KEYS[identifier.identifierType];
    if (mapped) push(mapped);
  }

  if (input.category === 'AUTHORITY' && input.subtype && AUTHORITY_SUBTYPES.has(input.subtype)) {
    push('docUpload.classificationReason.authority');
  }

  const rationale = input.rationale?.trim() ?? '';
  if (rationale) {
    for (const entry of RATIONALE_REASON_PATTERNS) {
      if (entry.pattern.test(rationale)) push(entry.key);
    }
  }

  if (keys.length === 0 && rationale) {
    push('docUpload.classificationReason.documentStructure');
  }

  return keys.slice(0, 5);
}

export function parseDocumentClassificationResult(
  record: Pick<
    PublicDocumentExtraction,
    | 'plausibility'
    | 'documentCategory'
    | 'documentSubtype'
    | 'classificationConfidence'
    | 'detectedDocumentType'
    | 'effectiveDocumentType'
    | 'documentType'
    | 'classificationMode'
  > | null,
): DocumentClassificationResultView | null {
  if (!record) return null;

  const stored = readStoredClassification(record.plausibility);
  const category =
    stored?.category ??
    stored?.documentCategory ??
    record.documentCategory ??
    null;
  const subtype =
    stored?.subtype ??
    stored?.documentSubtype ??
    record.documentSubtype ??
    null;
  const confidence =
    normalizeConfidence(stored?.confidence) ??
    normalizeConfidence(record.classificationConfidence);
  const legacyDocumentType =
    stored?.legacyDocumentType ??
    stored?.detectedDocumentType ??
    record.effectiveDocumentType ??
    record.documentType ??
    record.detectedDocumentType ??
    null;
  const rationale = typeof stored?.rationale === 'string' ? stored.rationale.trim() : null;
  const alternatives = parseAlternatives(stored?.alternatives);
  const detectedIdentifiers = parseDetectedIdentifiers(stored?.detectedIdentifiers);
  const confidenceBand = resolveClassificationConfidenceBand(confidence);
  const decisionAction =
    stored?.decisionAction === 'AUTO_CONTINUE' || stored?.decisionAction === 'AWAIT_USER'
      ? stored.decisionAction
      : null;
  const hasSuggestion = stored?.hasSuggestion === true || Boolean(legacyDocumentType && legacyDocumentType !== 'UNKNOWN');
  const competing = hasCompetingAlternative(confidence, subtype, alternatives);
  const isUncertain =
    decisionAction === 'AWAIT_USER' ||
    confidenceBand === 'low' ||
    competing ||
    (subtype === 'OTHER' && (confidence ?? 0) < HIGH_CONFIDENCE) ||
    !subtype;

  if (!hasSuggestion && record.classificationMode !== 'AUTO' && !category && !subtype) {
    return null;
  }

  return {
    category,
    subtype,
    legacyDocumentType,
    confidence,
    confidenceBand,
    rationale,
    recognitionReasonKeys: buildRecognitionReasonKeys({
      category,
      subtype,
      rationale,
      detectedIdentifiers,
    }),
    alternatives,
    detectedIdentifiers,
    modelVersion: stored?.modelVersion ?? stored?.model ?? null,
    contractVersion: stored?.contractVersion ?? null,
    decisionAction,
    isUncertain,
    hasSuggestion,
  };
}

export function formatRecognitionReasonList(
  keys: TranslationKey[],
  t: (key: TranslationKey) => string,
  locale: string,
): string {
  if (keys.length === 0) return '';
  const labels = keys.map((key) => t(key));
  if (labels.length === 1) return labels[0];
  if (locale.startsWith('de')) {
    if (labels.length === 2) return `${labels[0]} und ${labels[1]}`;
    return `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`;
  }
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function resolveClassificationDisplayLabel(input: {
  subtype: string | null;
  legacyDocumentType: string | null;
  typeLabel: (labelKey: string, fallback?: string) => string;
}): string {
  if (input.subtype) {
    const subtypeKey = `documentExtraction.subtype.${input.subtype}`;
    const subtypeLabel = input.typeLabel(subtypeKey, input.subtype);
    if (subtypeLabel !== subtypeKey) return subtypeLabel;
  }
  const legacy = input.legacyDocumentType ?? 'OTHER';
  return input.typeLabel(`documentExtraction.type.${legacy}`, legacy);
}
