/** Declared scope identifiers for registry validation (token exchange not implemented in P3-PR1). */
export const CORE_APP_M2M_KNOWN_SCOPES = [
  'core:entitlements:read',
  'core:app:vehicles:read',
] as const;

export type CoreAppM2mKnownScope = (typeof CORE_APP_M2M_KNOWN_SCOPES)[number];