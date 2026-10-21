import type { AxiosError } from 'axios';

export class DimoProviderBudgetError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BUDGET_DISABLED'
      | 'ACQUIRE_TIMEOUT'
      | 'REDIS_UNAVAILABLE'
      | 'LOW_PRIORITY_CAP'
      | 'PROVIDER_COOLDOWN',
    readonly category?: string,
  ) {
    super(message);
    this.name = 'DimoProviderBudgetError';
  }
}

export class DimoRateLimitedError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
    readonly category?: string,
    readonly httpStatus = 429,
  ) {
    super(message);
    this.name = 'DimoRateLimitedError';
  }
}

export class DimoRetryableHttpError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'DimoRetryableHttpError';
  }
}

export function readAxiosStatus(error: unknown): number | undefined {
  const axiosError = error as AxiosError | undefined;
  return axiosError?.response?.status;
}

export function isAxiosTimeout(error: unknown): boolean {
  const axiosError = error as AxiosError | undefined;
  const code = axiosError?.code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
}

export function isRetryableDimoHttpError(error: unknown): boolean {
  const status = readAxiosStatus(error);
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (isAxiosTimeout(error)) return true;
  const axiosError = error as AxiosError | undefined;
  const code = axiosError?.code;
  return code === 'ENOTFOUND' || code === 'ECONNRESET';
}

export function isNonRetryableDimoHttpError(error: unknown): boolean {
  const status = readAxiosStatus(error);
  if (status === undefined) return false;
  if (status === 429) return false;
  if (status >= 500) return false;
  if (status === 408) return false;
  return status >= 400 && status < 500;
}

/**
 * Parse Retry-After header (seconds or HTTP-date). Returns capped milliseconds.
 */
export function parseRetryAfterMs(
  headerValue: string | number | undefined | null,
  capMs: number,
  now = Date.now(),
): number | null {
  if (headerValue === undefined || headerValue === null || headerValue === '') {
    return null;
  }

  if (typeof headerValue === 'number' && Number.isFinite(headerValue)) {
    return Math.min(Math.max(0, headerValue) * 1000, capMs);
  }

  const raw = String(headerValue).trim();
  if (!raw) return null;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, capMs);
  }

  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(0, asDate - now), capMs);
  }

  return Math.min(1_000, capMs);
}

export function readRetryAfterMsFromError(
  error: unknown,
  capMs: number,
  now = Date.now(),
): number | null {
  const axiosError = error as AxiosError | undefined;
  const header = axiosError?.response?.headers?.['retry-after'];
  return parseRetryAfterMs(header as string | undefined, capMs, now);
}

export function computeExponentialBackoffMs(
  attempt: number,
  baseMs = 500,
  maxMs = 30_000,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.min(250, exp * 0.2));
  return exp + jitter;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
