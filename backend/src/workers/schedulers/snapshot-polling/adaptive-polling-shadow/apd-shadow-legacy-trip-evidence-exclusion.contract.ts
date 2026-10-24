/**
 * Frozen APDS shadow reconciliation evidence exclusion (APDS P1).
 *
 * Invalid legacy development trips must not block reconciliation or LV bootstrap.
 * Does not mutate vehicle_trips or Trip FSM — shadow query corpus only.
 */
export const APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_REASON =
  'INVALID_LEGACY_DEVELOPMENT_TRIP_EVIDENCE' as const;

export type ApdShadowLegacyTripEvidenceExclusionReason =
  typeof APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_REASON;

/** HMÜ C 215 (VW Arteon) — read-only production audit 2026-10-24. */
export const APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID =
  '8c850ff1-4201-432b-af2e-2711dbc7ca48' as const;

/** Open-interval legacy rows since 2026-08-01 / 2026-08-02 (production PostgreSQL). */
export const APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED_TRIP_IDS = [
  '00842a6e-3d87-45a3-ab82-bdb0928f7f63',
  'ba613969-577d-4992-b358-09a6022fa75a',
] as const;

export function isApdShadowLegacyTripEvidenceExclusionVehicle(vehicleId: string): boolean {
  return vehicleId === APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID;
}

export function apdShadowLegacyTripEvidenceExcludedTripIdSet(): ReadonlySet<string> {
  return new Set(APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED_TRIP_IDS);
}
