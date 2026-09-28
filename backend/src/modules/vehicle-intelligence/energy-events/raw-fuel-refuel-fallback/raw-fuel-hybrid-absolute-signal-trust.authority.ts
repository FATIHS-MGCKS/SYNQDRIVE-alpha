import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
} from './raw-fuel-refuel-fallback.types';
import type { RawFuelPrePlateauBaselineRecencyClassification } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  type RawFuelRiseDetectorConfig,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';

export const RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION = 'rfrf-hybrid-absolute-trust-v1';

const RELATIVE_VALID_RANGE = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange;

export type RawFuelHybridTrustReasonCode =
  | 'NO_EVIDENCE'
  | 'ABSOLUTE_MALFORMED'
  | 'ABSOLUTE_INADMISSIBLE'
  | 'RISE_INCOHERENT'
  | 'RISE_RESET_PATTERN'
  | 'BASELINE_NOT_FRESH'
  | 'BASELINE_PROVENANCE_MISSING'
  | 'RELATIVE_COVERAGE_INSUFFICIENT'
  | 'RELATIVE_CORROBORATES'
  | 'RELATIVE_CONTRADICTS_ABSOLUTE'
  | 'CORROBORATED_RISE'
  | 'INSUFFICIENT_CORROBORATION';

export interface RawFuelHybridTrustSample {
  timestamp: Date;
  absoluteLiters?: number | null;
  relativePercent?: number | null;
}

export interface RawFuelHybridTrustObservationContext {
  baselineRecencyClassification?: RawFuelPrePlateauBaselineRecencyClassification;
  riseOnsetAt?: Date | null;
  riseEndAt?: Date | null;
  preFuelAbsoluteLiters?: number | null;
  postFuelAbsoluteLiters?: number | null;
}

export interface RawFuelHybridTrustInput {
  samples?: RawFuelHybridTrustSample[];
  scanWindowStart?: Date;
  scanWindowEnd?: Date;
  observation?: RawFuelHybridTrustObservationContext;
  config?: RawFuelRiseDetectorConfig;
}

export interface RawFuelHybridTrustProvenance {
  authorityVersion: string;
  classification: RawFuelAbsoluteSignalTrust;
  reasonCode: RawFuelHybridTrustReasonCode;
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSampleCoverage: 'NONE' | 'PARTIAL' | 'SUFFICIENT';
  baselineRecencyClassification: RawFuelPrePlateauBaselineRecencyClassification | 'NOT_PROVIDED';
  absoluteDeltaLiters: number | null;
  relativeDeltaPercent: number | null;
  materialRiseLiters: number;
  materialRisePercent: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inWindow(ts: number, start?: number, end?: number): boolean {
  if (start != null && ts < start) return false;
  if (end != null && ts > end) return false;
  return true;
}

function filterInWindowSamples(
  input: RawFuelHybridTrustInput,
): RawFuelHybridTrustSample[] {
  const samples = input.samples ?? [];
  const windowStart = input.scanWindowStart?.getTime();
  const windowEnd = input.scanWindowEnd?.getTime();
  return samples.filter((s) => {
    if (!(s.timestamp instanceof Date) || Number.isNaN(s.timestamp.getTime())) return false;
    return inWindow(s.timestamp.getTime(), windowStart, windowEnd);
  });
}

function resolveAbsoluteDetectionAdmissibility(
  inWindow: RawFuelHybridTrustSample[],
): RawFuelAbsoluteDetectionAdmissibility {
  if (inWindow.length === 0) return 'UNKNOWN';
  let sawAbsoluteField = false;
  let sawInvalidAbsolute = false;
  for (const sample of inWindow) {
    if (sample.absoluteLiters == null) continue;
    sawAbsoluteField = true;
    if (!isFiniteNumber(sample.absoluteLiters) || sample.absoluteLiters < 0) {
      sawInvalidAbsolute = true;
      continue;
    }
    return 'ADMISSIBLE';
  }
  if (sawInvalidAbsolute) return 'INADMISSIBLE';
  if (sawAbsoluteField) return 'INADMISSIBLE';
  return 'UNKNOWN';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function validRelativeSamples(inWindow: RawFuelHybridTrustSample[]): RawFuelHybridTrustSample[] {
  return inWindow.filter((s) => {
    if (!isFiniteNumber(s.relativePercent)) return false;
    return (
      s.relativePercent >= RELATIVE_VALID_RANGE.min &&
      s.relativePercent <= RELATIVE_VALID_RANGE.max
    );
  });
}

function assessAbsoluteRiseCoherence(
  input: RawFuelHybridTrustInput,
  inWindow: RawFuelHybridTrustSample[],
  config: RawFuelRiseDetectorConfig,
): {
  coherent: boolean;
  resetPattern: boolean;
  deltaLiters: number | null;
} {
  const obs = input.observation;
  const material = config.absolute.materialRiseLiters;
  const tol = config.absolute.postPlateauToleranceLiters;
  const minPost = config.absolute.postPlateauMinSamples;

  if (
    obs &&
    isFiniteNumber(obs.preFuelAbsoluteLiters) &&
    isFiniteNumber(obs.postFuelAbsoluteLiters)
  ) {
    const delta = obs.postFuelAbsoluteLiters - obs.preFuelAbsoluteLiters;
    if (delta < material) {
      return { coherent: false, resetPattern: false, deltaLiters: delta };
    }
    if (obs.postFuelAbsoluteLiters < obs.preFuelAbsoluteLiters) {
      return { coherent: false, resetPattern: true, deltaLiters: delta };
    }

    const riseEndMs = obs.riseEndAt?.getTime();
    if (riseEndMs != null) {
      const postSamples = inWindow.filter((s) => {
        if (!isFiniteNumber(s.absoluteLiters)) return false;
        return s.timestamp.getTime() >= riseEndMs;
      });
      if (postSamples.length < minPost) {
        return { coherent: false, resetPattern: false, deltaLiters: delta };
      }
      const withinTol = postSamples.filter(
        (s) =>
          Math.abs(s.absoluteLiters! - obs.postFuelAbsoluteLiters!) <= tol,
      ).length;
      if (withinTol < minPost) {
        return { coherent: false, resetPattern: false, deltaLiters: delta };
      }
      const minPostVal = Math.min(...postSamples.map((s) => s.absoluteLiters!));
      if (minPostVal < obs.preFuelAbsoluteLiters! - config.absolute.negativeWobbleLiters) {
        return { coherent: false, resetPattern: true, deltaLiters: delta };
      }
    }
    return { coherent: true, resetPattern: false, deltaLiters: delta };
  }

  const absoluteSeries = inWindow
    .filter((s) => isFiniteNumber(s.absoluteLiters))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (absoluteSeries.length < config.absolute.prePlateauMinSamples + 2) {
    return { coherent: false, resetPattern: false, deltaLiters: null };
  }

  for (let i = config.absolute.prePlateauMinSamples; i < absoluteSeries.length - minPost; i++) {
    const preSlice = absoluteSeries.slice(i - config.absolute.prePlateauMinSamples, i);
    const preMed = median(preSlice.map((s) => s.absoluteLiters!));
    if (preMed == null) continue;
    const peak = absoluteSeries[i]!.absoluteLiters!;
    const delta = peak - preMed;
    if (delta < material) continue;
    const postSlice = absoluteSeries.slice(i + 1, i + 1 + minPost);
    if (postSlice.length < minPost) continue;
    const postMed = median(postSlice.map((s) => s.absoluteLiters!));
    if (postMed == null) continue;
    if (postMed - preMed < material) continue;
    if (Math.min(...postSlice.map((s) => s.absoluteLiters!)) < preMed - config.absolute.negativeWobbleLiters) {
      return { coherent: false, resetPattern: true, deltaLiters: postMed - preMed };
    }
    return { coherent: true, resetPattern: false, deltaLiters: postMed - preMed };
  }

  return { coherent: false, resetPattern: false, deltaLiters: null };
}

function assessRelativeCorroboration(
  input: RawFuelHybridTrustInput,
  inWindow: RawFuelHybridTrustSample[],
  config: RawFuelRiseDetectorConfig,
  absoluteDeltaLiters: number | null,
): {
  coverage: 'NONE' | 'PARTIAL' | 'SUFFICIENT';
  corroborates: boolean;
  contradicts: boolean;
  relativeDeltaPercent: number | null;
} {
  const rel = validRelativeSamples(inWindow);
  if (rel.length === 0) {
    return {
      coverage: 'NONE',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: null,
    };
  }

  const obs = input.observation;
  const riseOnsetMs = obs?.riseOnsetAt?.getTime();
  const riseEndMs = obs?.riseEndAt?.getTime();

  let preRel: number[] = [];
  let postRel: number[] = [];

  if (riseOnsetMs != null && riseEndMs != null) {
    preRel = rel
      .filter((s) => s.timestamp.getTime() < riseOnsetMs)
      .map((s) => s.relativePercent!);
    postRel = rel
      .filter((s) => s.timestamp.getTime() >= riseEndMs)
      .map((s) => s.relativePercent!);
  } else {
    const sorted = rel.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const split = Math.floor(sorted.length / 2);
    preRel = sorted.slice(0, split).map((s) => s.relativePercent!);
    postRel = sorted.slice(split).map((s) => s.relativePercent!);
  }

  const minPre = config.relative.prePlateauMinSamples;
  const minPost = config.relative.postPlateauMinSamples;

  if (preRel.length < minPre || postRel.length < minPost) {
    return {
      coverage: preRel.length > 0 || postRel.length > 0 ? 'PARTIAL' : 'NONE',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: null,
    };
  }

  const preMed = median(preRel)!;
  const postMed = median(postRel)!;
  const relDelta = postMed - preMed;
  const materialPct = config.relative.materialRisePercent;

  if (absoluteDeltaLiters != null && absoluteDeltaLiters >= config.absolute.materialRiseLiters) {
    if (relDelta <= -materialPct) {
      return {
        coverage: 'SUFFICIENT',
        corroborates: false,
        contradicts: true,
        relativeDeltaPercent: relDelta,
      };
    }
    if (relDelta >= materialPct) {
      return {
        coverage: 'SUFFICIENT',
        corroborates: true,
        contradicts: false,
        relativeDeltaPercent: relDelta,
      };
    }
    return {
      coverage: 'SUFFICIENT',
      corroborates: false,
      contradicts: false,
      relativeDeltaPercent: relDelta,
    };
  }

  return {
    coverage: 'PARTIAL',
    corroborates: false,
    contradicts: false,
    relativeDeltaPercent: relDelta,
  };
}

/**
 * Observation-local hybrid promotion trust (v1). Does not persist vehicle-wide calibration.
 */
export function evaluateHybridAbsoluteSignalTrust(
  input: RawFuelHybridTrustInput = {},
): RawFuelHybridTrustProvenance {
  const config = input.config ?? RAW_FUEL_RISE_DETECTOR_CONFIG_V1;
  const inWindow = filterInWindowSamples(input);
  const absoluteDetectionAdmissibility = resolveAbsoluteDetectionAdmissibility(inWindow);
  const baseline =
    input.observation?.baselineRecencyClassification ?? ('NOT_PROVIDED' as const);

  const base = {
    authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    absoluteDetectionAdmissibility,
    relativeSampleCoverage: 'NONE' as const,
    baselineRecencyClassification: baseline,
    absoluteDeltaLiters: null as number | null,
    relativeDeltaPercent: null as number | null,
    materialRiseLiters: config.absolute.materialRiseLiters,
    materialRisePercent: config.relative.materialRisePercent,
  };

  if (inWindow.length === 0 && !input.observation) {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'NO_EVIDENCE',
    };
  }

  if (absoluteDetectionAdmissibility === 'INADMISSIBLE') {
    return {
      ...base,
      classification: 'UNTRUSTED',
      reasonCode: 'ABSOLUTE_INADMISSIBLE',
    };
  }

  for (const sample of inWindow) {
    if (sample.absoluteLiters != null) {
      if (!isFiniteNumber(sample.absoluteLiters) || sample.absoluteLiters < 0) {
        return {
          ...base,
          classification: 'UNTRUSTED',
          reasonCode: 'ABSOLUTE_MALFORMED',
        };
      }
    }
  }

  const rise = assessAbsoluteRiseCoherence(input, inWindow, config);
  if (rise.resetPattern) {
    return {
      ...base,
      classification: 'UNTRUSTED',
      reasonCode: 'RISE_RESET_PATTERN',
      absoluteDeltaLiters: rise.deltaLiters,
    };
  }

  const rel = assessRelativeCorroboration(input, inWindow, config, rise.deltaLiters);

  if (rel.contradicts) {
    return {
      ...base,
      classification: 'UNTRUSTED',
      reasonCode: 'RELATIVE_CONTRADICTS_ABSOLUTE',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  if (!rise.coherent) {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'RISE_INCOHERENT',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  if (baseline === 'NOT_PROVIDED') {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'BASELINE_PROVENANCE_MISSING',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  if (baseline !== 'FRESH') {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'BASELINE_NOT_FRESH',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  if (rel.coverage === 'NONE' || rel.coverage === 'PARTIAL') {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  if (!rel.corroborates) {
    return {
      ...base,
      classification: 'UNKNOWN',
      reasonCode: 'INSUFFICIENT_CORROBORATION',
      relativeSampleCoverage: rel.coverage,
      absoluteDeltaLiters: rise.deltaLiters,
      relativeDeltaPercent: rel.relativeDeltaPercent,
    };
  }

  return {
    ...base,
    classification: 'TRUSTED',
    reasonCode: 'CORROBORATED_RISE',
    relativeSampleCoverage: 'SUFFICIENT',
    absoluteDeltaLiters: rise.deltaLiters,
    relativeDeltaPercent: rel.relativeDeltaPercent,
  };
}
