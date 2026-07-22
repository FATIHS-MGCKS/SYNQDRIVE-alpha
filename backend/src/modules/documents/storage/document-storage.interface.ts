import { Readable } from 'stream';

/**
 * DI token for the booking-document storage port. Bind to a concrete
 * implementation (local disk today, S3-compatible later) in DocumentsModule.
 */
export const DOCUMENTS_STORAGE = Symbol('DOCUMENTS_STORAGE');

export interface PutDocumentInput {
  organizationId: string;
  /** When present, the object key is scoped under the booking; otherwise org-level (e.g. legal docs). */
  bookingId?: string | null;
  /** Document type — used as a sanitised path segment (e.g. BOOKING_INVOICE, TERMS_AND_CONDITIONS). */
  documentType: string;
  /** Untrusted original filename — only used for the human-readable suffix. */
  originalName: string;
  buffer: Buffer;
  mimeType: string;
}

export interface PutDocumentResult {
  objectKey: string;
  storageProvider: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Private storage for generated booking PDFs and uploaded legal documents.
 * Object keys are fully server-generated and validated against path traversal.
 * Files are never exposed as public static assets — they are only reachable
 * through authenticated, org-scoped download endpoints.
 */
export interface DocumentStoragePort {
  /** Stores bytes under a safe generated key and returns storage metadata. */
  putObject(input: PutDocumentInput): Promise<PutDocumentResult>;
  /** Stores bytes in the private quarantine zone before malware scanning. */
  putQuarantineObject(input: PutDocumentInput): Promise<PutDocumentResult>;
  /** Moves a quarantined object into the clean legal document zone. */
  promoteQuarantineToClean(input: {
    quarantineObjectKey: string;
    organizationId: string;
    documentType: string;
    originalName: string;
    mimeType: string;
  }): Promise<PutDocumentResult>;
  /** Reads the full object into memory. Throws if the key is invalid/missing. */
  getObject(objectKey: string): Promise<Buffer>;
  /** Streams the object (for authenticated downloads). */
  getObjectStream(objectKey: string): Promise<Readable>;
  /** Best-effort delete; never throws for a missing object. */
  deleteObject(objectKey: string): Promise<void>;
  /** Local-only: absolute filesystem path for a key, or null for non-local providers. */
  getInternalPath(objectKey: string): string | null;
}
