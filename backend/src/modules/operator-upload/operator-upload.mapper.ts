import type { OperatorUpload, OperatorUploadKind, OperatorUploadStatus } from '@prisma/client';

export interface OperatorUploadDto {
  id: string;
  organizationId: string;
  clientUploadId: string;
  kind: OperatorUploadKind;
  status: OperatorUploadStatus;
  bookingId: string;
  handoverSessionId: string | null;
  vehicleId: string;
  handoverKind: string | null;
  mimeType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  contentSha256: string | null;
  targetRefType: string | null;
  targetRefId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  progressPercent: number | null;
  requiredForComplete: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapOperatorUpload(row: OperatorUpload): OperatorUploadDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientUploadId: row.clientUploadId,
    kind: row.kind,
    status: row.status,
    bookingId: row.bookingId,
    handoverSessionId: row.handoverSessionId,
    vehicleId: row.vehicleId,
    handoverKind: row.handoverKind,
    mimeType: row.mimeType,
    fileName: row.fileName,
    fileSizeBytes: row.fileSizeBytes,
    contentSha256: row.contentSha256,
    targetRefType: row.targetRefType,
    targetRefId: row.targetRefId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    retryable: row.retryable,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    progressPercent: row.progressPercent,
    requiredForComplete: row.requiredForComplete,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
