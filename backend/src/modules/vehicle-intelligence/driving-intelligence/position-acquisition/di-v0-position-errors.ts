import {
  DimoProviderBudgetError,
  DimoRateLimitedError,
  DimoRetryableHttpError,
  isAxiosTimeout,
  readAxiosStatus,
} from '../../../dimo/provider-budget/dimo-http-error.util';
import type {
  DiV0PositionAcquisitionFailure,
  DiV0PositionAcquisitionFailureClass,
} from './di-v0-position-acquisition.types';
import { DiV0PositionRequestError } from './di-v0-position-window';

const SAFE_MESSAGE_MAX_LENGTH = 300;
const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH']);
const RETRYABLE_CLASSES = new Set<DiV0PositionAcquisitionFailureClass>([
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
  'PROVIDER_HTTP_ERROR',
  'PROVIDER_BUDGET_UNAVAILABLE',
]);

/** Thrown by the DIMO transport adapter when no vehicle JWT could be obtained. */
export class DiV0VehicleJwtUnavailableError extends Error {
  constructor() {
    super('DIMO vehicle JWT unavailable');
    this.name = 'DiV0VehicleJwtUnavailableError';
  }
}

/** Removes bearer tokens and JWT-shaped strings; bounds length. */
export function redactProviderMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(authorization["']?\s*[:=]\s*)["']?[^\s"',}]+/gi, '$1[REDACTED]')
    .slice(0, SAFE_MESSAGE_MAX_LENGTH);
}

export function buildFailure(
  failureClass: DiV0PositionAcquisitionFailureClass,
  httpStatus: number | null,
  detail?: string,
): DiV0PositionAcquisitionFailure {
  const base = httpStatus != null ? `${failureClass} (HTTP ${httpStatus})` : failureClass;
  return {
    failureClass,
    retryable: RETRYABLE_CLASSES.has(failureClass),
    httpStatus,
    safeMessage: detail ? redactProviderMessage(`${base}: ${detail}`) : base,
  };
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Maps transport exceptions to typed failures. Detail text is only propagated for GraphQL
 * errors (provider validation messages) and always redacted.
 */
export function classifyDiV0PositionTransportError(error: unknown): DiV0PositionAcquisitionFailure {
  if (error instanceof DiV0PositionRequestError) {
    return buildFailure('INVALID_REQUEST', null, error.message);
  }
  if (error instanceof DiV0VehicleJwtUnavailableError) {
    return buildFailure('AUTHENTICATION', null, 'vehicle JWT unavailable');
  }
  if (error instanceof DimoRateLimitedError) {
    return buildFailure('RATE_LIMITED', error.httpStatus);
  }
  const name = errorName(error);
  if (
    error instanceof DimoProviderBudgetError ||
    name === 'DimoRetryableBudgetError' ||
    name === 'DimoProviderAdmissionTimeoutError'
  ) {
    return buildFailure('PROVIDER_BUDGET_UNAVAILABLE', null);
  }

  const status =
    readAxiosStatus(error) ??
    (error instanceof DimoRetryableHttpError ? error.httpStatus : undefined);
  if (error instanceof DimoRetryableHttpError && status === undefined) {
    return buildFailure('PROVIDER_HTTP_ERROR', null);
  }
  if (status === 401) return buildFailure('AUTHENTICATION', status);
  if (status === 403) return buildFailure('AUTHORIZATION', status);
  if (status === 429) return buildFailure('RATE_LIMITED', status);
  if (status === 408) return buildFailure('TIMEOUT', status);
  if (typeof status === 'number' && status >= 500) return buildFailure('PROVIDER_HTTP_ERROR', status);
  if (typeof status === 'number' && status >= 400) return buildFailure('INVALID_REQUEST', status);

  if (isAxiosTimeout(error)) return buildFailure('TIMEOUT', null);
  const code = errorCode(error);
  if (code != null && NETWORK_ERROR_CODES.has(code)) return buildFailure('NETWORK', null, code);

  const message = errorMessage(error);
  if (message.startsWith('DIMO GraphQL error')) {
    return buildFailure('GRAPHQL_ERROR', null, message);
  }
  return buildFailure('UNKNOWN', null);
}
