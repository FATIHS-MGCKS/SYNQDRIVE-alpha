import type { WorkflowActionErrorCategory } from './workflow-action-run-execution.types';

export interface ClassifiedActionError {
  errorCode: string;
  errorCategory: WorkflowActionErrorCategory;
  errorSummary: string;
  retryable: boolean;
  /** When true, must not auto-retry even if technically retryable (unclear provider state). */
  blockAutoRetry: boolean;
}

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /connection refused/i,
  /temporarily unavailable/i,
  /rate limit/i,
  /503/,
  /502/,
  /P2024/,
];

const PROVIDER_UNCLEAR_PATTERNS = [
  /ambiguous response/i,
  /unknown.*status/i,
  /provider.*timeout/i,
  /submitted but.*unconfirmed/i,
  /partial.*response/i,
];

const PERMANENT_PATTERNS = [
  /not found/i,
  /forbidden/i,
  /unauthorized/i,
  /invalid/i,
  /bad request/i,
  /unsupported/i,
  /vehicle not found/i,
];

export function classifyActionError(
  err: unknown,
  options: { attemptCount: number; maxAttempts: number; timedOut?: boolean },
): ClassifiedActionError {
  if (options.timedOut) {
    return {
      errorCode: 'ACTION_TIMEOUT',
      errorCategory: 'TIMEOUT',
      errorSummary: 'Action execution exceeded configured timeout',
      retryable: options.attemptCount < options.maxAttempts,
      blockAutoRetry: false,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && err.name ? err.name : 'ACTION_EXECUTION_ERROR';

  if (PROVIDER_UNCLEAR_PATTERNS.some((p) => p.test(message))) {
    return {
      errorCode: 'PROVIDER_STATE_UNCLEAR',
      errorCategory: 'PROVIDER_UNCLEAR',
      errorSummary: sanitizeErrorSummary(message),
      retryable: false,
      blockAutoRetry: true,
    };
  }

  if (PERMANENT_PATTERNS.some((p) => p.test(message))) {
    return {
      errorCode: code,
      errorCategory: 'PERMANENT',
      errorSummary: sanitizeErrorSummary(message),
      retryable: false,
      blockAutoRetry: false,
    };
  }

  if (RETRYABLE_PATTERNS.some((p) => p.test(message))) {
    const canRetry = options.attemptCount < options.maxAttempts;
    return {
      errorCode: code,
      errorCategory: 'RETRYABLE',
      errorSummary: sanitizeErrorSummary(message),
      retryable: canRetry,
      blockAutoRetry: false,
    };
  }

  return {
    errorCode: code,
    errorCategory: 'PERMANENT',
    errorSummary: sanitizeErrorSummary(message),
    retryable: false,
    blockAutoRetry: false,
  };
}

export function resolveStatusFromClassification(
  classification: ClassifiedActionError,
): 'FAILED_RETRYABLE' | 'FAILED_PERMANENT' {
  if (classification.blockAutoRetry) {
    return 'FAILED_PERMANENT';
  }
  if (classification.retryable) {
    return 'FAILED_RETRYABLE';
  }
  return 'FAILED_PERMANENT';
}

export function sanitizeErrorSummary(message: string, maxLen = 500): string {
  const stripped = message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\b\d{10,}\b/g, '[phone]')
    .replace(/(api[_-]?key|secret|token|password|bearer)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 3)}...` : stripped;
}
