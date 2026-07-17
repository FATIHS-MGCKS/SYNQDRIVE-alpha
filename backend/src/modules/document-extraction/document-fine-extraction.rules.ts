import type { AcceptedEntityLink } from './document-action.types';

export const FINE_DOCUMENT_TYPE = 'FINE' as const;

export type FineApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type FineEntityLinks = {
  bookingId: string | null;
  customerId: string | null;
  driverCustomerId: string | null;
};

export type FineApplyPayload = {
  fineNumber: string | null;
  title: string;
  description: string;
  offenseType: string;
  issuingAuthority: string | null;
  offenseDate: string;
  location: string | null;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  notes: string | null;
  entityLinks: FineEntityLinks;
};

export type FineApplyGateResult = {
  canApply: boolean;
  blockers: FineApplyGateBlocker[];
  duplicateReferenceFineId: string | null;
};

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

export function readFineEventDate(fields: Record<string, unknown>): string | null {
  return toStr(fields.eventDate) ?? toStr(fields.offenseDate);
}

export function readFineTotalCents(fields: Record<string, unknown>): number | null {
  return toInt(fields.totalCents);
}

export function readFineOffenseType(fields: Record<string, unknown>): string | null {
  return toStr(fields.offenseType);
}

export function readFineReportNumber(fields: Record<string, unknown>): string | null {
  return toStr(fields.reportNumber) ?? toStr(fields.referenceNumber) ?? toStr(fields.fineNumber);
}

export function readAcceptedEntityLinks(fields: Record<string, unknown>): AcceptedEntityLink[] {
  const raw = fields.acceptedEntityLinks;
  if (!Array.isArray(raw)) return [];

  const links: AcceptedEntityLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const entityType = toStr(row.entityType);
    const entityId = toStr(row.entityId);
    if (!entityType || !entityId) continue;
    links.push({
      entityType: entityType.toLowerCase(),
      entityId,
      label: toStr(row.label),
    });
  }
  return links;
}

export function resolveFineEntityLinks(fields: Record<string, unknown>): FineEntityLinks {
  const links = readAcceptedEntityLinks(fields);
  const bookingLink = links.find((row) => row.entityType === 'booking');
  const customerLink = links.find((row) => row.entityType === 'customer');
  const driverLink = links.find((row) => row.entityType === 'driver');

  return {
    bookingId: bookingLink?.entityId ?? null,
    customerId: customerLink?.entityId ?? null,
    driverCustomerId: driverLink?.entityId ?? null,
  };
}

export function buildFineApplyPayload(fields: Record<string, unknown>): FineApplyPayload | null {
  const offenseDate = readFineEventDate(fields);
  const offenseType = readFineOffenseType(fields);
  const amountCents = readFineTotalCents(fields);
  if (!offenseDate || !offenseType || amountCents == null) {
    return null;
  }

  const summary = toStr(fields.description);
  const breakdown = toStr(fields.feeBreakdown);
  const descriptionParts = [summary, breakdown].filter(Boolean);

  return {
    fineNumber: readFineReportNumber(fields),
    title: offenseType,
    description: descriptionParts.join('\n\n') || 'Bußgeld aus Dokumenten-Upload',
    offenseType,
    issuingAuthority: toStr(fields.issuingAuthority),
    offenseDate,
    location: toStr(fields.location),
    amountCents,
    currency: toStr(fields.currency) ?? 'EUR',
    dueDate: toStr(fields.dueDate),
    notes: breakdown,
    entityLinks: resolveFineEntityLinks(fields),
  };
}

export function assessFineApplyGate(input: {
  fields: Record<string, unknown>;
  duplicateReferenceFineId?: string | null;
}): FineApplyGateResult {
  const blockers: FineApplyGateBlocker[] = [];
  const offenseDate = readFineEventDate(input.fields);
  const offenseType = readFineOffenseType(input.fields);
  const amountCents = readFineTotalCents(input.fields);
  const reportNumber = readFineReportNumber(input.fields);

  if (!offenseDate) {
    blockers.push({
      code: 'FINE_MISSING_EVENT_DATE',
      message: 'Offense date is required before a fine draft can be created.',
      fieldKeys: ['eventDate', 'offenseDate'],
    });
  }

  if (amountCents == null) {
    blockers.push({
      code: 'FINE_MISSING_TOTAL_CENTS',
      message: 'Total amount in cents is required before a fine draft can be created.',
      fieldKeys: ['totalCents'],
    });
  } else if (amountCents <= 0) {
    blockers.push({
      code: 'FINE_ZERO_TOTAL_CENTS',
      message: 'Fine amount must be greater than zero.',
      fieldKeys: ['totalCents'],
    });
  }

  if (!offenseType) {
    blockers.push({
      code: 'FINE_MISSING_OFFENSE_TYPE',
      message: 'Offense type must be explicitly confirmed — no default is applied.',
      fieldKeys: ['offenseType'],
    });
  }

  if (reportNumber && input.duplicateReferenceFineId) {
    blockers.push({
      code: 'FINE_DUPLICATE_REFERENCE_NUMBER',
      message: 'A fine with this reference number already exists for the organization.',
      fieldKeys: ['reportNumber', 'referenceNumber', 'fineNumber'],
    });
  }

  return {
    canApply: blockers.length === 0,
    blockers,
    duplicateReferenceFineId: input.duplicateReferenceFineId ?? null,
  };
}

export function isFineDocumentType(documentType: string | null | undefined): boolean {
  return documentType === FINE_DOCUMENT_TYPE;
}

export function buildFineTaskDedupKey(documentExtractionId: string): string {
  return `document-extraction:fine:${documentExtractionId}`;
}
