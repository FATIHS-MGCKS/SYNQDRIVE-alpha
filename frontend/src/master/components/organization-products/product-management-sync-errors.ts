export const SYNC_REFRESH_FAILED_PREFIX = 'SYNC_REFRESH_FAILED:';

export function syncRefreshFailedError(detail: string): Error {
  return new Error(`${SYNC_REFRESH_FAILED_PREFIX} ${detail}`);
}

export function formatPostMutationSyncFailure(err: unknown): string {
  if (err instanceof Error && err.message.startsWith(SYNC_REFRESH_FAILED_PREFIX)) {
    const detail = err.message.slice(SYNC_REFRESH_FAILED_PREFIX.length).trim();
    return `Die Änderung wurde gespeichert, die Ansicht konnte jedoch nicht aktualisiert werden (${detail}). Bitte „Aktualisieren“ nutzen.`;
  }
  return err instanceof Error ? err.message : 'Aktualisierung nach erfolgreicher Aktion fehlgeschlagen';
}

export function shouldApplyGrantLoadResult(
  requestId: number,
  activeRequestId: number,
  productSlug: string,
  activeProductSlug: string | null,
): boolean {
  return requestId === activeRequestId && activeProductSlug === productSlug;
}