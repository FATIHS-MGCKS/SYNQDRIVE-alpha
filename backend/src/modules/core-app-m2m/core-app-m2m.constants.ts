/** Declared scope identifiers for registry validation (token exchange not implemented in P3-PR1). */
export const CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ = 'core:entitlements:read' as const;

/** Canonical vehicle read scope — aligned with SYNQDRIVE-CORE (singular `vehicle`). */
export const CORE_APP_M2M_SCOPE_VEHICLE_READ = 'core:app:vehicle:read' as const;

/** P3-PR1 allowlist — extend only via explicit owner-approved PRs. */
export const CORE_APP_M2M_KNOWN_SCOPES = [
  CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ,
  CORE_APP_M2M_SCOPE_VEHICLE_READ,
] as const;

export type CoreAppM2mKnownScope = (typeof CORE_APP_M2M_KNOWN_SCOPES)[number];