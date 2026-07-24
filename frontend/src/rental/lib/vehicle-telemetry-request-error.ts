import { ApiHttpError, isAbortError } from '../../lib/api';
import { classifyTelemetryAccessError } from './telemetry-access-errors';
import {
  computeTelemetryBackoffMs,
  isRetryableTelemetryHttpStatus,
  VEHICLE_TELEMETRY_RETRY,
} from './vehicle-telemetry-retry';
import { telemetryUserMessage } from './telemetry-user-messages';

export type TelemetryErrorKind =
  | 'abort'
  | 'offline'
  | 'auth'
  | 'permission'
  | 'data_authorization'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'unknown';

export interface TelemetryRequestErrorPolicy {
  kind: TelemetryErrorKind;
  retryable: boolean;
  backoffMs: number;
  userMessage: string | null;
  status?: number;
}

function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /network|failed to fetch|offline/i.test(err.message)) {
    return true;
  }
  return false;
}

export function classifyTelemetryRequestError(
  err: unknown,
  attempt: number,
): TelemetryRequestErrorPolicy {
  if (isAbortError(err)) {
    return {
      kind: 'abort',
      retryable: false,
      backoffMs: 0,
      userMessage: null,
    };
  }

  if (err instanceof Error && /session expired/i.test(err.message)) {
    return {
      kind: 'auth',
      retryable: false,
      backoffMs: 0,
      userMessage: telemetryUserMessage('auth'),
    };
  }

  if (isOfflineError(err)) {
    return {
      kind: 'offline',
      retryable: true,
      backoffMs: computeTelemetryBackoffMs(attempt),
      userMessage: telemetryUserMessage('offline'),
    };
  }

  if (err instanceof ApiHttpError) {
    const accessReason = classifyTelemetryAccessError(err);
    if (err.status === 401) {
      return {
        kind: 'auth',
        retryable: false,
        backoffMs: 0,
        userMessage: telemetryUserMessage('auth'),
        status: err.status,
      };
    }
    if (err.status === 403) {
      const kind: TelemetryErrorKind =
        accessReason === 'data_authorization' ? 'data_authorization' : 'permission';
      return {
        kind,
        retryable: false,
        backoffMs: 0,
        userMessage: telemetryUserMessage(kind),
        status: err.status,
      };
    }
    if (err.status === 404) {
      return {
        kind: 'not_found',
        retryable: false,
        backoffMs: 0,
        userMessage: telemetryUserMessage('not_found'),
        status: err.status,
      };
    }
    if (err.status === 429) {
      return {
        kind: 'rate_limit',
        retryable: true,
        backoffMs: computeTelemetryBackoffMs(attempt, err.retryAfterMs),
        userMessage: telemetryUserMessage('rate_limit'),
        status: err.status,
      };
    }
    if (err.status >= 500) {
      return {
        kind: 'server',
        retryable: true,
        backoffMs: computeTelemetryBackoffMs(attempt),
        userMessage: telemetryUserMessage('server'),
        status: err.status,
      };
    }
    return {
      kind: 'unknown',
      retryable: isRetryableTelemetryHttpStatus(err.status),
      backoffMs: isRetryableTelemetryHttpStatus(err.status)
        ? computeTelemetryBackoffMs(attempt)
        : 0,
      userMessage: telemetryUserMessage('unknown'),
      status: err.status,
    };
  }

  const accessReason = classifyTelemetryAccessError(err);
  if (accessReason === 'data_authorization') {
    return {
      kind: 'data_authorization',
      retryable: false,
      backoffMs: 0,
      userMessage: telemetryUserMessage('data_authorization'),
    };
  }
  if (accessReason === 'permission') {
    return {
      kind: 'permission',
      retryable: false,
      backoffMs: 0,
      userMessage: telemetryUserMessage('permission'),
    };
  }

  return {
    kind: 'unknown',
    retryable: attempt < VEHICLE_TELEMETRY_RETRY.MAX_ATTEMPTS,
    backoffMs: computeTelemetryBackoffMs(attempt),
    userMessage: telemetryUserMessage('unknown'),
  };
}

export function combineAbortSignals(
  parent: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; wasTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const cleanup = () => {
    clearTimeout(timer);
    parent.removeEventListener('abort', onParentAbort);
  };

  const onParentAbort = () => {
    controller.abort();
    cleanup();
  };

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    cleanup();
  }, timeoutMs);

  if (parent.aborted) {
    controller.abort();
    cleanup();
    return { signal: controller.signal, cleanup, wasTimeout: () => timedOut };
  }

  parent.addEventListener('abort', onParentAbort, { once: true });
  return { signal: controller.signal, cleanup, wasTimeout: () => timedOut };
}
