import { TireOdometerAnchorStatus } from '@prisma/client';
import {
  TIRE_HEALTH_CONFIG,
  type AiTireSpec,
  type TireArchetype,
  resolveArchetype,
  resolveReplacementThreshold,
} from '../tire-health.config';
import { resolveWheelTreadMm, type WheelPos } from '../tire-evidence-provenance';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  type TireWearV3PriorConfig,
} from './tire-wear-v3-prior.config';
import type {
  NumericInterval,
  TireWearV3EvidenceLevel,
  TireWearV3MeasurementPoint,
  TireWearV3RateSource,
  TireWearV3WearRateEstimate,
} from './tire-wear-v3-prior.types';

const WHEEL_POSITIONS: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function mmPerKmToPer1000(mmPerKm: number): number {
  return round4(mmPerKm * 1000);
}

export function intervalMmPer1000(interval: NumericInterval): NumericInterval {
  return {
    lo: mmPerKmToPer1000(interval.lo),
    hi: mmPerKmToPer1000(interval.hi),
  };
}

export function resolvePriorLifeKmInterval(args: {
  spec: AiTireSpec | null;
  archetype: TireArchetype;
  season: string | null;
  setupExpectedLifeKm: number | null;
  axleExpectedLifeKm: number | null;
  widenedBaseline: boolean;
  config?: TireWearV3PriorConfig;
}): { interval: NumericInterval; mid: number; source: TireWearV3RateSource } {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  const explicit = args.axleExpectedLifeKm ?? args.setupExpectedLifeKm;
  if (explicit != null && explicit > 0) {
    const span = cfg.explicitLifeKmRelativeSpan;
    const lo = Math.max(1000, Math.round(explicit * (1 - span)));
    const hi = Math.round(explicit * (1 + span));
    return {
      interval: { lo, hi },
      mid: explicit,
      source: 'prior_life_explicit',
    };
  }

  const seasonKey = args.season ?? 'ALL_SEASON';
  const seasonCfg =
    TIRE_HEALTH_CONFIG.expectedLifeKm[seasonKey] ??
    TIRE_HEALTH_CONFIG.expectedLifeKm.ALL_SEASON;
  let lo = seasonCfg.min;
  let hi = seasonCfg.max;

  const arch =
    TIRE_HEALTH_CONFIG.archetypeDefaults[args.archetype] ??
    TIRE_HEALTH_CONFIG.archetypeDefaults.default;
  const archLo = Math.round(arch.expectedLifeKm * 0.85);
  const archHi = Math.round(arch.expectedLifeKm * 1.15);
  lo = Math.max(lo, archLo);
  hi = Math.min(hi, archHi);
  if (lo > hi) {
    lo = seasonCfg.min;
    hi = seasonCfg.max;
  }

  if (args.widenedBaseline) {
    lo = Math.min(lo, cfg.unknownLifeKmSpan.lo);
    hi = Math.max(hi, cfg.unknownLifeKmSpan.hi);
    return {
      interval: { lo, hi },
      mid: (lo + hi) / 2,
      source: 'prior_life_widened',
    };
  }

  return {
    interval: { lo, hi },
    mid: seasonCfg.default,
    source: 'prior_life_table',
  };
}

export function priorWearRateIntervalMmPerKm(
  initialTreadMm: number,
  replacementMm: number,
  lifeKm: NumericInterval,
): NumericInterval {
  const usable = initialTreadMm - replacementMm;
  if (usable <= 0 || lifeKm.hi <= 0) {
    return { lo: 0, hi: 0 };
  }
  return {
    lo: round6(usable / lifeKm.hi),
    hi: round6(usable / lifeKm.lo),
  };
}

export function rateSigmaFromTwoPoints(
  deltaTreadMm: number,
  deltaOdometerKm: number,
  sigmaMeasMm: number,
): number | null {
  if (deltaOdometerKm <= 0) return null;
  const rate = Math.abs(deltaTreadMm) / deltaOdometerKm;
  if (!Number.isFinite(rate)) return null;
  return (Math.SQRT2 * sigmaMeasMm) / deltaOdometerKm;
}

export function fitWearRateFromMeasurements(
  points: TireWearV3MeasurementPoint[],
  sigmaMeasMm: number,
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): {
  rateMmPerKm: number | null;
  rateSigmaMmPerKm: number | null;
  spanKm: number | null;
  pointCount: number;
  flags: string[];
} {
  const flags: string[] = [];
  const usable = points
    .filter((p) => p.odometerKm != null && Number.isFinite(p.odometerKm))
    .sort((a, b) => (a.odometerKm! - b.odometerKm!));

  if (usable.length < 2) {
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm: null,
      pointCount: usable.length,
      flags: ['RATE_INSUFFICIENT_POINTS'],
    };
  }

  const odometers = usable.map((p) => p.odometerKm!);
  const treads = usable.map((p) => p.treadMm);
  const spanKm = odometers[odometers.length - 1]! - odometers[0]!;

  for (let i = 1; i < treads.length; i += 1) {
    const jump = Math.abs(treads[i]! - treads[i - 1]!);
    if (jump > config.maxTreadJumpBetweenMeasurementsMm) {
      flags.push('TREAD_JUMP_SUSPECT');
    }
  }

  const n = odometers.length;
  const meanD = odometers.reduce((s, v) => s + v, 0) / n;
  const meanH = treads.reduce((s, v) => s + v, 0) / n;
  let ssDd = 0;
  let ssDh = 0;
  for (let i = 0; i < n; i += 1) {
    const dDev = odometers[i]! - meanD;
    ssDd += dDev * dDev;
    ssDh += dDev * (treads[i]! - meanH);
  }
  if (ssDd <= 0) {
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm,
      pointCount: n,
      flags: [...flags, 'RATE_ZERO_ODOMETER_SPREAD'],
    };
  }

  const slope = ssDh / ssDd;
  if (slope > 0) {
    flags.push('RATE_NEGATIVE_WEAR_REJECTED');
    return {
      rateMmPerKm: null,
      rateSigmaMmPerKm: null,
      spanKm,
      pointCount: n,
      flags,
    };
  }

  const rate = round4(-slope);
  const residualVar =
    treads.reduce((s, h, i) => {
      const pred = meanH + slope * (odometers[i]! - meanD);
      return s + (h - pred) ** 2;
    }, 0) / Math.max(1, n - 2);
  const rateSigma =
    n > 2 && residualVar > 0
      ? Math.sqrt(residualVar / ssDd)
      : rateSigmaFromTwoPoints(treads[0]! - treads[n - 1]!, spanKm, sigmaMeasMm);

  const ratePer1000 = mmPerKmToPer1000(rate);
  if (ratePer1000 > config.maxPlausibleWearRateMmPer1000km) {
    flags.push('RATE_IMPLAUSIBLY_HIGH');
  }
  if (ratePer1000 < config.minPlausibleWearRateMmPer1000km) {
    flags.push('RATE_IMPLAUSIBLY_LOW');
  }

  if (spanKm < config.minOdometerSpacingKmForRate3Sigma) {
    flags.push('RATE_SPAN_BELOW_3SIGMA_THRESHOLD');
  }

  return {
    rateMmPerKm: rate,
    rateSigmaMmPerKm: rateSigma != null ? round4(rateSigma) : null,
    spanKm,
    pointCount: n,
    flags,
  };
}

export function fuseRateWithPrior(
  prior: NumericInterval,
  observedRate: number,
  observedSigma: number | null,
): { interval: NumericInterval; mid: number; measurementUncertainty: NumericInterval | null } {
  const priorMid = (prior.lo + prior.hi) / 2;
  const priorHalf = (prior.hi - prior.lo) / 2;
  const priorSigma = priorHalf > 0 ? priorHalf / 1.645 : priorMid * 0.15;

  if (observedSigma == null || observedSigma <= 0) {
    return {
      interval: prior,
      mid: priorMid,
      measurementUncertainty: null,
    };
  }

  const wPrior = 1 / (priorSigma * priorSigma);
  const wObs = 1 / (observedSigma * observedSigma);
  const mid = (wPrior * priorMid + wObs * observedRate) / (wPrior + wObs);
  const postSigma = Math.sqrt(1 / (wPrior + wObs));
  const interval = {
    lo: round4(Math.max(0, mid - 1.645 * postSigma)),
    hi: round4(mid + 1.645 * postSigma),
  };
  return {
    interval,
    mid: round4(mid),
    measurementUncertainty: {
      lo: round4(Math.max(0, observedRate - 1.645 * observedSigma)),
      hi: round4(observedRate + 1.645 * observedSigma),
    },
  };
}

export function deriveEvidenceLevel(args: {
  anchorStatus: TireOdometerAnchorStatus | null;
  measurementCount: number;
  ratePointCount: number;
  rateRelativeUncertainty: number | null;
  measurementSpanKm: number | null;
  rateRejected: boolean;
  config?: TireWearV3PriorConfig;
}): TireWearV3EvidenceLevel {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  if (args.anchorStatus !== TireOdometerAnchorStatus.ANCHORED) {
    return 'L0';
  }
  if (args.measurementCount < 1) {
    return 'L0';
  }
  if (args.measurementCount < cfg.minMeasurementsForRateL2 || args.rateRejected) {
    return 'L1';
  }
  const span = args.measurementSpanKm ?? 0;
  const rel = args.rateRelativeUncertainty;

  if (
    args.ratePointCount >= cfg.minMeasurementsForRateL4 &&
    span >= cfg.minMeasurementSpanKmForRateL4 &&
    rel != null &&
    rel <= cfg.rateRelativeUncertaintyL3
  ) {
    return 'L4';
  }
  if (
    args.ratePointCount >= cfg.minMeasurementsForRateL3 &&
    span >= cfg.minMeasurementSpanKmForRateL3 &&
    rel != null &&
    rel <= cfg.rateRelativeUncertaintyL3
  ) {
    return 'L3';
  }
  if (
    args.ratePointCount >= cfg.minMeasurementsForRateL2 &&
    span >= cfg.minMeasurementSpanKmForRateL2 &&
    rel != null &&
    rel <= cfg.rateRelativeUncertaintyL2
  ) {
    return 'L2';
  }
  return 'L1';
}

export function projectTreadMm(args: {
  anchorTreadMm: number;
  anchorOdometerKm: number;
  currentOdometerKm: number;
  rateMmPerKm: NumericInterval;
}): NumericInterval {
  const delta = Math.max(0, args.currentOdometerKm - args.anchorOdometerKm);
  return {
    lo: round2(args.anchorTreadMm - args.rateMmPerKm.hi * delta),
    hi: round2(args.anchorTreadMm - args.rateMmPerKm.lo * delta),
  };
}

export function remainingKmInterval(
  treadMm: NumericInterval,
  replacementMm: number,
  rateMmPerKm: NumericInterval,
): NumericInterval {
  const usableLo = treadMm.lo - replacementMm;
  const usableHi = treadMm.hi - replacementMm;
  if (usableLo <= 0 && usableHi <= 0) {
    return { lo: 0, hi: 0 };
  }
  const lo =
    usableLo > 0 && rateMmPerKm.hi > 0 ? Math.floor(usableLo / rateMmPerKm.hi) : 0;
  const hi =
    usableHi > 0 && rateMmPerKm.lo > 0 ? Math.ceil(usableHi / rateMmPerKm.lo) : 0;
  return { lo: Math.max(0, lo), hi: Math.max(0, hi) };
}

export function resolveWheelInitialTread(
  position: WheelPos,
  setup: {
    initialTreadFrontMm: number | null;
    initialTreadRearMm: number | null;
    initialTreadDepthMm: number | null;
  },
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): { treadMm: number; usedDefaultFallback: boolean } {
  const wheel = resolveWheelTreadMm(position, {
    setupInitialTreadFrontMm: setup.initialTreadFrontMm,
    setupInitialTreadRearMm: setup.initialTreadRearMm,
    setupInitialTreadDepthMm: setup.initialTreadDepthMm,
  });
  if (!wheel.usedDefaultFallback) {
    return wheel;
  }
  if (spec?.newTreadDepthMm != null && spec.newTreadDepthMm > 4) {
    return { treadMm: spec.newTreadDepthMm, usedDefaultFallback: false };
  }
  const arch =
    TIRE_HEALTH_CONFIG.archetypeDefaults[archetype] ??
    TIRE_HEALTH_CONFIG.archetypeDefaults.default;
  if (archetype !== 'default') {
    return { treadMm: arch.newTreadMm, usedDefaultFallback: false };
  }
  return wheel;
}

export function axleForWheel(position: WheelPos): 'front' | 'rear' {
  return position.startsWith('F') ? 'front' : 'rear';
}

export function listWheelPositions(): WheelPos[] {
  return [...WHEEL_POSITIONS];
}

export function buildWearRateEstimate(args: {
  initialTreadMm: number;
  replacementMm: number;
  spec: AiTireSpec | null;
  archetype: TireArchetype;
  season: string | null;
  setupExpectedLifeKm: number | null;
  expectedLifeKmFront: number | null;
  expectedLifeKmRear: number | null;
  position: WheelPos;
  widenedBaseline: boolean;
  measurements: TireWearV3MeasurementPoint[];
  sigmaMeasMm: number;
  config?: TireWearV3PriorConfig;
}): TireWearV3WearRateEstimate {
  const cfg = args.config ?? TIRE_WEAR_V3_PRIOR_CONFIG;
  const axle = axleForWheel(args.position);
  const life = resolvePriorLifeKmInterval({
    spec: args.spec,
    archetype: args.archetype,
    season: args.season,
    setupExpectedLifeKm: args.setupExpectedLifeKm,
    axleExpectedLifeKm:
      axle === 'front' ? args.expectedLifeKmFront : args.expectedLifeKmRear,
    widenedBaseline: args.widenedBaseline,
    config: cfg,
  });
  const priorRate = priorWearRateIntervalMmPerKm(
    args.initialTreadMm,
    args.replacementMm,
    life.interval,
  );

  const fit = fitWearRateFromMeasurements(args.measurements, args.sigmaMeasMm, cfg);
  const rateRejected =
    fit.rateMmPerKm == null ||
    fit.flags.includes('RATE_NEGATIVE_WEAR_REJECTED') ||
    fit.flags.includes('RATE_IMPLAUSIBLY_HIGH');

  let source: TireWearV3RateSource = life.source;
  let interval = priorRate;
  let measurementUncertainty: NumericInterval | null = null;

  if (
    fit.rateMmPerKm != null &&
    !rateRejected &&
    fit.pointCount >= cfg.minMeasurementsForRateL2
  ) {
    const fused = fuseRateWithPrior(priorRate, fit.rateMmPerKm, fit.rateSigmaMmPerKm);
    interval = fused.interval;
    measurementUncertainty = fused.measurementUncertainty;
    source = 'measurement_fused';
  }

  const mid = (interval.lo + interval.hi) / 2;
  const modelHalf = (priorRate.hi - priorRate.lo) / 2;

  return {
    mmPerKm: interval,
    mmPer1000km: intervalMmPer1000(interval),
    source,
    modelUncertaintyMmPerKm: {
      lo: round4(Math.max(0, mid - modelHalf)),
      hi: round4(mid + modelHalf),
    },
    measurementUncertaintyMmPerKm: measurementUncertainty,
    flags: fit.flags,
  };
}

export function resolveArchetypeAndSeason(
  spec: AiTireSpec | null,
  tireSeason: string | null,
): { archetype: TireArchetype; season: string | null } {
  return {
    archetype: resolveArchetype(spec, tireSeason),
    season: tireSeason,
  };
}

export function resolveReplacementMm(
  spec: AiTireSpec | null,
  archetype: TireArchetype,
  season: string | null,
): number {
  return resolveReplacementThreshold(spec, archetype, season).mm;
}
