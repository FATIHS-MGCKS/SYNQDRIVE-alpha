/**
 * Structured error codes for Driving Intelligence V2 jobs (P20).
 * Provider failures must never be mapped to INSUFFICIENT_DATA.
 */

export const DRIVING_INTELLIGENCE_JOB_ERROR_CODES = {
  HANDLER_FAILED: 'HANDLER_FAILED',
  HANDLER_TRANSIENT: 'HANDLER_TRANSIENT',
  PROVIDER_TRANSIENT: 'PROVIDER_TRANSIENT',
  PROVIDER_PERMANENT: 'PROVIDER_PERMANENT',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  QUEUE_ENQUEUE_FAILED: 'QUEUE_ENQUEUE_FAILED',
  STALE_IN_PROGRESS: 'STALE_IN_PROGRESS',
  MAX_ATTEMPTS_EXCEEDED: 'MAX_ATTEMPTS_EXCEEDED',
} as const;

export type DrivingIntelligenceJobErrorCode =
  (typeof DRIVING_INTELLIGENCE_JOB_ERROR_CODES)[keyof typeof DRIVING_INTELLIGENCE_JOB_ERROR_CODES];

const RETRYABLE_CODES = new Set<DrivingIntelligenceJobErrorCode>([
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES.HANDLER_TRANSIENT,
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT,
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED,
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES.QUEUE_ENQUEUE_FAILED,
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES.STALE_IN_PROGRESS,
]);

const PROVIDER_ERROR_PATTERNS =
  /\b(timeout|timed out|econnrefused|econnreset|etimedout|503|502|504|429|rate.?limit|unavailable|network|socket hang up|provider)\b/i;

export class DrivingIntelligenceJobRetryableError extends Error {
  readonly code: DrivingIntelligenceJobErrorCode;

  constructor(code: DrivingIntelligenceJobErrorCode, message: string) {
    super(message);
    this.name = 'DrivingIntelligenceJobRetryableError';
    this.code = code;
  }
}

export class DrivingIntelligenceJobPermanentError extends Error {
  readonly code: DrivingIntelligenceJobErrorCode;

  constructor(code: DrivingIntelligenceJobErrorCode, message: string) {
    super(message);
    this.name = 'DrivingIntelligenceJobPermanentError';
    this.code = code;
  }
}

export function isRetryableErrorCode(code: string): boolean {
  return RETRYABLE_CODES.has(code as DrivingIntelligenceJobErrorCode);
}

export function isProviderErrorCode(code: string): boolean {
  return (
    code === DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT ||
    code === DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_PERMANENT ||
    code === DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED
  );
}

/**
 * Classify arbitrary handler errors into structured codes.
 * Provider-like failures are never classified as INSUFFICIENT_DATA.
 */
export function classifyDrivingIntelligenceJobError(err: unknown): {
  code: DrivingIntelligenceJobErrorCode;
  message: string;
  retryable: boolean;
} {
  if (err instanceof DrivingIntelligenceJobRetryableError) {
    return { code: err.code, message: err.message, retryable: true };
  }
  if (err instanceof DrivingIntelligenceJobPermanentError) {
    return { code: err.code, message: err.message, retryable: false };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (/\b(validation|invalid|malformed|contract)\b/.test(lower)) {
    return {
      code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED,
      message,
      retryable: false,
    };
  }

  if (PROVIDER_ERROR_PATTERNS.test(message)) {
    if (/\b(429|rate.?limit)\b/i.test(message)) {
      return {
        code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED,
        message,
        retryable: true,
      };
    }
    if (/\b(401|403|invalid.?credentials|forbidden|unauthorized)\b/i.test(message)) {
      return {
        code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_PERMANENT,
        message,
        retryable: false,
      };
    }
    return {
      code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT,
      message,
      retryable: true,
    };
  }

  if (/\b(insufficient|missing data|no data|not enough)\b/i.test(message)) {
    return {
      code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.INSUFFICIENT_DATA,
      message,
      retryable: false,
    };
  }

  return {
    code: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.HANDLER_TRANSIENT,
    message,
    retryable: true,
  };
}
