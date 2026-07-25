import { createHash } from 'crypto';
import { OPERATOR_UPLOAD_ERROR } from './operator-upload.constants';

export interface OperatorUploadValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** @deprecated Use sha256Hex — kept for backward compatibility in tests. */
export const sha256Base64 = sha256Hex;

export function isRetryableUploadError(code: string | null | undefined): boolean {
  if (!code) return true;
  return code !== OPERATOR_UPLOAD_ERROR.VALIDATION && code !== OPERATOR_UPLOAD_ERROR.NOT_RETRYABLE;
}
