import { BOOKING_DOCUMENT_GENERATION_ERROR_CODE } from './booking-document-generation.constants';

export class BookingDocumentGenerationRetryableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BookingDocumentGenerationRetryableError';
    this.code = code;
  }
}

export class BookingDocumentGenerationTenantError extends Error {
  readonly code = BOOKING_DOCUMENT_GENERATION_ERROR_CODE.TENANT_MISMATCH;

  constructor(message: string) {
    super(message);
    this.name = 'BookingDocumentGenerationTenantError';
  }
}

export function classifyBookingDocumentGenerationError(err: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (err instanceof BookingDocumentGenerationTenantError) {
    return { code: err.code, message: err.message, retryable: false };
  }
  if (err instanceof BookingDocumentGenerationRetryableError) {
    return { code: err.code, message: err.message, retryable: true };
  }

  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : BOOKING_DOCUMENT_GENERATION_ERROR_CODE.EXECUTION_FAILED;

  const blocking = BOOKING_DOCUMENT_GENERATION_ERROR_CODE;
  const retryable = ![
    blocking.TENANT_MISMATCH,
    blocking.INVALID_PAYLOAD,
    blocking.GENERATION_DISABLED,
    'RENTAL_CONTRACT_MISSING_MANDATORY_LEGAL_TEXT',
    'RENTAL_CONTRACT_LEGAL_RESOLVER_CONFLICT',
    'BOOKING_BUNDLE_LEGAL_RESOLVER_CONFLICT',
  ].some((pattern) => code.includes(pattern) || message.includes(pattern));

  return {
    code,
    message: message.slice(0, 500),
    retryable,
  };
}
