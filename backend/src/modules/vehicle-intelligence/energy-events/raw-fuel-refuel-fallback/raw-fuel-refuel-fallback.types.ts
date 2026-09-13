import type { FuelType } from '@prisma/client';

/** Case-22 vehicle-level fuel telemetry capability (separate from signal trust). */
export type RawFuelCapability = 'FUEL_CAPABLE' | 'NON_FUEL_CAPABLE' | 'UNKNOWN';

export interface RawFuelCapabilityInput {
  /** Authoritative Vehicle.fuelType when available. */
  fuelType?: FuelType | null;
  /** Optional DIMO powertrainType string (secondary corroboration only). */
  dimoPowertrainType?: string | null;
  /** Optional DIMO fuelType string (secondary corroboration only). */
  dimoFuelType?: string | null;
}

export type RawFuelAbsoluteSignalTrust = 'TRUSTED' | 'UNTRUSTED' | 'UNKNOWN';

/** F4.1: detection channel admissibility — orthogonal to promotion trust. */
export type RawFuelAbsoluteDetectionAdmissibility =
  | 'ADMISSIBLE'
  | 'INADMISSIBLE'
  | 'UNKNOWN';

export interface RawFuelSignalTrustInput {
  /** Sample window under evaluation — relative availability only. */
  samples?: Array<{
    timestamp: Date;
    absoluteLiters?: number | null;
    relativePercent?: number | null;
  }>;
  scanWindowStart?: Date;
  scanWindowEnd?: Date;
  /** Must never be used to grant TRUSTED in F4-PR1 — kept for negative-test contracts. */
  fuelType?: FuelType | null;
  /** Must never be used to grant TRUSTED in F4-PR1 — kept for negative-test contracts. */
  samplePresenceOnly?: boolean;
}

export interface RawFuelSignalTrustResult {
  /** Promotion-authority axis — fail-closed UNKNOWN until fleet authority exists. */
  absoluteSignalTrust: RawFuelAbsoluteSignalTrust;
  /** Detection-admissibility axis — may be ADMISSIBLE while promotion trust stays UNKNOWN. */
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSignalAvailable: boolean;
}

/** F4 source semantics contract — documentation-only in PR1 (no runtime writes). */
export const VEHICLE_ENERGY_EVENT_SOURCE_SEMANTICS = {
  legacyPreMigration: {
    detectionSource: null,
    sourceEventKey: null,
    meaning: 'LEGACY_UNLABELED_NATIVE_ERA',
  },
  newNativeAfterDeploy: {
    detectionSource: 'DIMO_NATIVE' as const,
    sourceEventKey: null,
  },
  fallbackPromotionFuture: {
    detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' as const,
    sourceEventKey: 'RawRefuelCandidate.candidateIdentityKey',
  },
} as const;
