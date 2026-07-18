import type { AllowedDocumentMimeType } from './document-upload.constants';
import type { DocumentFileIdentificationStatus } from './document-file-identification-status.types';

export type DocumentExtractionFileFingerprint = {
  algorithm: 'sha256';
  contentSha256: string;
  organizationId: string;
  sizeBytes: number;
  detectedMime: AllowedDocumentMimeType;
  displayFileName: string;
  identifiedAt: string;
  identificationStatus?: DocumentFileIdentificationStatus;
  pageCount?: number;
  pixelCount?: number;
  rotationDegrees?: number;
};

export function buildDocumentExtractionFileFingerprint(input: {
  contentSha256: string;
  organizationId: string;
  sizeBytes: number;
  detectedMime: AllowedDocumentMimeType;
  displayFileName: string;
  identificationStatus?: DocumentFileIdentificationStatus;
  pageCount?: number;
  pixelCount?: number;
  rotationDegrees?: number;
}): DocumentExtractionFileFingerprint {
  return {
    algorithm: 'sha256',
    contentSha256: input.contentSha256,
    organizationId: input.organizationId,
    sizeBytes: input.sizeBytes,
    detectedMime: input.detectedMime,
    displayFileName: input.displayFileName,
    identifiedAt: new Date().toISOString(),
    identificationStatus: input.identificationStatus,
    pageCount: input.pageCount,
    pixelCount: input.pixelCount,
    rotationDegrees: input.rotationDegrees,
  };
}

export function readDocumentExtractionFileFingerprint(
  plausibility: unknown,
): DocumentExtractionFileFingerprint | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const fingerprint = (pipeline as Record<string, unknown>).fileFingerprint;
  if (!fingerprint || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) {
    return null;
  }
  const row = fingerprint as DocumentExtractionFileFingerprint;
  if (row.algorithm !== 'sha256' || typeof row.contentSha256 !== 'string') {
    return null;
  }
  return row;
}
