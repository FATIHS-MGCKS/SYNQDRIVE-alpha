import { createHash } from 'crypto';
import {
  OPERATOR_UPLOAD_ALLOWED_MIME,
  OPERATOR_UPLOAD_MAX_BYTES,
  OPERATOR_UPLOAD_ERROR,
} from './operator-upload.constants';

export interface OperatorUploadValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
}

export function sha256Base64(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function validateOperatorUploadBinary(
  buffer: Buffer,
  mimeType: string | null | undefined,
): OperatorUploadValidationResult {
  if (!buffer?.length) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Empty upload payload',
      retryable: false,
    };
  }
  if (buffer.length > OPERATOR_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `File exceeds ${OPERATOR_UPLOAD_MAX_BYTES} bytes`,
      retryable: false,
    };
  }
  const mime = (mimeType ?? '').toLowerCase();
  if (!mime || !OPERATOR_UPLOAD_ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `MIME type not allowed: ${mime || 'unknown'}`,
      retryable: false,
    };
  }
  return { ok: true };
}

export function isRetryableUploadError(code: string | null | undefined): boolean {
  if (!code) return true;
  return code !== OPERATOR_UPLOAD_ERROR.VALIDATION && code !== OPERATOR_UPLOAD_ERROR.NOT_RETRYABLE;
}
