import { createHash } from 'crypto';

/**
 * Canonical source version for tire trip usage ledger rows.
 * Bump when attribution field semantics change (requires reprocessing).
 */
export const TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION = 'tire-trip-usage-ledger-2026-07-v1';

/**
 * Attribution policy: trips spanning an exact setup-change instant are NOT auto-split.
 * See docs/implementation/tire-trip-usage-attribution-policy-2026-07.md
 */
export const TIRE_TRIP_SETUP_CHANGE_SPLIT_POLICY = 'DEFERRED_MANUAL_REVIEW' as const;

export type TireTripUsageLedgerUpsertAction = 'CREATED' | 'UPDATED' | 'UNCHANGED';

export interface TripUsageDrivingImpactSummary {
  longitudinalStressScore?: number | null;
  brakingStressScore?: number | null;
  drivingStressScore?: number | null;
  hardAccelPer100Km?: number | null;
  hardBrakePer100Km?: number | null;
  tripAnalysisStatus?: string | null;
  drivingImpactStatus?: string | null;
  /** Set when authoritative trip evaluation marks usage as invalid (deleted trip, etc.). */
  invalidated?: boolean;
  invalidationReason?: string | null;
  [key: string]: unknown;
}

export interface TripUsageSourceFingerprintInput {
  sourceVersion: string;
  tripId: string;
  tireSetupId: string;
  tripStartedAt: string;
  tripEndedAt: string | null;
  distanceKm: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelerationCount: number;
  harshBrakingCount: number;
  harshCorneringCount: number;
  drivingImpactSummary?: TripUsageDrivingImpactSummary | null;
}

export interface TripUsageLedgerEntryInput extends TripUsageSourceFingerprintInput {
  organizationId: string;
  vehicleId: string;
  processedAt?: Date;
}

export interface TripUsageRoadSplitInput {
  distanceKm: number;
  citySharePercent?: number | null;
  highwaySharePercent?: number | null;
  /** VehicleTrip.countrySharePercent (rural roads). */
  countrySharePercent?: number | null;
}

function roundKm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function canonicalizeSummary(
  summary: TripUsageDrivingImpactSummary | null | undefined,
): Record<string, unknown> | null {
  if (!summary) return null;
  const sorted = Object.keys(summary)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = summary[key];
      return acc;
    }, {});
  return sorted;
}

/**
 * Deterministic fingerprint of the authoritative trip evaluation payload.
 * Repository updates rows only when this value changes.
 */
export function computeTripUsageSourceFingerprint(
  input: TripUsageSourceFingerprintInput,
): string {
  const payload = JSON.stringify({
    sourceVersion: input.sourceVersion,
    tripId: input.tripId,
    tireSetupId: input.tireSetupId,
    tripStartedAt: input.tripStartedAt,
    tripEndedAt: input.tripEndedAt,
    distanceKm: roundKm(input.distanceKm),
    cityKm: roundKm(input.cityKm),
    ruralKm: roundKm(input.ruralKm),
    highwayKm: roundKm(input.highwayKm),
    harshAccelerationCount: input.harshAccelerationCount,
    harshBrakingCount: input.harshBrakingCount,
    harshCorneringCount: input.harshCorneringCount,
    drivingImpactSummary: canonicalizeSummary(input.drivingImpactSummary),
  });
  return createHash('sha256').update(payload).digest('hex');
}

/** Derive road-type km splits from distance + share percents (country = rural). */
export function deriveTripUsageRoadKm(input: TripUsageRoadSplitInput): {
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
} {
  const distance = Math.max(0, input.distanceKm);
  const cityPct = Math.max(0, input.citySharePercent ?? 0);
  const highwayPct = Math.max(0, input.highwaySharePercent ?? 0);
  const ruralPct = Math.max(0, input.countrySharePercent ?? 0);

  const totalPct = cityPct + highwayPct + ruralPct;
  if (totalPct <= 0) {
    return { cityKm: 0, ruralKm: 0, highwayKm: 0 };
  }

  const scale = Math.min(1, 100 / totalPct);
  return {
    cityKm: roundKm((distance * cityPct * scale) / 100),
    highwayKm: roundKm((distance * highwayPct * scale) / 100),
    ruralKm: roundKm((distance * ruralPct * scale) / 100),
  };
}

export function buildTripUsageLedgerFingerprintInput(
  input: Omit<TripUsageSourceFingerprintInput, 'sourceVersion'> & {
    sourceVersion?: string;
  },
): TripUsageSourceFingerprintInput {
  return {
    ...input,
    sourceVersion: input.sourceVersion ?? TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  };
}

export function buildInvalidatedTripUsageFingerprintInput(args: {
  tripId: string;
  tireSetupId: string;
  tripStartedAt: string;
  tripEndedAt: string | null;
  invalidationReason: string;
}): TripUsageSourceFingerprintInput {
  return buildTripUsageLedgerFingerprintInput({
    tripId: args.tripId,
    tireSetupId: args.tireSetupId,
    tripStartedAt: args.tripStartedAt,
    tripEndedAt: args.tripEndedAt,
    distanceKm: 0,
    cityKm: 0,
    ruralKm: 0,
    highwayKm: 0,
    harshAccelerationCount: 0,
    harshBrakingCount: 0,
    harshCorneringCount: 0,
    drivingImpactSummary: {
      invalidated: true,
      invalidationReason: args.invalidationReason,
    },
  });
}
