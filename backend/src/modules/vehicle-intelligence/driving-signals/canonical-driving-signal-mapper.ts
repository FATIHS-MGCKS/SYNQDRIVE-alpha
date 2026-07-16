/**
 * Pure canonical DIMO signal mapper (P30).
 *
 * - Explicit unit normalization for documented DIMO units only.
 * - observedAt (provider) and receivedAt (ingest) are always separate.
 * - Missing / unsupported capability signals remain UNSUPPORTED.
 * - No detectors; altitude/heading are post-trip analysis context only.
 */
import {
  CANONICAL_DRIVING_SIGNAL_CATALOG_ALL,
  findCanonicalSignalDefinition,
  isSignalApplicableForFuelType,
} from './canonical-driving-signal-mapper.config';
import {
  CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION,
  CANONICAL_SIGNAL_PROVIDER_SOURCE,
  type CanonicalDrivingSignalMappingFailure,
  type CanonicalDrivingSignalMappingResult,
  type CanonicalDrivingSignalMappingSuccess,
  type CanonicalSignalMappingContext,
  type CanonicalSignalUnit,
  type CanonicalSignalUsageScope,
  type DimoProviderSignalSample,
} from './canonical-driving-signal-mapper.types';

const KW_TO_W = 1000;

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeProviderUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function unitKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

function resolveCanonicalUnit(
  providerUnit: string | null,
  defUnit: CanonicalSignalUnit,
  accepted: readonly string[],
): { unit: CanonicalSignalUnit; providerUnit: string | null } | { error: 'UNIT_UNKNOWN' } {
  if (!providerUnit) {
    return { unit: defUnit, providerUnit: null };
  }

  if (accepted.length === 0) {
    return { error: 'UNIT_UNKNOWN' };
  }

  const acceptedKeys = new Set(accepted.map(unitKey));
  if (!acceptedKeys.has(unitKey(providerUnit))) {
    return { error: 'UNIT_UNKNOWN' };
  }

  const normalized = unitKey(providerUnit);
  if (normalized === 'kw' || normalized === 'kilowatt') {
    return { unit: 'watt', providerUnit };
  }

  return { unit: defUnit, providerUnit };
}

function convertValueForUnit(
  value: number,
  providerUnit: string | null,
  targetUnit: CanonicalSignalUnit,
): number {
  if (providerUnit && unitKey(providerUnit) === 'kw' && targetUnit === 'watt') {
    return value * KW_TO_W;
  }
  return value;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isProviderNullValue(value: unknown): boolean {
  return value === null || value === undefined;
}

function isObservationStale(
  observedAt: Date,
  context: CanonicalSignalMappingContext,
): { stale: true; ageMs: number; staleAfterMs: number } | { stale: false } {
  const staleAfterMs = context.staleAfterMs;
  if (staleAfterMs == null || staleAfterMs <= 0) {
    return { stale: false };
  }
  const reference = context.referenceTime ?? context.batchReceivedAt ?? new Date();
  const ageMs = reference.getTime() - observedAt.getTime();
  if (ageMs > staleAfterMs) {
    return { stale: true, ageMs, staleAfterMs };
  }
  return { stale: false };
}

function buildFailure(
  partial: Omit<CanonicalDrivingSignalMappingFailure, 'mappingVersion' | 'tripDetectionEligible'>,
): CanonicalDrivingSignalMappingFailure {
  return {
    ...partial,
    tripDetectionEligible: false,
    mappingVersion: CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION,
  };
}

function buildSuccess(
  partial: Omit<
    CanonicalDrivingSignalMappingSuccess,
    'mappingVersion' | 'providerSource' | 'tripDetectionEligible'
  >,
): CanonicalDrivingSignalMappingSuccess {
  return {
    ...partial,
    tripDetectionEligible: false,
    mappingVersion: CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION,
    providerSource: CANONICAL_SIGNAL_PROVIDER_SOURCE,
  };
}

function resolveUsageScope(def: { postTripAnalysisContextOnly?: boolean }): CanonicalSignalUsageScope {
  return def.postTripAnalysisContextOnly ? 'POST_TRIP_ANALYSIS_CONTEXT' : 'DRIVING_ANALYSIS';
}

function supportedSet(context: CanonicalSignalMappingContext): Set<string> {
  return context.supportedDimoSignals instanceof Set
    ? context.supportedDimoSignals
    : new Set(context.supportedDimoSignals);
}

/**
 * Map one DIMO provider signal sample to the canonical Driving Intelligence signal model.
 */
export function mapDimoProviderSignalToCanonical(
  sample: DimoProviderSignalSample,
  context: CanonicalSignalMappingContext,
): CanonicalDrivingSignalMappingResult {
  const dimoSignalName = sample.dimoSignalName.trim();
  const def = findCanonicalSignalDefinition(dimoSignalName);

  if (!def) {
    return buildFailure({
      status: 'UNSUPPORTED',
      dimoSignalName,
      reason: 'unknown_dimo_signal',
    });
  }

  const usageScope = resolveUsageScope(def);

  if (!isSignalApplicableForFuelType(def, context.fuelType)) {
    return buildFailure({
      status: 'UNSUPPORTED',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'powertrain_not_applicable',
      usageScope,
    });
  }

  if (!supportedSet(context).has(def.dimoSignalName)) {
    return buildFailure({
      status: 'UNSUPPORTED',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'capability_not_supported',
      usageScope,
    });
  }

  if (isProviderNullValue(sample.value)) {
    return buildFailure({
      status: 'NULL_SAMPLE',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'provider_null_not_observation',
      usageScope,
      observedAt: parseDate(sample.observedAt),
    });
  }

  const observedAt = parseDate(sample.observedAt);
  if (!observedAt) {
    return buildFailure({
      status: 'INVALID_VALUE',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'invalid_numeric_value',
      usageScope,
    });
  }

  const receivedAt =
    parseDate(sample.receivedAt) ?? context.batchReceivedAt ?? observedAt;

  const stale = isObservationStale(observedAt, context);
  if (stale.stale) {
    return buildFailure({
      status: 'STALE',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'observation_stale',
      usageScope,
      observedAt,
      receivedAt,
      ageMs: stale.ageMs,
      staleAfterMs: stale.staleAfterMs,
    });
  }

  const numericValue = parseNumericValue(sample.value);
  if (numericValue == null) {
    return buildFailure({
      status: 'INVALID_VALUE',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'invalid_numeric_value',
      usageScope,
    });
  }

  const providerUnit = normalizeProviderUnit(sample.providerUnit);
  const unitResolution = resolveCanonicalUnit(
    providerUnit,
    def.canonicalUnit,
    def.acceptedProviderUnits,
  );

  if ('error' in unitResolution) {
    return buildFailure({
      status: 'UNIT_UNKNOWN',
      canonicalKey: def.key,
      dimoSignalName,
      reason: 'provider_unit_unknown',
      providerUnit,
      usageScope,
    });
  }

  const value = convertValueForUnit(numericValue, unitResolution.providerUnit, unitResolution.unit);

  return buildSuccess({
    status: 'SUPPORTED',
    canonicalKey: def.key,
    dimoSignalName,
    value,
    unit: unitResolution.unit,
    observedAt,
    receivedAt,
    providerUnit: unitResolution.providerUnit,
    usageScope,
  });
}

/** Map a batch of provider samples — order preserved, one result per input sample. */
export function mapDimoProviderSignalBatch(
  samples: readonly DimoProviderSignalSample[],
  context: CanonicalSignalMappingContext,
): CanonicalDrivingSignalMappingResult[] {
  return samples.map((sample) => mapDimoProviderSignalToCanonical(sample, context));
}

/** Catalog keys covered by this mapper version (for tests / diagnostics). */
export function listCanonicalDrivingSignalKeys(): readonly string[] {
  return CANONICAL_DRIVING_SIGNAL_CATALOG_ALL.map((def) => def.key);
}
