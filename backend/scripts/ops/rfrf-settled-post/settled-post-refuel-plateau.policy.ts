/**
 * DESIGN-ONLY — RFRF F3 settled post-refuel maturity (offline replay; not Production runtime).
 *
 * Authority: architecture/knowledge-graphs/energy-event-detection/decisions/
 *   RFRF-F3-SETTLED-POST-REFUEL-MATURITY-2026-09-30.md
 */
import type {
  RawRefuelCandidateLifecycleState,
  RawRefuelCandidateRejectionReason,
} from '@prisma/client';
import type { RawFuelRiseDetectorConfig } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { validatePlateauWindow } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';

export const RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION = 'rfrf-settled-post-design-v1';

export const REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS = 3 as const;
export const REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE = 0.35 as const;
export const REPLAY_DROP_CAP_CLASSIFICATION = 'REPLAY_HYPOTHESIS_ONLY' as const;
export const REPLAY_DROP_RATIO_CLASSIFICATION = 'REPLAY_HYPOTHESIS_ONLY' as const;

/** Terminal F3 safety reasons — settled-post must not resurrect these rises. */
const TERMINAL_F3_REJECTION_REASONS: ReadonlySet<RawRefuelCandidateRejectionReason> = new Set([
  'SENSOR_RESET_SUSPECTED',
  'RISE_NOT_STABLE',
  'SAMPLE_GAP_TOO_LARGE',
  'RISE_TOO_SMALL',
]);

export function isCurrentF3TerminalSafetyRejection(input: {
  lifecycleState: RawRefuelCandidateLifecycleState;
  rejectionReason: RawRefuelCandidateRejectionReason | null;
}): boolean {
  if (input.lifecycleState !== 'REJECTED') return false;
  if (input.rejectionReason == null) return true;
  return TERMINAL_F3_REJECTION_REASONS.has(input.rejectionReason);
}

export interface SettledPostPlateauConfigSymbols {
  postPlateauMinSamples: number;
  postPlateauToleranceLiters: number;
  postPlateauMinPersistenceMs: number;
  maxSampleGapMs: number;
  materialRiseLiters: number;
  negativeWobbleLiters: number;
  maxPostSearchAfterRiseEndMs: number;
  maxPeakToSettledDropLiters: number;
  maxPeakToSettledDropRatioOfRise: number;
}

export interface ChannelPoint {
  timestamp: Date;
  value: number;
}

export interface SettledPostPlateauResult {
  ok: boolean;
  settledMedian: number | null;
  startIdx: number | null;
  endIdx: number | null;
  samples: ChannelPoint[];
  instantaneousPeakLiters: number;
  peakIdx: number;
  peakToSettledDropLiters: number | null;
  peakToSettledDropRatio: number | null;
  settlingDurationMs: number | null;
  rejectionReason:
    | 'NO_SETTLED_WINDOW'
    | 'BELOW_MATERIAL_POST'
    | 'EXCESSIVE_PEAK_COLLAPSE'
    | 'RETURNED_TOWARD_PRE'
    | 'INSUFFICIENT_PERSISTENCE'
    | 'SAMPLE_GAP'
    | null;
}

export function buildSettledPostSymbolsFromDetectorConfig(
  config: RawFuelRiseDetectorConfig,
  replayHypothesisOverrides?: Partial<
    Pick<
      SettledPostPlateauConfigSymbols,
      'maxPeakToSettledDropLiters' | 'maxPeakToSettledDropRatioOfRise'
    >
  >,
): SettledPostPlateauConfigSymbols {
  return {
    postPlateauMinSamples: config.absolute.postPlateauMinSamples,
    postPlateauToleranceLiters: config.absolute.postPlateauToleranceLiters,
    postPlateauMinPersistenceMs: config.absolute.postPlateauMinPersistenceMs,
    maxSampleGapMs: config.absolute.maxSampleGapMs,
    materialRiseLiters: config.absolute.materialRiseLiters,
    negativeWobbleLiters: config.absolute.negativeWobbleLiters,
    maxPostSearchAfterRiseEndMs: config.riseMaxDurationMs,
    maxPeakToSettledDropLiters:
      replayHypothesisOverrides?.maxPeakToSettledDropLiters ??
      REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
    maxPeakToSettledDropRatioOfRise:
      replayHypothesisOverrides?.maxPeakToSettledDropRatioOfRise ??
      REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  };
}

export function resolveSettledPostRefuelPlateau(input: {
  series: ChannelPoint[];
  riseEndIdx: number;
  peakIdx: number;
  preMedian: number;
  symbols: SettledPostPlateauConfigSymbols;
}): SettledPostPlateauResult {
  const { series, riseEndIdx, peakIdx, preMedian, symbols: cfg } = input;
  const peakValue = series[peakIdx]?.value ?? NaN;
  const riseEndMs = series[riseEndIdx]?.timestamp.getTime() ?? NaN;
  const material = cfg.materialRiseLiters;

  const baseFail = (rejectionReason: SettledPostPlateauResult['rejectionReason']): SettledPostPlateauResult => ({
    ok: false,
    settledMedian: null,
    startIdx: null,
    endIdx: null,
    samples: [],
    instantaneousPeakLiters: peakValue,
    peakIdx,
    peakToSettledDropLiters: null,
    peakToSettledDropRatio: null,
    settlingDurationMs: null,
    rejectionReason,
  });

  if (!Number.isFinite(peakValue) || !Number.isFinite(riseEndMs)) {
    return baseFail('NO_SETTLED_WINDOW');
  }

  const searchStart = Math.max(peakIdx, riseEndIdx);
  const riseSpan = peakValue - preMedian;
  if (riseSpan < material) {
    return baseFail('BELOW_MATERIAL_POST');
  }

  for (let i = searchStart; i < series.length; i++) {
    const t0 = series[i].timestamp.getTime();
    if (t0 - riseEndMs > cfg.maxPostSearchAfterRiseEndMs) break;

    if (series[i].value < preMedian + material) continue;

    const window: ChannelPoint[] = [series[i]];
    for (let j = i + 1; j < series.length; j++) {
      if (series[j].timestamp.getTime() - riseEndMs > cfg.maxPostSearchAfterRiseEndMs) break;

      const gapMs = series[j].timestamp.getTime() - series[j - 1].timestamp.getTime();
      if (gapMs > cfg.maxSampleGapMs) break;

      const candidateValues = [...window.map((p) => p.value), series[j].value];
      const { valid, median: center } = validatePlateauWindow(
        candidateValues,
        cfg.postPlateauToleranceLiters,
      );
      if (!valid) break;

      if (center < preMedian + material) break;

      window.push(series[j]);

      if (window.length >= cfg.postPlateauMinSamples) {
        const persistenceMs =
          window[window.length - 1].timestamp.getTime() - window[0].timestamp.getTime();
        if (persistenceMs < cfg.postPlateauMinPersistenceMs) continue;

        const dropFromPeak = peakValue - center;
        if (dropFromPeak > cfg.maxPeakToSettledDropLiters) continue;
        if (riseSpan > 0 && dropFromPeak / riseSpan > cfg.maxPeakToSettledDropRatioOfRise) continue;

        const minVal = Math.min(...window.map((p) => p.value));
        if (minVal < preMedian - cfg.negativeWobbleLiters) {
          return baseFail('RETURNED_TOWARD_PRE');
        }

        const settlingDurationMs = window[0].timestamp.getTime() - series[peakIdx].timestamp.getTime();

        return {
          ok: true,
          settledMedian: center,
          startIdx: i,
          endIdx: j,
          samples: [...window],
          instantaneousPeakLiters: peakValue,
          peakIdx,
          peakToSettledDropLiters: dropFromPeak,
          peakToSettledDropRatio: riseSpan > 0 ? dropFromPeak / riseSpan : null,
          settlingDurationMs,
          rejectionReason: null,
        };
      }
    }
  }

  return baseFail('NO_SETTLED_WINDOW');
}

export interface SettledMaturityVerdict {
  lifecycleState: RawRefuelCandidateLifecycleState;
  authoritativePostLiters: number | null;
  deltaLiters: number | null;
  settled: SettledPostPlateauResult;
}

export function classifySettledPostMaturity(input: {
  preMedian: number;
  settled: SettledPostPlateauResult;
}): SettledMaturityVerdict {
  const { preMedian, settled } = input;
  if (!settled.ok || settled.settledMedian == null) {
    return {
      lifecycleState: 'OBSERVED',
      authoritativePostLiters: null,
      deltaLiters: null,
      settled,
    };
  }
  const delta = settled.settledMedian - preMedian;
  if (delta < 0) {
    return {
      lifecycleState: 'REJECTED',
      authoritativePostLiters: null,
      deltaLiters: delta,
      settled,
    };
  }
  return {
    lifecycleState: 'READY_FOR_PERSIST',
    authoritativePostLiters: settled.settledMedian,
    deltaLiters: delta,
    settled,
  };
}
