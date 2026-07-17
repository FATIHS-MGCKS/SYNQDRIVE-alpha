import { Readable } from 'stream';

/**
 * Document storage port — a private storage abstraction for uploaded
 * vehicle/rental documents.
 *
 * This is intentionally separate from the shared {@link StorageService}
 * (`/uploads`), which is served as PUBLIC static assets. Uploaded documents
 * must never be publicly reachable, so they live behind this port and are read
 * back by object key (by the worker / authenticated download flows only).
 *
 * The default implementation is local-disk. A future S3-compatible provider can
 * implement the same port without touching callers (see local-document-storage
 * service for the S3 TODO notes).
 */
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface PutObjectInput {
  organizationId: string;
  vehicleId: string;
  /** Untrusted original filename — only used for the human-readable suffix. */
  originalName: string;
  buffer: Buffer;
  mimeType: string;
}

export interface PutObjectResult {
  objectKey: string;
  storageProvider: string;
  sizeBytes: number;
  mimeType: string;
}

export interface DocumentStoragePort {
  /** Stores bytes under a safe generated key and returns storage metadata. */
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** Stores bytes in the private quarantine zone before malware scanning. */
  putQuarantineObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** Moves a quarantined object into the clean document zone. */
  promoteQuarantineToClean(input: {
    quarantineObjectKey: string;
    organizationId: string;
    vehicleId: string;
    originalName: string;
    mimeType: string;
  }): Promise<PutObjectResult>;
  /** Reads the full object into memory. Throws if the key is invalid/missing. */
  getObject(objectKey: string): Promise<Buffer>;
  /** Streams the object (for authenticated downloads). */
  getObjectStream(objectKey: string): Promise<Readable>;
  /** Best-effort delete; never throws for a missing object. */
  deleteObject(objectKey: string): Promise<void>;
  /** Local-only: absolute filesystem path for a key, or null for non-local providers. */
  getInternalPath(objectKey: string): string | null;
}
