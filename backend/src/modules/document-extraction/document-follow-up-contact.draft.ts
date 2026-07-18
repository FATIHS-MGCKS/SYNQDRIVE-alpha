import type {
  DocumentFollowUpContactDocumentReferenceDto,
  DocumentFollowUpContactTarget,
} from './document-follow-up-contact.types';

const SENSITIVE_FIELD_KEYS = new Set([
  'iban',
  'bic',
  'taxId',
  'vatId',
  'socialSecurityNumber',
  'licenseNumber',
  'passportNumber',
  'idNumber',
  'rawText',
  'ocrText',
  'extractedData',
]);

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function listExcludedSensitiveFieldKeys(confirmedData: Record<string, unknown>): string[] {
  const excluded = [...SENSITIVE_FIELD_KEYS];
  for (const key of Object.keys(confirmedData)) {
    if (SENSITIVE_FIELD_KEYS.has(key)) excluded.push(key);
  }
  return [...new Set(excluded)].sort();
}

export function buildDocumentReference(input: {
  extractionId: string;
  fileName?: string | null;
  documentType?: string | null;
  documentSubtype?: string | null;
  confirmedData: Record<string, unknown>;
}): DocumentFollowUpContactDocumentReferenceDto {
  const typeLabel = input.documentSubtype ?? input.documentType ?? 'Dokument';
  const fileName = input.fileName?.trim() || null;
  const referenceHint =
    toStr(input.confirmedData.reportNumber) ??
    toStr(input.confirmedData.referenceNumber) ??
    toStr(input.confirmedData.invoiceNumber) ??
    toStr(input.confirmedData.insuranceReference) ??
    null;

  const displayLabel = fileName ? `${typeLabel} — ${fileName}` : typeLabel;

  return {
    extractionId: input.extractionId,
    fileName,
    documentType: input.documentType ?? null,
    documentSubtype: input.documentSubtype ?? null,
    displayLabel,
    referenceHint,
  };
}

function safeSalutation(displayName: string | null, target: DocumentFollowUpContactTarget): string {
  if (displayName?.trim()) return `Guten Tag ${displayName.trim()},`;
  switch (target) {
    case 'DRIVER':
      return 'Guten Tag,';
    case 'INSURANCE':
      return 'Sehr geehrte Damen und Herren,';
    default:
      return 'Guten Tag,';
  }
}

function buildReferenceParagraph(reference: DocumentFollowUpContactDocumentReferenceDto): string {
  const parts = [`Bezug: ${reference.displayLabel}`];
  if (reference.referenceHint) {
    parts.push(`Referenz: ${reference.referenceHint}`);
  }
  parts.push(`Dokument-ID: ${reference.extractionId}`);
  return parts.join('\n');
}

export function buildContactDraft(input: {
  contactTarget: DocumentFollowUpContactTarget;
  recipientDisplayName: string | null;
  documentReference: DocumentFollowUpContactDocumentReferenceDto;
  suggestionTitle: string;
  suggestionRationale: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const salutation = safeSalutation(input.recipientDisplayName, input.contactTarget);
  const referenceBlock = buildReferenceParagraph(input.documentReference);

  const introByTarget: Record<DocumentFollowUpContactTarget, string> = {
    CUSTOMER: 'im Anhang bzw. Bezug finden Sie ein Dokument aus unserem Dokumenten-Upload.',
    DRIVER: 'wir benötigen Ihre Rückmeldung zur Fahrerzuordnung für ein hochgeladenes Dokument.',
    VENDOR: 'wir möchten eine Rückfrage zu einem eingegangenen Dokument / einer Rechnung stellen.',
    INSURANCE: 'wir kontaktieren Sie bezüglich eines Schadens- oder Versicherungsdokuments.',
  };

  const bodyText = [
    salutation,
    '',
    introByTarget[input.contactTarget],
    '',
    referenceBlock,
    '',
    'Bitte prüfen Sie die Angaben und teilen Sie uns Ihre Rückmeldung mit.',
    '',
    'Mit freundlichen Grüßen',
  ].join('\n');

  const subjectByTarget: Record<DocumentFollowUpContactTarget, string> = {
    CUSTOMER: `Rückfrage: ${input.documentReference.displayLabel}`,
    DRIVER: `Fahrerzuordnung prüfen: ${input.documentReference.displayLabel}`,
    VENDOR: `Rückfrage Lieferant: ${input.documentReference.displayLabel}`,
    INSURANCE: `Versicherung / Schaden: ${input.documentReference.displayLabel}`,
  };

  const bodyHtml = bodyText
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
    .join('');

  return {
    subject: subjectByTarget[input.contactTarget],
    bodyText,
    bodyHtml,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
