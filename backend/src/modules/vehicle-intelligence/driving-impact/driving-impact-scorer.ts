/**
 * Driving Impact Engine V1 — Score Computation
 *
 * Pure functions — no I/O, no Prisma, no side effects.
 * All inputs and outputs are plain numbers.
 *
 * Normalization model: capLinear(rawValue, referenceMax) → 0-100
 * Each score is rounded to one decimal place.
 */

import {
  metricValueOrZero,
  normalizeEnergyPerKm,
  normalizeEventsPer100Km,
} from '../driving-metric-normalization/driving-metric-normalization';

import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Linear cap normalization.
 * Maps [0, referenceMax] → [0, 100], clamps above referenceMax at 100.
 */
export function capLinear(value: number, referenceMax: number): number {
  if (referenceMax <= 0 || !isFinite(value) || value < 0) return 0;
  return Math.min(100, (value / referenceMax) * 100);
}

/** Saturate a value at [0, 1]. */
function sat(value: number, referenceMax: number): number {
  if (referenceMax <= 0 || !isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / referenceMax));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Score functions ───────────────────────────────────────────────────────────

/**
 * Longitudinal Stress Score (0–100).
 *
 * Measures powertrain/transmission stress from aggressive acceleration,
 * kickdowns, and launch-like maneuvers.
 *
 * Formula:
 *   raw = 1.0×hardAccelPer100 + 1.8×extremeAccelPer100
 *       + 1.2×kickdownPer100 + 2.0×launchLikePer100
 *   score = capLinear(raw, LONGITUDINAL_RAW_MAX) → 0-100
 */
export function computeLongitudinalStressScore(input: {
  hardAccelPer100Km: number;
  extremeAccelPer100Km: number;
  kickdownPer100Km: number;
  launchLikePer100Km: number;
}): number {
  const { W } = { W: C.LONGITUDINAL_WEIGHTS };
  const raw =
    W.hardAccel * input.hardAccelPer100Km +
    W.extremeAccel * input.extremeAccelPer100Km +
    W.kickdown * input.kickdownPer100Km +
    W.launchLike * input.launchLikePer100Km;

  return round1(capLinear(raw, C.LONGITUDINAL_RAW_MAX));
}

/**
 * Braking Stress Score (0–100).
 *
 * Measures brake system and tire stress from aggressive/frequent braking.
 * p95NegativeDecel is used raw (m/s²) and normalized by P95_DECEL_REFERENCE
 * before applying its weight.
 *
 * Formula:
 *   raw = 1.0×hardBrakePer100 + 1.8×extremeBrakePer100
 *       + 2.2×fullBrakingPer100 + 0.4×brakesPer100
 *       + 0.8×(p95NegativeDecel / P95_DECEL_REFERENCE × P95_DECEL_REFERENCE)
 */
export function computeBrakingStressScore(input: {
  hardBrakePer100Km: number;
  extremeBrakePer100Km: number;
  fullBrakingPer100Km: number;
  brakesPer100Km: number;
  p95NegativeDecel: number;
}): number {
  const { W } = { W: C.BRAKING_WEIGHTS };
  // Scale p95 to be comparable with per-100km rates
  // (a p95 of 9 m/s² = EXTREME contributes W.p95Decel × 9 ≈ 7.2 raw points)
  const raw =
    W.hardBrake * input.hardBrakePer100Km +
    W.extremeBrake * input.extremeBrakePer100Km +
    W.fullBrake * input.fullBrakingPer100Km +
    W.brakesPer100 * input.brakesPer100Km +
    W.p95Decel * input.p95NegativeDecel;

  return round1(capLinear(raw, C.BRAKING_RAW_MAX));
}

/**
 * Stop-Go Stress Score (0–100).
 *
 * Represents urban stop-and-go burden on tires and brakes.
 * Blends city share, stop density, and braking frequency.
 */
export function computeStopGoStressScore(input: {
  citySharePct: number;
  stopDensity: number;
  brakesPer100Km: number;
}): number {
  const B = C.STOP_GO_BLEND;
  const cityFactor = sat(input.citySharePct, 100);
  const stopFactor = sat(input.stopDensity, C.STOP_DENSITY_REFERENCE);
  const brakeFactor = sat(input.brakesPer100Km, C.BRAKES_PER_100_REFERENCE);

  const raw =
    B.cityFactor * cityFactor +
    B.stopFactor * stopFactor +
    B.brakeFactor * brakeFactor;

  return round1(raw * 100);
}

/**
 * High-Speed Stress Score (0–100).
 *
 * Represents stress from sustained high-speed exposure and high-speed braking.
 * Key input for brake disc thermal wear.
 */
export function computeHighSpeedStressScore(input: {
  highwaySharePct: number;
  highSpeedBrakeShare: number;
}): number {
  const B = C.HIGH_SPEED_BLEND;
  const highwayFactor = sat(input.highwaySharePct, 100);
  const highSpeedBrakeFactor = Math.min(1, Math.max(0, input.highSpeedBrakeShare));

  const raw =
    B.highwayFactor * highwayFactor +
    B.highSpeedBrakeFactor * highSpeedBrakeFactor;

  return round1(raw * 100);
}

/**
 * Thermal Brake Stress Score (0–100).
 *
 * Models heat build-up risk in brake components.
 * Primary input for Brake Health V2 disc wear logic.
 *
 * Combines: high-speed braking share, full-braking intensity,
 * mean kinetic energy dissipation, and p95 deceleration.
 */
export function computeThermalBrakeStressScore(input: {
  highSpeedBrakeShare: number;
  fullBrakingPer100Km: number;
  meanBrakeEnergyPerKm: number;
  p95NegativeDecel: number;
}): number {
  const B = C.THERMAL_BLEND;
  const highSpeedBrakeFactor = Math.min(1, Math.max(0, input.highSpeedBrakeShare));
  const fullBrakingFactor = sat(input.fullBrakingPer100Km, C.FULL_BRAKING_PER_100_REFERENCE);
  const energyFactor = sat(input.meanBrakeEnergyPerKm, C.BRAKE_ENERGY_REFERENCE);
  const p95Factor = sat(input.p95NegativeDecel, C.P95_DECEL_REFERENCE);

  const raw =
    B.highSpeedBrakeShare * highSpeedBrakeFactor +
    B.fullBrakingFactor * fullBrakingFactor +
    B.energyFactor * energyFactor +
    B.p95Factor * p95Factor;

  return round1(raw * 100);
}

/**
 * Composite vehicle stress / Fahrbelastung score (0–100).
 *
 * Weighted blend of component stress scores. Higher = more vehicle load.
 * Do NOT interpret as driver quality or safety compliance.
 */
export function computeDrivingStressScore(input: {
  longitudinalStressScore: number;
  brakingStressScore: number;
  stopGoStressScore: number;
  highSpeedStressScore: number;
}): number {
  const W = C.DRIVING_STRESS_WEIGHTS;
  return round1(
    W.longitudinal * input.longitudinalStressScore +
    W.braking * input.brakingStressScore +
    W.stopGo * input.stopGoStressScore +
    W.highSpeed * input.highSpeedStressScore,
  );
}

/**
 * @deprecated Alias for `computeDrivingStressScore`. Legacy name implied positive driving style.
 */
export const computeDrivingStyleScore = computeDrivingStressScore;

/**
 * @deprecated Speeding/Safety score retired from rental and new impact writes.
 * Retained for historical reference only — do not use in new domain logic.
 */
export function computeSafetyScore(input: {
  speedingExposurePct: number;
  maxOverSpeedKmh: number;
  avgOverSpeedKmh: number;
  speedingSectionCount: number;
}): number {
  const W = C.SAFETY_WEIGHTS;
  const exposurePenalty = Math.min(
    W.maxExposurePenalty,
    Math.max(0, input.speedingExposurePct) * W.exposurePenaltyPerPct,
  );
  const severityPenalty = Math.min(
    W.maxSeverityPenalty,
    Math.max(0, input.maxOverSpeedKmh) * W.maxOverPenaltyPerKmh +
      Math.max(0, input.avgOverSpeedKmh) * W.avgOverPenaltyPerKmh,
  );
  const sectionPenalty = Math.min(
    W.maxSectionPenalty,
    Math.max(0, input.speedingSectionCount) * W.sectionPenalty,
  );
  const score = Math.max(0, Math.min(100, 100 - exposurePenalty - severityPenalty - sectionPenalty));
  return round1(score);
}

// ── Safety-data presence helpers ──────────────────────────────────────────────

/**
 * Subset of `VehicleTrip` fields that determine whether the trip carries any
 * meaningful speed-limit / route-analysis output. Kept structurally typed so
 * both `VehicleTrip` (Prisma) and the smaller TripProjection used inside
 * `TripAnalyticsCanonicalService` can be fed directly without `any`-casts.
 */
export interface SpeedingDataInput {
  speedingExposurePct?: number | null;
  maxOverSpeedKmh?: number | null;
  avgOverSpeedKmh?: number | null;
  speedingSectionCount?: number | null;
  speedingDistanceM?: number | null;
  speedingDurationS?: number | null;
}

/**
 * Returns true only when at least one speeding-relevant field is non-null —
 * i.e. route/mapbox enrichment has run. Distinguishes "no data" from
 * "data present and zero speeding". Used to gate `computeSafetyScore`.
 *
 * - All fields null  ⇒ `false` (no enrichment) ⇒ caller must yield safetyScore = null.
 * - Any field present (even 0) ⇒ `true` (data is real) ⇒ caller may compute the score.
 */
export function hasSpeedingDataFromTrip(trip: SpeedingDataInput): boolean {
  return (
    trip.speedingExposurePct != null ||
    trip.maxOverSpeedKmh != null ||
    trip.avgOverSpeedKmh != null ||
    trip.speedingSectionCount != null ||
    trip.speedingDistanceM != null ||
    trip.speedingDurationS != null
  );
}

/**
 * Map a per-trip speeding-data presence into a coarse confidence label that
 * UIs can render directly. Only used at trip granularity; subject/booking
 * aggregates compute their own confidence based on `scoredTripCount` +
 * `totalDistanceKm` (see `DriverScoreService`).
 */
export function safetyDataConfidenceFromTrip(
  trip: SpeedingDataInput,
): 'none' | 'low' | 'medium' | 'high' {
  if (!hasSpeedingDataFromTrip(trip)) return 'none';
  // If the canonical exposure metric is present, trust the run.
  if (trip.speedingExposurePct != null) return 'high';
  // Section / over-speed metrics alone still indicate run, but partially.
  if (trip.speedingSectionCount != null || trip.maxOverSpeedKmh != null) {
    return 'medium';
  }
  return 'low';
}

// ── Behavioral metric derivations ─────────────────────────────────────────────

/**
 * Per-100 km normalization. Returns null if distanceKm is too small to be reliable.
 * @deprecated Prefer `normalizeEventsPer100Km` from driving-metric-normalization (P44).
 */
export function per100Km(count: number, distanceKm: number): number {
  return normalizeEventsPer100Km(count, { distanceKm, durationHours: null }).value ?? 0;
}

/**
 * Sum kinetic energy factor across braking events (m²/s²) without distance division.
 */
export function sumBrakeEnergy(
  events: { startSpeedKmh: number; endSpeedKmh: number }[],
): number {
  if (events.length === 0) return 0;
  const kmhToMs = 1 / 3.6;
  const total = events.reduce((sum, e) => {
    const v1 = e.startSpeedKmh * kmhToMs;
    const v2 = e.endSpeedKmh * kmhToMs;
    const delta = 0.5 * (v1 * v1 - v2 * v2);
    return sum + (delta > 0 ? delta : 0);
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Mean kinetic energy factor per km across all braking events.
 * @deprecated Prefer `normalizeEnergyPerKm` from driving-metric-normalization (P44).
 */
export function meanBrakeEnergyPerKm(
  events: { startSpeedKmh: number; endSpeedKmh: number }[],
  distanceKm: number,
): number {
  return metricValueOrZero(
    normalizeEnergyPerKm(sumBrakeEnergy(events), { distanceKm, durationHours: null }),
  );
}

/**
 * P95 of an array of deceleration magnitudes (m/s²).
 * Returns 0 if the array is empty.
 */
export function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return Math.round((sorted[Math.min(idx, sorted.length - 1)] ?? 0) * 100) / 100;
}
