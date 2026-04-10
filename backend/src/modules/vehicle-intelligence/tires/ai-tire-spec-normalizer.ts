/**
 * AI Tire Spec — Normalization, Validation, Persistence Builder
 *
 * Single-responsibility module for:
 *  1. Coercing raw AI output into strongly-typed spec fields
 *  2. Validating and clamping values into acceptable ranges
 *  3. Building the persisted JSON blob with source metadata
 *
 * RULES:
 *  - unknown / malformed values become null (never invented)
 *  - enums are normalized to lowercase canonical forms or null
 *  - numeric values are clamped to physically plausible ranges
 *  - booleans accept true/false/"true"/"false"/1/0
 *  - this module NEVER touches manual tread, calibration, or current-state fields
 */

import { AiTireSpec } from './tire-health.config';

// ── Canonical enum sets ─────────────────────────────────────────────────────

const SEASON_TYPES = new Set(['summer', 'winter', 'all_season']);
const VEHICLE_CLASS_FITS = new Set(['passenger', 'suv', 'van', 'truck', 'sport', 'luxury', 'commercial']);
const INTENDED_USES = new Set(['touring', 'sport', 'off_road', 'urban', 'highway', 'mixed', 'comfort', 'eco', 'track', 'economy']);
const TIRE_ARCHETYPES = new Set([
  'touring', 'comfort', 'sport', 'ultra_high_performance', 'performance',
  'all_terrain', 'mud_terrain', 'winter_studded', 'winter_non_studded', 'winter_performance',
  'eco', 'van_commercial', 'run_flat', 'ev_optimized', 'highway',
  'luxury', 'commercial', 'budget', 'default',
]);
const SPEC_SOURCE_TYPES = new Set(['ai_agent', 'manual', 'import', 'ocr']);

// ── Persisted AI Tire Spec shape (extends AiTireSpec with metadata) ─────────

export interface PersistedAiTireSpec extends AiTireSpec {
  userConfirmedSpec: boolean;
  specSourceType: string;
  tireSpecConfidence: number | null;
  fetchedAt: string;
  jobId: string | null;
  normalizedAt: string;
}

// ── Validation report ───────────────────────────────────────────────────────

export interface AiTireSpecValidation {
  valid: boolean;
  hasStructuredData: boolean;
  fieldCount: number;
  nullFieldCount: number;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toNormalizedEnum(v: unknown, allowed: Set<string>): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.has(s) ? s : null;
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

function toFiniteNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Clamp a numeric value to [min, max], returning null if input is null. */
function clamp(v: number | null, min: number, max: number): number | null {
  if (v == null) return null;
  return Math.max(min, Math.min(max, v));
}

function toUrlOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return null;
}

// ── Main normalizer ─────────────────────────────────────────────────────────

/**
 * Normalize raw AI agent output into a clean AiTireSpec.
 * Accepts any Record (typically from JSON parse of agent response).
 * Returns a fully-typed spec with nulls for unknown/invalid fields.
 */
export function normalizeAiTireSpecResult(
  raw: Record<string, unknown> | null | undefined,
): AiTireSpec {
  const empty = buildEmptySpec();
  if (!raw || typeof raw !== 'object') return empty;

  return {
    matchedBrand: toStringOrNull(raw.matchedBrand),
    matchedModel: toStringOrNull(raw.matchedModel),
    matchedVariant: toStringOrNull(raw.matchedVariant),
    tireSizeRaw: toStringOrNull(raw.tireSizeRaw),
    widthMm: clamp(toFiniteNumberOrNull(raw.widthMm), 100, 400),
    aspectRatio: clamp(toFiniteNumberOrNull(raw.aspectRatio), 20, 90),
    rimDiameterInch: clamp(toFiniteNumberOrNull(raw.rimDiameterInch), 10, 26),
    loadIndex: toStringOrNull(raw.loadIndex),
    speedIndex: toStringOrNull(raw.speedIndex),
    seasonType: toNormalizedEnum(raw.seasonType, SEASON_TYPES),
    vehicleClassFit: toNormalizedEnum(raw.vehicleClassFit, VEHICLE_CLASS_FITS),
    runFlat: toBoolOrNull(raw.runFlat),
    reinforced: toBoolOrNull(raw.reinforced),
    xl: toBoolOrNull(raw.xl),
    evOptimized: toBoolOrNull(raw.evOptimized),
    maxLoadKg: clamp(toFiniteNumberOrNull(raw.maxLoadKg), 200, 4000),
    maxInflationKpa: clamp(toFiniteNumberOrNull(raw.maxInflationKpa), 150, 500),
    maxInflationPsi: clamp(toFiniteNumberOrNull(raw.maxInflationPsi), 20, 80),
    newTreadDepthMm: clamp(toFiniteNumberOrNull(raw.newTreadDepthMm), 4.0, 16.0),
    legalMinimumMm: clamp(toFiniteNumberOrNull(raw.legalMinimumMm), 1.0, 3.0),
    recommendedReplacementDepthMm: clamp(toFiniteNumberOrNull(raw.recommendedReplacementDepthMm), 1.6, 6.0),
    operationalReplacementDepthMm: clamp(toFiniteNumberOrNull(raw.operationalReplacementDepthMm), 1.6, 6.0),
    intendedUse: toNormalizedEnum(raw.intendedUse, INTENDED_USES),
    longevityBias: clamp(toFiniteNumberOrNull(raw.longevityBias), 0.0, 2.0),
    aggressiveDrivingSensitivity: clamp(toFiniteNumberOrNull(raw.aggressiveDrivingSensitivity), 0.0, 2.0),
    underinflationSensitivity: clamp(toFiniteNumberOrNull(raw.underinflationSensitivity), 0.0, 2.0),
    heatSensitivity: clamp(toFiniteNumberOrNull(raw.heatSensitivity), 0.0, 2.0),
    payloadBias: clamp(toFiniteNumberOrNull(raw.payloadBias), 0.0, 2.0),
    urbanBias: clamp(toFiniteNumberOrNull(raw.urbanBias), 0.0, 2.0),
    highwayBias: clamp(toFiniteNumberOrNull(raw.highwayBias), 0.0, 2.0),
    tireArchetype: toNormalizedEnum(raw.tireArchetype, TIRE_ARCHETYPES),
    confidenceScore: clamp(toFiniteNumberOrNull(raw.confidenceScore), 0, 100),
    manufacturerSourceUrl: toUrlOrNull(raw.manufacturerSourceUrl),
    labelSourceUrl: toUrlOrNull(raw.labelSourceUrl),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a normalized AiTireSpec. Returns a report with warnings
 * for implausible values. Does NOT reject — the caller decides.
 */
export function validateAiTireSpec(spec: AiTireSpec): AiTireSpecValidation {
  const warnings: string[] = [];
  const entries = Object.entries(spec);
  const nonNull = entries.filter(([, v]) => v != null);

  if (!spec.matchedBrand && !spec.matchedModel) {
    warnings.push('No matched brand or model — spec match quality is unknown');
  }
  if (spec.confidenceScore != null && spec.confidenceScore < 30) {
    warnings.push(`Low confidence score: ${spec.confidenceScore}`);
  }
  if (spec.newTreadDepthMm != null && spec.legalMinimumMm != null) {
    if (spec.newTreadDepthMm <= spec.legalMinimumMm) {
      warnings.push('newTreadDepthMm <= legalMinimumMm — likely incorrect');
    }
  }
  if (spec.operationalReplacementDepthMm != null && spec.legalMinimumMm != null) {
    if (spec.operationalReplacementDepthMm < spec.legalMinimumMm) {
      warnings.push('operationalReplacementDepthMm < legalMinimumMm — implausible');
    }
  }
  if (spec.newTreadDepthMm != null && spec.operationalReplacementDepthMm != null) {
    if (spec.newTreadDepthMm <= spec.operationalReplacementDepthMm) {
      warnings.push('newTreadDepthMm <= operationalReplacementDepthMm — replacement before new?');
    }
  }

  return {
    valid: nonNull.length > 0,
    hasStructuredData: nonNull.length >= 3,
    fieldCount: nonNull.length,
    nullFieldCount: entries.length - nonNull.length,
    warnings,
  };
}

// ── Persistence builder ─────────────────────────────────────────────────────

/**
 * Build the JSON blob to persist on VehicleTireSetup.aiTireSpec.
 * Merges normalized spec fields with source metadata.
 * Only known fields are stored — no arbitrary pass-through.
 */
export function buildPersistedAiTireSpec(
  normalized: AiTireSpec,
  metadata: {
    jobId: string | null;
    confidenceScore: number | null;
    completedAt: string | null;
    specSourceType?: string;
  },
): PersistedAiTireSpec {
  return {
    ...normalized,
    userConfirmedSpec: true,
    specSourceType: toNormalizedEnum(metadata.specSourceType ?? 'ai_agent', SPEC_SOURCE_TYPES) ?? 'ai_agent',
    tireSpecConfidence: metadata.confidenceScore,
    fetchedAt: metadata.completedAt ?? new Date().toISOString(),
    jobId: metadata.jobId,
    normalizedAt: new Date().toISOString(),
  };
}

// ── Empty spec ──────────────────────────────────────────────────────────────

function buildEmptySpec(): AiTireSpec {
  return {
    matchedBrand: null, matchedModel: null, matchedVariant: null,
    tireSizeRaw: null, widthMm: null, aspectRatio: null, rimDiameterInch: null,
    loadIndex: null, speedIndex: null, seasonType: null, vehicleClassFit: null,
    runFlat: null, reinforced: null, xl: null, evOptimized: null,
    maxLoadKg: null, maxInflationKpa: null, maxInflationPsi: null,
    newTreadDepthMm: null, legalMinimumMm: null,
    recommendedReplacementDepthMm: null, operationalReplacementDepthMm: null,
    intendedUse: null, longevityBias: null, aggressiveDrivingSensitivity: null,
    underinflationSensitivity: null, heatSensitivity: null, payloadBias: null,
    urbanBias: null, highwayBias: null, tireArchetype: null,
    confidenceScore: null, manufacturerSourceUrl: null, labelSourceUrl: null,
  };
}
