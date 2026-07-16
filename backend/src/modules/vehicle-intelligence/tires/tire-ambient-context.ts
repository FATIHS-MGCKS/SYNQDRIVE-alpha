import type {
  AmbientSeasonBand,
  AmbientTemperatureContext,
  AmbientTemperatureSample,
} from './tire-dimo-context.types';
import type { EvaluateTireDimoSignalCapabilityResult } from './tire-dimo-signal-capability';

export const DEFAULT_AMBIENT_WINDOW_DAYS = 7;
const SINGLE_SPIKE_DELTA_C = 12;
const SINGLE_SPIKE_MAX_WEIGHT_SHARE = 0.15;

export function classifyAmbientSeasonBand(avgTempC: number): AmbientSeasonBand {
  if (avgTempC < 5) return 'COLD';
  if (avgTempC > 18) return 'WARM';
  return 'MILD';
}

function sampleWeight(sample: AmbientTemperatureSample): number {
  const w = sample.weightKm ?? 1;
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/**
 * Reject a lone outlier that would skew multi-day ambient context.
 * Returns filtered samples and whether a spike was rejected.
 */
export function rejectSingleTemperatureSpike(
  samples: AmbientTemperatureSample[],
): { samples: AmbientTemperatureSample[]; rejected: boolean } {
  if (samples.length < 3) {
    return { samples, rejected: false };
  }

  const weighted = samples.map((s) => ({ s, w: sampleWeight(s) }));
  const totalW = weighted.reduce((sum, x) => sum + x.w, 0);
  if (totalW <= 0) return { samples, rejected: false };

  const avg =
    weighted.reduce((sum, x) => sum + x.s.temperatureC * x.w, 0) / totalW;

  const outliers = weighted.filter(
    (x) => Math.abs(x.s.temperatureC - avg) >= SINGLE_SPIKE_DELTA_C,
  );
  if (outliers.length !== 1) {
    return { samples, rejected: false };
  }

  const outlierShare = outliers[0].w / totalW;
  if (outlierShare > SINGLE_SPIKE_MAX_WEIGHT_SHARE) {
    return { samples, rejected: false };
  }

  const outlierTs = outliers[0].s.timestamp;
  return {
    samples: samples.filter((s) => s.timestamp !== outlierTs),
    rejected: true,
  };
}

export function computeTimeWeightedAmbientAverage(
  samples: AmbientTemperatureSample[],
  asOf: Date = new Date(),
  windowDays: number = DEFAULT_AMBIENT_WINDOW_DAYS,
): {
  weightedAvgTempC: number | null;
  sampleCount: number;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const windowStart = asOf.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = samples.filter((s) => {
    const ts = new Date(s.timestamp).getTime();
    return Number.isFinite(ts) && ts >= windowStart && ts <= asOf.getTime();
  });

  if (inWindow.length === 0) {
    return {
      weightedAvgTempC: null,
      sampleCount: 0,
      periodStart: null,
      periodEnd: null,
    };
  }

  const timestamps = inWindow
    .map((s) => new Date(s.timestamp).getTime())
    .filter(Number.isFinite);
  const periodStart = new Date(Math.min(...timestamps)).toISOString();
  const periodEnd = new Date(Math.max(...timestamps)).toISOString();

  let totalWeight = 0;
  let weightedSum = 0;
  for (const sample of inWindow) {
    const ageMs = asOf.getTime() - new Date(sample.timestamp).getTime();
    const ageDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000));
    const timeDecay = Math.exp(-ageDays / windowDays);
    const w = sampleWeight(sample) * timeDecay;
    weightedSum += sample.temperatureC * w;
    totalWeight += w;
  }

  return {
    weightedAvgTempC:
      totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : null,
    sampleCount: inWindow.length,
    periodStart,
    periodEnd,
  };
}

export function buildPressureContextHint(
  weightedAvgTempC: number | null,
): { de: string | null; en: string | null } {
  if (weightedAvgTempC == null) {
    return { de: null, en: null };
  }
  if (weightedAvgTempC < 5) {
    return {
      de: 'Kältere Außentemperaturen der letzten Tage können den Reifendruck senken — Kontrolle empfohlen.',
      en: 'Colder ambient temperatures over recent days can lower tire pressure — check recommended.',
    };
  }
  if (weightedAvgTempC > 25) {
    return {
      de: 'Wärmere Außentemperaturen der letzten Tage können den Reifendruck erhöhen — kein Reifenwechselhinweis.',
      en: 'Warmer ambient temperatures over recent days can raise tire pressure — not a tire-change signal.',
    };
  }
  return { de: null, en: null };
}

export function buildAmbientTemperatureContext(args: {
  capability: EvaluateTireDimoSignalCapabilityResult;
  samples: AmbientTemperatureSample[];
  lastSeenAt?: string | Date | null;
  asOf?: Date;
  windowDays?: number;
}): AmbientTemperatureContext {
  const asOf = args.asOf ?? new Date();
  const windowDays = args.windowDays ?? DEFAULT_AMBIENT_WINDOW_DAYS;
  const reasons = [...args.capability.reasons];

  if (!args.capability.usable) {
    return {
      usable: false,
      weightedAvgTempC: null,
      sampleCount: 0,
      windowDays,
      periodStart: null,
      periodEnd: null,
      lastSeenAt: args.lastSeenAt
        ? new Date(args.lastSeenAt).toISOString()
        : null,
      stale: args.capability.stale,
      singleSpikeRejected: false,
      seasonBand: null,
      pressureContextHintDe: null,
      pressureContextHintEn: null,
      reasons,
    };
  }

  const spikeFiltered = rejectSingleTemperatureSpike(args.samples);
  const aggregate = computeTimeWeightedAmbientAverage(
    spikeFiltered.samples,
    asOf,
    windowDays,
  );

  if (aggregate.sampleCount < 2) {
    reasons.push('Need at least two ambient samples across multiple days.');
    return {
      usable: false,
      weightedAvgTempC: null,
      sampleCount: aggregate.sampleCount,
      windowDays,
      periodStart: aggregate.periodStart,
      periodEnd: aggregate.periodEnd,
      lastSeenAt: args.lastSeenAt
        ? new Date(args.lastSeenAt).toISOString()
        : null,
      stale: args.capability.stale,
      singleSpikeRejected: spikeFiltered.rejected,
      seasonBand: null,
      pressureContextHintDe: null,
      pressureContextHintEn: null,
      reasons,
    };
  }

  const hints = buildPressureContextHint(aggregate.weightedAvgTempC);
  return {
    usable: true,
    weightedAvgTempC: aggregate.weightedAvgTempC,
    sampleCount: aggregate.sampleCount,
    windowDays,
    periodStart: aggregate.periodStart,
    periodEnd: aggregate.periodEnd,
    lastSeenAt: args.lastSeenAt
      ? new Date(args.lastSeenAt).toISOString()
      : null,
    stale: false,
    singleSpikeRejected: spikeFiltered.rejected,
    seasonBand:
      aggregate.weightedAvgTempC != null
        ? classifyAmbientSeasonBand(aggregate.weightedAvgTempC)
        : null,
    pressureContextHintDe: hints.de,
    pressureContextHintEn: hints.en,
    reasons: [],
  };
}
