import type { ActiveExtractionPointer } from './document-extraction.types';

const SESSION_KEY = 'synqdrive_rental_active_extraction';

export function readActiveExtractionPointer(): ActiveExtractionPointer | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExtractionPointer & { vehicleId?: string | null; orgId?: string };
    if (!parsed?.extractionId) return null;
    if (parsed.orgId) {
      return {
        orgId: parsed.orgId,
        extractionId: parsed.extractionId,
        vehicleId: parsed.vehicleId ?? null,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
    // Legacy pointer (pre V4.9.641): vehicleId required, orgId inferred by caller.
    if (!parsed.vehicleId) return null;
    return {
      orgId: '',
      extractionId: parsed.extractionId,
      vehicleId: parsed.vehicleId,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
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
