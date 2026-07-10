import type { ActiveExtractionPointer } from './document-extraction.types';

const SESSION_KEY = 'synqdrive_rental_active_extraction';

export function readActiveExtractionPointer(): ActiveExtractionPointer | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExtractionPointer;
    if (!parsed?.vehicleId || !parsed?.extractionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeActiveExtractionPointer(pointer: ActiveExtractionPointer | null): void {
  try {
    if (!pointer) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(pointer));
  } catch {
    /* ignore quota / private mode */
  }
}
