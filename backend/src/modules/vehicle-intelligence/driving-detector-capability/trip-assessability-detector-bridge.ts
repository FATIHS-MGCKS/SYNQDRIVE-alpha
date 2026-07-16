/**
 * Bridge detector capability resolver → trip assessability snapshot (P32).
 */
import type { TripAssessabilityCapabilitySnapshot } from '../trip-assessability/trip-assessability.types';
import { TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION } from '../trip-assessability/trip-assessability.types';
import type { DrivingDetectorCapabilityResult } from './driving-detector-capability.types';

function aggregateMetrics(result: DrivingDetectorCapabilityResult): {
  coverage: number | null;
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
} {
  const coverages = result.detectors
    .map((d) => d.coverage)
    .filter((v): v is number => v != null);
  const effective = result.detectors
    .map((d) => d.effectiveCadenceMs)
    .filter((v): v is number => v != null);
  const p95 = result.detectors
    .map((d) => d.p95CadenceMs)
    .filter((v): v is number => v != null);
  return {
    coverage: coverages.length ? Math.min(...coverages) : null,
    effectiveCadenceMs: effective.length ? Math.max(...effective) : null,
    p95CadenceMs: p95.length ? Math.max(...p95) : null,
  };
}

/**
 * Maps central detector resolver output into the assessability policy capability snapshot.
 */
export function buildTripAssessabilityCapabilitySnapshot(
  detectorResult: DrivingDetectorCapabilityResult,
): TripAssessabilityCapabilitySnapshot {
  const native = detectorResult.detectors.find((d) => d.detectorKey === 'native_harsh_events');
  const idling = detectorResult.detectors.find((d) => d.detectorKey === 'idling_segment');
  const metrics = aggregateMetrics(detectorResult);

  const nativeBehaviorSupported =
    native?.status === 'PRODUCTION'
      ? true
      : native?.status === 'UNSUPPORTED' || native?.status === 'TEMPORARILY_DEGRADED'
        ? false
        : native
          ? null
          : null;

  const hfCadenceSufficient =
    metrics.effectiveCadenceMs == null
      ? null
      : metrics.effectiveCadenceMs <= 10_000 && (metrics.p95CadenceMs ?? 0) <= 20_000;

  const routeSupported =
    idling?.status === 'CONTEXT_ONLY' ||
    idling?.status === 'SHADOW' ||
    idling?.status === 'PROVIDER_DEPENDENT' ||
    idling?.status === 'PRODUCTION'
      ? true
      : idling?.status === 'UNSUPPORTED'
        ? false
        : null;

  return {
    capabilityVersion: detectorResult.capabilityVersion || TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION,
    coverage: metrics.coverage,
    effectiveCadenceMs: metrics.effectiveCadenceMs,
    p95CadenceMs: metrics.p95CadenceMs,
    nativeBehaviorSupported,
    hfCadenceSufficient,
    routeSupported,
  };
}
