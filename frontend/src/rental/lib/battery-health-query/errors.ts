export function isBatteryHealthAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function mapBatteryHealthQueryError(error: unknown): string {
  if (isBatteryHealthAbortError(error)) return '';
  if (error instanceof Error && error.message) return error.message;
  return 'Batterie-Daten konnten nicht geladen werden';
}
