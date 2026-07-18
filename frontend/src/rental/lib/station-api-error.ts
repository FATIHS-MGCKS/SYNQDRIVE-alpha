export type StationApiErrorInfo = {
  message: string;
  status?: number;
  isNotFound: boolean;
  isPermissionDenied: boolean;
};

function readErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/** Classify fetch failures for station surfaces (404 vs 403 vs generic API error). */
export function resolveStationApiError(error: unknown, fallback: string): StationApiErrorInfo {
  const message = readErrorMessage(error, fallback);
  const status = readErrorStatus(error);
  const normalized = message.toLowerCase();

  const isNotFound =
    status === 404 ||
    normalized.includes('not found') ||
    /api error 404\b/i.test(message);

  const isPermissionDenied =
    status === 403 ||
    status === 401 ||
    normalized.includes('forbidden') ||
    normalized.includes('permission') ||
    normalized.includes('not allowed') ||
    /api error 403\b/i.test(message);

  return {
    message,
    status,
    isNotFound,
    isPermissionDenied,
  };
}
