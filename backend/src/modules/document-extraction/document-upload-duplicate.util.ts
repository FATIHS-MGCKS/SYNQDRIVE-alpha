import { readInvoiceNumber } from './document-invoice-extraction.rules';
import { readReferenceNumber } from './document-archive-extraction.rules';
import { readFineReportNumber } from './document-fine-extraction.rules';
import type {
  UploadDuplicateEntityLinks,
  UploadDuplicateExistingExtraction,
} from './document-upload-duplicate.types';

export function normalizeBusinessIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, '').toUpperCase();
}

export function readBusinessInvoiceNumber(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  return readInvoiceNumber(data);
}

export function readBusinessReferenceNumber(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  return readReferenceNumber(data) ?? readFineReportNumber(data);
}

export function extractionMatchesBusinessHints(
  row: {
    confirmedData?: unknown;
    extractedData?: unknown;
  },
  hints: { invoiceNumber?: string | null; referenceNumber?: string | null },
): UploadDuplicateBusinessMatchRow | null {
  const invoiceHint = normalizeBusinessIdentifier(hints.invoiceNumber);
  const referenceHint = normalizeBusinessIdentifier(hints.referenceNumber);
  if (!invoiceHint && !referenceHint) return null;

  const payloads = [row.confirmedData, row.extractedData].filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );

  for (const payload of payloads) {
    if (invoiceHint) {
      const invoiceNumber = normalizeBusinessIdentifier(readBusinessInvoiceNumber(payload));
      if (invoiceNumber && invoiceNumber === invoiceHint) {
        return { kind: 'invoice', value: invoiceHint };
      }
    }
    if (referenceHint) {
      const referenceNumber = normalizeBusinessIdentifier(readBusinessReferenceNumber(payload));
      if (referenceNumber && referenceNumber === referenceHint) {
        return { kind: 'reference', value: referenceHint };
      }
    }
  }

  return null;
}

export type UploadDuplicateBusinessMatchRow = {
  kind: 'invoice' | 'reference';
  value: string;
};

export function toUploadDuplicateExistingExtraction(
  row: {
    id: string;
    vehicleId: string;
    organizationId: string | null;
    status: UploadDuplicateExistingExtraction['status'];
    processingStage: string;
    sourceFileName: string | null;
    effectiveDocumentType: string | null;
    requestedDocumentType: string | null;
    contentSha256: string | null;
    createdAt: Date;
    appliedAt: Date | null;
    fines?: Array<{ id: string }>;
    orgInvoices?: Array<{ id: string }>;
    damages?: Array<{ id: string }>;
    serviceEvents?: Array<{ id: string }>;
  },
): UploadDuplicateExistingExtraction {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    organizationId: row.organizationId,
    status: row.status,
    processingStage: row.processingStage,
    sourceFileName: row.sourceFileName,
    effectiveDocumentType: row.effectiveDocumentType,
    requestedDocumentType: row.requestedDocumentType,
    contentSha256: row.contentSha256,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    entityLinks: buildEntityLinks(row),
  };
}

export function buildEntityLinks(row: {
  fines?: Array<{ id: string }>;
  orgInvoices?: Array<{ id: string }>;
  damages?: Array<{ id: string }>;
  serviceEvents?: Array<{ id: string }>;
}): UploadDuplicateEntityLinks {
  return {
    fineIds: row.fines?.map((item) => item.id) ?? [],
    invoiceIds: row.orgInvoices?.map((item) => item.id) ?? [],
    damageIds: row.damages?.map((item) => item.id) ?? [],
    serviceEventIds: row.serviceEvents?.map((item) => item.id) ?? [],
  };
}
