import { ApiHttpError, getApiErrorCode, isApiHttpError, isRetryableHttpError } from '../../lib/httpError';

export const HANDOVER_DRAFT_AUTOSAVE_MS = 800;
export const HANDOVER_DRAFT_MAX_RETRIES = 3;
export const HANDOVER_DRAFT_RETRY_BASE_MS = 400;

export type HandoverDraftSaveStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'conflict'
  | 'error';

export const HANDOVER_DRAFT_VERSION_CONFLICT = 'HANDOVER_DRAFT_VERSION_CONFLICT';

export interface HandoverDraftConflictInfo {
  expectedVersion: number;
  serverVersion: number;
  message: string;
}

export function isHandoverDraftVersionConflict(err: unknown): boolean {
  return getApiErrorCode(err) === HANDOVER_DRAFT_VERSION_CONFLICT;
}

export function extractDraftConflict(err: unknown): HandoverDraftConflictInfo | null {
  if (!isHandoverDraftVersionConflict(err)) return null;
  const body = isApiHttpError(err) ? err.body : undefined;
  const serverVersion = typeof body?.currentVersion === 'number' ? body.currentVersion : 0;
  return {
    expectedVersion: 0,
    serverVersion,
    message:
      typeof body?.message === 'string'
        ? body.message
        : 'Der Entwurf wurde parallel bearbeitet.',
  };
}

export async function withDraftSaveRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: { isOnline?: () => boolean },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= HANDOVER_DRAFT_MAX_RETRIES; attempt += 1) {
    if (options?.isOnline && !options.isOnline()) {
      throw new Error('offline');
    }
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (isHandoverDraftVersionConflict(err)) throw err;
      if (!isRetryableHttpError(err) || attempt >= HANDOVER_DRAFT_MAX_RETRIES) throw err;
      const delay = HANDOVER_DRAFT_RETRY_BASE_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export const HANDOVER_DRAFT_STEP_LABELS: Record<string, string> = {
  vehicle: 'Fahrzeug',
  condition: 'Zustand',
  damages: 'Schäden',
  documents: 'Dokumente',
  signatures: 'Unterschriften',
  review: 'Abschluss',
};

export function dispatchHandoverDraftEvent(name: 'handover:draft-saved' | 'handover:draft-cleared'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}
