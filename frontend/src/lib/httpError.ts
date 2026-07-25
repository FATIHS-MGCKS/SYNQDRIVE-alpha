export interface ApiErrorBody {
  message?: unknown;
  code?: string;
  currentVersion?: number;
  lockedByUserId?: string;
  draftId?: string;
  version?: number;
  [key: string]: unknown;
}

/** Normalize NestJS / validation error bodies into a user-visible string. */
export function formatHttpErrorMessage(
  body: { message?: unknown },
  status: number,
  path: string,
): string {
  const raw = body.message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  if (raw && typeof raw === 'object') {
    const nested = raw as {
      message?: unknown;
      code?: unknown;
      missing?: unknown;
      error?: unknown;
    };
    const base =
      typeof nested.message === 'string'
        ? nested.message
        : typeof nested.error === 'string'
          ? nested.error
          : 'Request failed';
    const code = typeof nested.code === 'string' ? nested.code : undefined;
    const withCode = code ? `[${code}] ${base}` : base;
    if (Array.isArray(nested.missing) && nested.missing.length > 0) {
      return `${withCode}: ${nested.missing.map(String).join(', ')}`;
    }
    return withCode;
  }
  return `API error ${status} (${path})`;
}

export class ApiHttpError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;
  readonly path: string;

  constructor(status: number, body: ApiErrorBody, path: string) {
    super(formatHttpErrorMessage(body, status, path));
    this.name = 'ApiHttpError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

export function isApiHttpError(err: unknown): err is ApiHttpError {
  return err instanceof ApiHttpError;
}

export function getApiErrorCode(err: unknown): string | undefined {
  if (isApiHttpError(err)) return err.body.code;
  if (err && typeof err === 'object' && 'body' in err) {
    const body = (err as { body?: ApiErrorBody }).body;
    return typeof body?.code === 'string' ? body.code : undefined;
  }
  return undefined;
}

export function isRetryableHttpError(err: unknown): boolean {
  if (isApiHttpError(err)) {
    if (err.status === 408 || err.status === 429) return true;
    if (err.status >= 500) return true;
    return false;
  }
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.name === 'AbortError') return false;
  return false;
}
