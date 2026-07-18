import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const ARCHIVE_DOCUMENT_TYPES = {
  OTHER: 'OTHER',
  VEHICLE_CONDITION: 'VEHICLE_CONDITION',
} as const;

export type ArchiveDocumentType =
  (typeof ARCHIVE_DOCUMENT_TYPES)[keyof typeof ARCHIVE_DOCUMENT_TYPES];

export const ARCHIVE_SUBTYPES = [
  'AUTHORITY_LETTER',
  'INSURANCE_LETTER',
  'CUSTOMER_CORRESPONDENCE',
  'DRIVER_DOCUMENT',
  'PAYMENT_PROOF',
  'WORKSHOP_REPORT',
  'EXPERT_REPORT',
  'GENERAL_EVIDENCE',
  'CONTRACT_DOCUMENT',
  'UNKNOWN',
] as const;

export type ArchiveSubtype = (typeof ARCHIVE_SUBTYPES)[number];

const ARCHIVE_SUBTYPE_ALIASES: Record<string, ArchiveSubtype> = {
  AUTHORITY_LETTER: 'AUTHORITY_LETTER',
  BEHOERDE: 'AUTHORITY_LETTER',
  AUTHORITY: 'AUTHORITY_LETTER',
  INSURANCE_LETTER: 'INSURANCE_LETTER',
  INSURANCE: 'INSURANCE_LETTER',
  VERSICHERUNG: 'INSURANCE_LETTER',
  CUSTOMER_CORRESPONDENCE: 'CUSTOMER_CORRESPONDENCE',
  CUSTOMER_LETTER: 'CUSTOMER_CORRESPONDENCE',
  KUNDENKORRESPONDENZ: 'CUSTOMER_CORRESPONDENCE',
  DRIVER_DOCUMENT: 'DRIVER_DOCUMENT',
  DRIVER_LICENSE: 'DRIVER_DOCUMENT',
  FAHRER: 'DRIVER_DOCUMENT',
  PAYMENT_PROOF: 'PAYMENT_PROOF',
  PAYMENT_RECEIPT: 'PAYMENT_PROOF',
  ZAHLUNGSNACHWEIS: 'PAYMENT_PROOF',
  WORKSHOP_REPORT: 'WORKSHOP_REPORT',
  WERKSTATTBERICHT: 'WORKSHOP_REPORT',
  EXPERT_REPORT: 'EXPERT_REPORT',
  GUTACHTEN: 'EXPERT_REPORT',
  EXPERT: 'EXPERT_REPORT',
  GENERAL_EVIDENCE: 'GENERAL_EVIDENCE',
  EVIDENCE: 'GENERAL_EVIDENCE',
  NACHWEIS: 'GENERAL_EVIDENCE',
  CONTRACT_DOCUMENT: 'CONTRACT_DOCUMENT',
  CONTRACT: 'CONTRACT_DOCUMENT',
  VERTRAG: 'CONTRACT_DOCUMENT',
  UNKNOWN: 'UNKNOWN',
  UNCLEAR: 'UNKNOWN',
};

const PII_SENSITIVE_SUBTYPES = new Set<ArchiveSubtype>([
  'DRIVER_DOCUMENT',
  'CUSTOMER_CORRESPONDENCE',
]);

const ALLOWED_ENTITY_TYPES = new Set([
  'vehicle',
  'booking',
  'customer',
  'damage',
  'invoice',
  'fine',
  'task',
  'handover',
  'insurance',
  'vendor',
  'contract',
  'other',
]);

export type ArchiveEntityLinkSuggestion = {
  entityType: string;
  label: string | null;
  explicitId: string | null;
  source: 'MENTIONED';
};

export type ArchiveDeadlineSuggestion = {
  label: string;
  date: string;
  suggestionOnly: true;
};

export type ArchiveApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type ArchiveApplyGateResult = {
  canArchive: boolean;
  canApplyDomain: false;
  archiveSubtype: ArchiveSubtype;
  blockers: ArchiveApplyGateBlocker[];
  entityLinkSuggestions: ArchiveEntityLinkSuggestion[];
  deadlineSuggestions: ArchiveDeadlineSuggestion[];
};

export type ArchiveApplyPayload = {
  archiveSubtype: ArchiveSubtype;
  sender: string | null;
  recipient: string | null;
  documentDate: Date | null;
  referenceNumber: string | null;
  subject: string | null;
  summary: string | null;
  actionRequired: string | null;
  entityLinkSuggestions: ArchiveEntityLinkSuggestion[];
  deadlineSuggestions: ArchiveDeadlineSuggestion[];
};

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toDate(value: unknown): Date | null {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const raw = toStr(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw
      .split(/[;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
  }
}

export function isArchiveDocumentType(
  documentType: string | null | undefined,
): documentType is ArchiveDocumentType {
  return (
    documentType === ARCHIVE_DOCUMENT_TYPES.OTHER ||
    documentType === ARCHIVE_DOCUMENT_TYPES.VEHICLE_CONDITION
  );
}

export function resolveArchiveSubtype(data: Record<string, unknown>): ArchiveSubtype {
  const raw =
    normalizeToken(toStr(data.archiveSubtype)) ||
    normalizeToken(toStr(data.documentKind)) ||
    normalizeToken(toStr(data.documentSubtype));
  if (!raw) return 'UNKNOWN';
  return ARCHIVE_SUBTYPE_ALIASES[raw] ?? 'UNKNOWN';
}

export function readSender(data: Record<string, unknown>): string | null {
  return toStr(data.sender) ?? toStr(data.from) ?? toStr(data.issuer);
}

export function readRecipient(data: Record<string, unknown>): string | null {
  return toStr(data.recipient) ?? toStr(data.to) ?? toStr(data.addressee);
}

export function readDocumentDate(data: Record<string, unknown>): string | null {
  return toStr(data.documentDate) ?? toStr(data.eventDate) ?? toStr(data.letterDate);
}

export function readReferenceNumber(data: Record<string, unknown>): string | null {
  return (
    toStr(data.referenceNumber) ??
    toStr(data.reportNumber) ??
    toStr(data.caseNumber) ??
    toStr(data.fileNumber)
  );
}

export function readSubject(data: Record<string, unknown>): string | null {
  return toStr(data.subject) ?? toStr(data.title);
}

export function readSummary(data: Record<string, unknown>): string | null {
  return toStr(data.summary) ?? toStr(data.description);
}

export function readActionRequired(data: Record<string, unknown>): string | null {
  return toStr(data.actionRequired) ?? toStr(data.requiredAction);
}

export function readDeadlinesRaw(data: Record<string, unknown>): unknown[] {
  return parseJsonArray(data.deadlines ?? data.deadlineItems);
}

export function readMentionedEntitiesRaw(data: Record<string, unknown>): unknown[] {
  return parseJsonArray(data.mentionedEntities ?? data.entityMentions);
}

export function buildDeadlineSuggestions(
  data: Record<string, unknown>,
): ArchiveDeadlineSuggestion[] {
  const suggestions: ArchiveDeadlineSuggestion[] = [];
  for (const item of readDeadlinesRaw(data)) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const date = toStr(row.date) ?? toStr(row.deadline) ?? toStr(row.dueDate);
    if (!date) continue;
    suggestions.push({
      label: toStr(row.label) ?? toStr(row.kind) ?? 'Deadline',
      date,
      suggestionOnly: true,
    });
  }

  const singleDeadline = toStr(data.deadline) ?? toStr(data.replyBy) ?? toStr(data.dueDate);
  if (singleDeadline && suggestions.length === 0) {
    suggestions.push({
      label: 'Deadline',
      date: singleDeadline,
      suggestionOnly: true,
    });
  }

  return suggestions;
}

export function buildEntityLinkSuggestions(
  data: Record<string, unknown>,
): ArchiveEntityLinkSuggestion[] {
  const suggestions: ArchiveEntityLinkSuggestion[] = [];
  for (const item of readMentionedEntitiesRaw(data)) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const label = item.trim();
      if (!label) continue;
      suggestions.push({
        entityType: 'other',
        label,
        explicitId: null,
        source: 'MENTIONED',
      });
      continue;
    }
    if (typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const entityType = normalizeToken(toStr(row.entityType) ?? toStr(row.type)).toLowerCase();
    const normalizedType = ALLOWED_ENTITY_TYPES.has(entityType) ? entityType : 'other';
    const label = toStr(row.label) ?? toStr(row.name) ?? toStr(row.reference);
    const explicitId = toStr(row.id) ?? toStr(row.entityId);
    if (!label && !explicitId) continue;
    suggestions.push({
      entityType: normalizedType,
      label,
      explicitId,
      source: 'MENTIONED',
    });
  }
  return suggestions;
}

export function hasMinimalArchiveMetadata(data: Record<string, unknown>): boolean {
  return Boolean(
    readSummary(data) ||
      readSubject(data) ||
      readReferenceNumber(data) ||
      readSender(data) ||
      readDocumentDate(data),
  );
}

export function containsPersonalDataRisk(data: Record<string, unknown>): boolean {
  const subtype = resolveArchiveSubtype(data);
  if (!PII_SENSITIVE_SUBTYPES.has(subtype)) return false;
  const recipient = readRecipient(data) ?? '';
  const sender = readSender(data) ?? '';
  const combined = `${recipient} ${sender}`.toLowerCase();
  return /@/.test(combined) || /\b(herr|frau|mr|mrs|dr)\b/.test(combined);
}

export function hasInventedEntityLinkAttempt(data: Record<string, unknown>): boolean {
  return buildEntityLinkSuggestions(data).some(
    (row) =>
      row.explicitId != null &&
      row.explicitId.length > 0 &&
      !row.label &&
      row.entityType !== 'other',
  );
}

export function collectArchivePlausibilityChecks(
  documentType: ArchiveDocumentType,
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const subtype = resolveArchiveSubtype(fields);

  if (subtype === 'UNKNOWN') {
    checks.push({
      code: 'ARCHIVE_SUBTYPE_UNKNOWN',
      status: 'WARNING',
      message: 'Archive subtype is unknown — manual classification required.',
      source: 'DOCUMENT',
    });
  }

  if (!hasMinimalArchiveMetadata(fields)) {
    checks.push({
      code: 'ARCHIVE_MINIMAL_METADATA_MISSING',
      status: 'WARNING',
      message: 'Archive document lacks summary, subject, reference, sender, or date.',
      source: 'DOCUMENT',
    });
  }

  if (containsPersonalDataRisk(fields)) {
    checks.push({
      code: 'ARCHIVE_PII_MINIMIZE',
      status: 'WARNING',
      message: 'Sensitive correspondence — minimize personal identifiers in stored fields.',
      source: 'SYSTEM',
    });
  }

  if (hasInventedEntityLinkAttempt(fields)) {
    checks.push({
      code: 'ARCHIVE_ENTITY_LINK_UNCONFIRMED',
      status: 'WARNING',
      message: 'Entity link has an ID without explicit label — confirm before linking.',
      source: 'DOCUMENT',
    });
  }

  const deadlines = buildDeadlineSuggestions(fields);
  if (deadlines.length > 0) {
    checks.push({
      code: 'ARCHIVE_DEADLINE_SUGGESTION_ONLY',
      status: 'WARNING',
      message: 'Deadlines are suggestions only — no automatic task or outreach is created.',
      source: 'SYSTEM',
    });
  }

  checks.push({
    code: 'ARCHIVE_NO_DOMAIN_APPLY',
    status: 'WARNING',
    message: `${documentType} documents archive only — no domain objects are created automatically.`,
    source: 'SYSTEM',
  });

  checks.push({
    code: 'ARCHIVE_NO_AUTOMATIC_OUTREACH',
    status: 'WARNING',
    message: 'No automatic customer or authority contact is triggered from archive apply.',
    source: 'SYSTEM',
  });

  return checks;
}

export function assessArchiveApplyGate(input: {
  documentType: ArchiveDocumentType;
  fields: Record<string, unknown>;
}): ArchiveApplyGateResult {
  const archiveSubtype = resolveArchiveSubtype(input.fields);
  const blockers: ArchiveApplyGateBlocker[] = [];

  const plausibilityBlockers = collectArchivePlausibilityChecks(
    input.documentType,
    input.fields,
  ).filter((check) => check.status === 'BLOCKER');

  for (const check of plausibilityBlockers) {
    blockers.push({ code: check.code, message: check.message });
  }

  if (!hasMinimalArchiveMetadata(input.fields)) {
    blockers.push({
      code: 'ARCHIVE_METADATA_INCOMPLETE',
      message: 'Archive apply requires at least summary, subject, reference, sender, or document date.',
      fieldKeys: ['summary', 'subject', 'referenceNumber', 'sender', 'documentDate'],
    });
  }

  return {
    canArchive: blockers.length === 0,
    canApplyDomain: false,
    archiveSubtype,
    blockers,
    entityLinkSuggestions: buildEntityLinkSuggestions(input.fields),
    deadlineSuggestions: buildDeadlineSuggestions(input.fields),
  };
}

export function buildArchiveApplyPayload(
  data: Record<string, unknown>,
): ArchiveApplyPayload | null {
  const gate = assessArchiveApplyGate({
    documentType: ARCHIVE_DOCUMENT_TYPES.OTHER,
    fields: data,
  });
  if (!gate.canArchive) return null;

  return {
    archiveSubtype: gate.archiveSubtype,
    sender: readSender(data),
    recipient: readRecipient(data),
    documentDate: toDate(readDocumentDate(data)),
    referenceNumber: readReferenceNumber(data),
    subject: readSubject(data),
    summary: readSummary(data),
    actionRequired: readActionRequired(data),
    entityLinkSuggestions: gate.entityLinkSuggestions,
    deadlineSuggestions: gate.deadlineSuggestions,
  };
}
