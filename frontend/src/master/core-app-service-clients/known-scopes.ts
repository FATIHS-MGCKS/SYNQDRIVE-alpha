/** Canonical scope allowlist — keep aligned with backend CORE_APP_M2M_KNOWN_SCOPES */
export const CORE_APP_SERVICE_CLIENT_KNOWN_SCOPES = [
  'core:entitlements:read',
  'core:app:vehicle:read',
] as const;

export function grantsVisibleForClient(
  selectedClientId: string | null,
  loadedForClientId: string | null,
): boolean {
  return selectedClientId !== null && selectedClientId === loadedForClientId;
}