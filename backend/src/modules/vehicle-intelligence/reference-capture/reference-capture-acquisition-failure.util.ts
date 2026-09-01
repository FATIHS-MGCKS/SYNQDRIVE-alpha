import { ReferenceCapturePersistenceError } from './reference-capture-observation-writer.service';

export type ReferenceCaptureFailureClass =
  | 'TRANSIENT_PROVIDER_FAILURE'
  | 'RATE_LIMIT'
  | 'AUTH_REFRESHABLE'
  | 'SCHEMA_FIELD_FAILURE'
  | 'PERSISTENCE_FAILURE'
  | 'TERMINAL_SESSION_FAILURE';

export type ReferenceCaptureFailureAssessment = {
  failureClass: ReferenceCaptureFailureClass;
  retryable: boolean;
  message: string;
};

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /network/i,
  /econnreset/i,
  /etimedout/i,
  /socket hang up/i,
  /503/,
  /502/,
  /504/,
];

const RATE_LIMIT_PATTERNS = [/rate limit/i, /429/, /too many requests/i, /budget/i, /throttl/i];

const AUTH_PATTERNS = [/401/, /403/, /unauthorized/i, /jwt/i, /token expired/i, /auth/i];

const SCHEMA_PATTERNS = [/graphql error/i, /cannot query field/i, /unknown field/i, /validation/i];

export function classifyAcquisitionError(error: unknown): ReferenceCaptureFailureAssessment {
  if (error instanceof ReferenceCapturePersistenceError) {
    return {
      failureClass: 'PERSISTENCE_FAILURE',
      retryable: false,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  if (RATE_LIMIT_PATTERNS.some((p) => p.test(message))) {
    return { failureClass: 'RATE_LIMIT', retryable: true, message };
  }
  if (AUTH_PATTERNS.some((p) => p.test(message))) {
    return { failureClass: 'AUTH_REFRESHABLE', retryable: true, message };
  }
  if (SCHEMA_PATTERNS.some((p) => p.test(message))) {
    return { failureClass: 'SCHEMA_FIELD_FAILURE', retryable: true, message };
  }
  if (TRANSIENT_PATTERNS.some((p) => p.test(message))) {
    return { failureClass: 'TRANSIENT_PROVIDER_FAILURE', retryable: true, message };
  }

  return { failureClass: 'TERMINAL_SESSION_FAILURE', retryable: false, message };
}

export function computeTransientBackoffMs(retryCount: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(retryCount - 1, 0), 60_000);
}
