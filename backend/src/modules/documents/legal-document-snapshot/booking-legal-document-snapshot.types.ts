import type {
  BookingLegalDocumentSnapshot,
  BookingLegalDocumentSnapshotContext,
  GeneratedDocument,
} from '@prisma/client';

export interface BookingLegalDocumentSnapshotDto {
  id: string;
  organizationId: string;
  bookingId: string;
  documentType: string;
  templateKey: string | null;
  templateVersion: string | null;
  renderedVersion: string;
  hashAlgorithm: string;
  contentHash: string;
  language: string;
  generatedDocumentId: string;
  legalDocumentId: string | null;
  presentationContext: string;
  integrityStatus: string;
  integrityVerifiedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface CreateSnapshotFromGeneratedDocumentInput {
  organizationId: string;
  bookingId: string;
  generatedDocumentId: string;
  presentationContext: BookingLegalDocumentSnapshotContext;
  actorUserId?: string | null;
  verifyIntegrity?: boolean;
}

export function toBookingLegalDocumentSnapshotDto(
  row: BookingLegalDocumentSnapshot,
): BookingLegalDocumentSnapshotDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bookingId: row.bookingId,
    documentType: row.documentType,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    renderedVersion: row.renderedVersion,
    hashAlgorithm: row.hashAlgorithm,
    contentHash: row.contentHash,
    language: row.language,
    generatedDocumentId: row.generatedDocumentId,
    legalDocumentId: row.legalDocumentId,
    presentationContext: row.presentationContext,
    integrityStatus: row.integrityStatus,
    integrityVerifiedAt: row.integrityVerifiedAt?.toISOString() ?? null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

export function extractLanguageFromGeneratedDocument(doc: GeneratedDocument): string {
  const metadata = doc.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const lang = (metadata as Record<string, unknown>).language;
    if (typeof lang === 'string' && lang.length >= 2) {
      return lang.slice(0, 16);
    }
  }
  return 'de';
}

export function buildSnapshotIdempotencyKey(
  bookingId: string,
  documentType: string,
  contentHash: string,
): string {
  return `snapshot:${bookingId}:${documentType}:${contentHash}`;
}
