export type OperatorUploadKind =
  | 'DAMAGE_IMAGE'
  | 'CONDITION_PHOTO'
  | 'DOCUMENT'
  | 'SIGNATURE'
  | 'OBSERVATION_IMAGE'
  | 'TIRE_EVIDENCE';

export type OperatorUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'failed'
  | 'cancelled';

export interface OperatorUploadContext {
  orgId: string;
  bookingId: string;
  vehicleId: string;
  handoverSessionId?: string | null;
  handoverKind?: 'PICKUP' | 'RETURN' | null;
}

export interface OperatorUploadQueueItem {
  clientUploadId: string;
  kind: OperatorUploadKind;
  status: OperatorUploadStatus;
  fileName: string;
  mimeType: string;
  required: boolean;
  progressPercent: number;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
  targetRefType: string | null;
  targetRefId: string | null;
  blobKey: string | null;
  abortController: AbortController | null;
}

export interface OperatorUploadEnqueueInput {
  kind: OperatorUploadKind;
  file: Blob;
  fileName: string;
  mimeType: string;
  required?: boolean;
  clientUploadId?: string;
}

export const OPERATOR_UPLOAD_RETRY_BASE_MS = 500;
export const OPERATOR_UPLOAD_MAX_RETRIES = 5;

export const NON_RETRYABLE_ERROR_CODES = new Set([
  'OPERATOR_UPLOAD_VALIDATION',
  'OPERATOR_UPLOAD_NOT_RETRYABLE',
  'OPERATOR_UPLOAD_SESSION_DENIED',
  'OPERATOR_UPLOAD_SESSION_CANCELLED',
  'OPERATOR_UPLOAD_CANCELLED',
]);

export function createClientUploadId(prefix = 'op-upload'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mapServerUploadStatus(status: string): OperatorUploadStatus {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'UPLOADING':
      return 'uploading';
    case 'UPLOADED':
      return 'uploaded';
    case 'PROCESSING':
      return 'processing';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export function isTerminalUploadStatus(status: OperatorUploadStatus): boolean {
  return status === 'uploaded' || status === 'processing' || status === 'cancelled';
}

export function hasBlockingUploads(items: OperatorUploadQueueItem[]): boolean {
  return items.some(
    (item) =>
      item.required &&
      item.status !== 'uploaded' &&
      item.status !== 'processing' &&
      item.status !== 'cancelled',
  );
}
