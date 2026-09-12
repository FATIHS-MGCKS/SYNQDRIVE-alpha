import type {
  RawRefuelCandidateLifecycleState,
  RawRefuelCandidateRejectionReason,
  RawRefuelCandidateSignalChannel,
} from '@prisma/client';
import type { RawFuelRiseDetectionContext } from './raw-fuel-signal-sample.types';
import type { RawFuelRiseDetectorConfig } from './raw-fuel-rise-detector.config';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';
import {
  extractChannelSeries,
  maxGapSeconds,
  median,
  withinTolerance,
} from './raw-fuel-rise-normalizer';
import { readCorroborationAt } from './raw-fuel-rise-channel-authority';

interface ChannelPoint {
  timestamp: Date;
  value: number;
  source: NormalizedRawFuelSample;
}

interface PlateauSegment {
  startIdx: number;
  endIdx: number;
  median: number;
  samples: ChannelPoint[];
}

interface DetectedRiseDraft {
  channel: RawRefuelCandidateSignalChannel;
  prePlateau: PlateauSegment;
  risePoints: ChannelPoint[];
  postPlateau: PlateauSegment | null;
  riseOnsetAt: Date;
  riseEndAt: Date;
  lifecycleState: RawRefuelCandidateLifecycleState;
  rejectionReason: RawRefuelCandidateRejectionReason | null;
  maxSampleGapSeconds: number;
  sensorResetSuspected: boolean;
  returnedToBaselineBeforePost: boolean;
}

/** F3.1 — every sample must lie within tolerance of the final robust median. */
export function validatePlateauWindow(
  values: number[],
  tolerance: number,
): { valid: boolean; median: number } {
  if (values.length === 0) {
    return { valid: false, median: NaN };
  }
  const center = median(values);
  const valid = values.every((value) => withinTolerance(value, center, tolerance));
  return { valid, median: center };
}

function channelConfig(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
) {
  return channel === 'ABSOLUTE_LITERS' ? config.absolute : config.relative;
}

function materialThreshold(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.materialRiseLiters
    : config.relative.materialRisePercent;
}

function plateauTolerance(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.prePlateauToleranceLiters
    : config.relative.prePlateauTolerancePercent;
}

function postPlateauTolerance(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.postPlateauToleranceLiters
    : config.relative.postPlateauTolerancePercent;
}

function negativeWobbleTolerance(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.negativeWobbleLiters
    : config.relative.negativeWobblePercent;
}

function findPlateauFrom(
  series: ChannelPoint[],
  startIdx: number,
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): PlateauSegment | null {
  const cfg = channelConfig(channel, config);
  const minSamples = cfg.prePlateauMinSamples;
  const tolerance = plateauTolerance(channel, config);

  for (let i = startIdx; i <= series.length - minSamples; i++) {
    const window: ChannelPoint[] = [series[i]];
    for (let j = i + 1; j < series.length; j++) {
      const candidateValues = [...window.map((p) => p.value), series[j].value];
      const { valid } = validatePlateauWindow(candidateValues, tolerance);
      if (!valid) break;
      window.push(series[j]);
    }

    if (window.length >= minSamples) {
      const values = window.map((p) => p.value);
      const { valid, median: center } = validatePlateauWindow(values, tolerance);
      if (valid) {
        return {
          startIdx: i,
          endIdx: i + window.length - 1,
          median: center,
          samples: window,
        };
      }
    }
  }
  return null;
}

/**
 * Post plateau must be LOCAL to the rise peak — distant consumption must not
 * become post-refuel authority.
 */
function findLocalPostPlateauAfterRise(
  series: ChannelPoint[],
  searchStartIdx: number,
  peakIdx: number,
  preMedian: number,
  peakValue: number,
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): PlateauSegment | null {
  const cfg = channelConfig(channel, config);
  const tolerance = postPlateauTolerance(channel, config);
  const minSamples = cfg.postPlateauMinSamples;
  const minPersistenceMs = cfg.postPlateauMinPersistenceMs;
  const material = materialThreshold(channel, config);
  const peakTimeMs = series[peakIdx].timestamp.getTime();
  const maxLocalSearchMs = cfg.maxSampleGapMs;

  for (let i = Math.max(searchStartIdx, peakIdx); i < series.length; i++) {
    const gapFromPeakMs = series[i].timestamp.getTime() - peakTimeMs;
    if (gapFromPeakMs > maxLocalSearchMs) break;

    if (series[i].value < preMedian + material) continue;
    if (series[i].value < peakValue - tolerance) continue;

    const window: ChannelPoint[] = [series[i]];
    for (let j = i + 1; j < series.length; j++) {
      if (series[j].value < peakValue - tolerance) break;

      const interSampleGapMs =
        series[j].timestamp.getTime() - series[j - 1].timestamp.getTime();
      if (interSampleGapMs > maxLocalSearchMs) break;

      const candidateValues = [...window.map((p) => p.value), series[j].value];
      const { valid } = validatePlateauWindow(candidateValues, tolerance);
      if (!valid) break;
      window.push(series[j]);
    }

    if (window.length >= minSamples) {
      const values = window.map((p) => p.value);
      const { valid, median: center } = validatePlateauWindow(values, tolerance);
      if (!valid || center < peakValue - tolerance) continue;

      const persistenceMs =
        window[window.length - 1].timestamp.getTime() - window[0].timestamp.getTime();
      if (persistenceMs >= minPersistenceMs) {
        return {
          startIdx: i,
          endIdx: i + window.length - 1,
          median: center,
          samples: window,
        };
      }
    }
  }
  return null;
}

/**
 * Scan the physical rise neighborhood, absorbing stepped/quantized continuations
 * into one rise before searching for a local post plateau.
 *
 * Provider sample spacing != physical fueling duration — single-step material
 * jumps are valid when post evidence supports them.
 */
function scanPhysicalRiseNeighborhood(
  series: ChannelPoint[],
  pre: PlateauSegment,
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): {
  riseStartIdx: number;
  peakIdx: number;
  risePoints: ChannelPoint[];
  returnedToBaseline: boolean;
  sensorResetSuspected: boolean;
} | null {
  const material = materialThreshold(channel, config);
  const wobble = negativeWobbleTolerance(channel, config);
  const platTol = plateauTolerance(channel, config);
  const startSearch = pre.endIdx + 1;
  if (startSearch >= series.length) return null;

  let riseStartIdx: number | null = null;
  for (let i = startSearch; i < series.length; i++) {
    if (series[i].value >= pre.median + material) {
      riseStartIdx = i;
      break;
    }
  }
  if (riseStartIdx == null) return null;

  const neighborhoodEndMs =
    series[riseStartIdx].timestamp.getTime() + config.riseMaxDurationMs;

  let peakIdx = riseStartIdx;
  let peakValue = series[riseStartIdx].value;
  let strongRegressionCount = 0;
  let returnedToBaseline = false;
  let sensorResetSuspected = false;

  for (let i = riseStartIdx + 1; i < series.length; i++) {
    const point = series[i];
    if (point.timestamp.getTime() > neighborhoodEndMs) break;

    if (point.value > peakValue) {
      peakValue = point.value;
      peakIdx = i;
    }

    if (point.value < peakValue) {
      const regression = peakValue - point.value;
      if (regression > wobble) {
        strongRegressionCount += 1;
        if (point.value <= pre.median + platTol) {
          returnedToBaseline = true;
          break;
        }
        if (strongRegressionCount > 1) {
          returnedToBaseline = true;
          break;
        }
      }
    }

    if (point.value < pre.median - wobble) {
      sensorResetSuspected = true;
      returnedToBaseline = true;
      break;
    }
  }

  if (peakValue - pre.median < material) return null;

  const riseDurationMs =
    series[peakIdx].timestamp.getTime() - series[riseStartIdx].timestamp.getTime();
  const singleStepMaterial =
    riseStartIdx === peakIdx && peakValue >= pre.median + material;

  if (!singleStepMaterial && riseDurationMs < config.riseMinDurationMs) {
    return null;
  }

  return {
    riseStartIdx,
    peakIdx,
    risePoints: series.slice(riseStartIdx, peakIdx + 1),
    returnedToBaseline,
    sensorResetSuspected,
  };
}

function classifyLifecycle(
  draft: Omit<
    DetectedRiseDraft,
    'lifecycleState' | 'rejectionReason' | 'maxSampleGapSeconds'
  >,
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): Pick<DetectedRiseDraft, 'lifecycleState' | 'rejectionReason'> {
  const cfg = channelConfig(channel, config);

  if (draft.sensorResetSuspected) {
    return { lifecycleState: 'REJECTED', rejectionReason: 'SENSOR_RESET_SUSPECTED' };
  }
  if (draft.returnedToBaselineBeforePost) {
    return { lifecycleState: 'REJECTED', rejectionReason: 'RISE_NOT_STABLE' };
  }

  const criticalPath = [
    ...draft.prePlateau.samples,
    ...draft.risePoints,
    ...(draft.postPlateau?.samples ?? []),
  ];
  const gapSeconds = maxGapSeconds(criticalPath);
  if (gapSeconds * 1000 > cfg.maxSampleGapMs) {
    return draft.postPlateau
      ? { lifecycleState: 'SETTLING', rejectionReason: 'SAMPLE_GAP_TOO_LARGE' }
      : { lifecycleState: 'INSUFFICIENT', rejectionReason: 'SAMPLE_GAP_TOO_LARGE' };
  }

  if (!draft.postPlateau) {
    const peak = Math.max(...draft.risePoints.map((p) => p.value));
    if (peak - draft.prePlateau.median >= materialThreshold(channel, config)) {
      return { lifecycleState: 'OBSERVED', rejectionReason: null };
    }
    return { lifecycleState: 'INSUFFICIENT', rejectionReason: 'INSUFFICIENT_POST_PLATEAU' };
  }

  const postCount = draft.postPlateau.samples.length;
  const persistenceMs =
    draft.postPlateau.samples[postCount - 1].timestamp.getTime() -
    draft.postPlateau.samples[0].timestamp.getTime();

  if (postCount < cfg.postPlateauMinSamples) {
    return { lifecycleState: 'SETTLING', rejectionReason: 'INSUFFICIENT_POST_PLATEAU' };
  }
  if (persistenceMs < cfg.postPlateauMinPersistenceMs) {
    return { lifecycleState: 'SETTLING', rejectionReason: 'EVIDENCE_STILL_SETTLING' };
  }

  const delta = draft.postPlateau.median - draft.prePlateau.median;
  if (delta < materialThreshold(channel, config)) {
    return { lifecycleState: 'REJECTED', rejectionReason: 'RISE_TOO_SMALL' };
  }

  return { lifecycleState: 'READY_FOR_PERSIST', rejectionReason: null };
}

export function detectChannelRises(
  samples: NormalizedRawFuelSample[],
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): DetectedRiseDraft[] {
  const series = extractChannelSeries(samples, channel);
  const drafts: DetectedRiseDraft[] = [];
  let cursor = 0;

  while (cursor < series.length) {
    const pre = findPlateauFrom(series, cursor, channel, config);
    if (!pre) break;

    const rise = scanPhysicalRiseNeighborhood(series, pre, channel, config);
    if (!rise) {
      cursor = pre.startIdx + 1;
      continue;
    }

    const peakValue = Math.max(...rise.risePoints.map((p) => p.value));
    const post = findLocalPostPlateauAfterRise(
      series,
      rise.peakIdx + 1,
      rise.peakIdx,
      pre.median,
      peakValue,
      channel,
      config,
    );

    const baseDraft = {
      channel,
      prePlateau: pre,
      risePoints: rise.risePoints,
      postPlateau: post,
      riseOnsetAt: series[rise.riseStartIdx].timestamp,
      riseEndAt: post
        ? post.samples[0].timestamp
        : series[rise.peakIdx].timestamp,
      sensorResetSuspected: rise.sensorResetSuspected,
      returnedToBaselineBeforePost: rise.returnedToBaseline,
    };

    const lifecycle = classifyLifecycle(baseDraft, channel, config);
    const criticalPath = [
      ...pre.samples,
      ...rise.risePoints,
      ...(post?.samples ?? []),
    ];

    drafts.push({
      ...baseDraft,
      ...lifecycle,
      maxSampleGapSeconds: maxGapSeconds(criticalPath),
    });

    cursor = post ? post.endIdx + 1 : rise.peakIdx + 1;
  }

  return drafts;
}

export function draftToObservationFields(
  draft: DetectedRiseDraft,
  context: RawFuelRiseDetectionContext,
  config: RawFuelRiseDetectorConfig,
): {
  preFuelAbsoluteLiters: number | null;
  postFuelAbsoluteLiters: number | null;
  deltaAbsoluteLiters: number | null;
  preFuelRelativePercent: number | null;
  postFuelRelativePercent: number | null;
  deltaRelativePercent: number | null;
  prePlateauSampleCount: number;
  postPlateauSampleCount: number;
  totalSampleCount: number;
  physicalEvidenceStart: Date;
  physicalEvidenceEnd: Date;
  evidenceMeta: Record<string, unknown>;
  qualityMeta: Record<string, unknown>;
} {
  const preSource = draft.prePlateau.samples[0]?.source;
  const postSource =
    draft.postPlateau?.samples[draft.postPlateau.samples.length - 1]?.source ??
    draft.risePoints[draft.risePoints.length - 1]?.source;

  const preCorr = preSource ? readCorroborationAt(preSource, draft.channel) : null;
  const postCorr = postSource ? readCorroborationAt(postSource, draft.channel) : null;

  const primaryPre = draft.prePlateau.median;
  const risePeak = Math.max(...draft.risePoints.map((p) => p.value));
  const primaryPost = draft.postPlateau?.median ?? risePeak;
  const primaryDelta = primaryPost - primaryPre;

  const absoluteFields =
    draft.channel === 'ABSOLUTE_LITERS'
      ? {
          preFuelAbsoluteLiters: primaryPre,
          postFuelAbsoluteLiters: primaryPost,
          deltaAbsoluteLiters: primaryDelta,
          preFuelRelativePercent: preCorr?.relativePercent ?? null,
          postFuelRelativePercent: postCorr?.relativePercent ?? null,
          deltaRelativePercent:
            preCorr?.relativePercent != null && postCorr?.relativePercent != null
              ? postCorr.relativePercent - preCorr.relativePercent
              : null,
        }
      : {
          preFuelAbsoluteLiters: preCorr?.absoluteLiters ?? null,
          postFuelAbsoluteLiters: postCorr?.absoluteLiters ?? null,
          deltaAbsoluteLiters:
            preCorr?.absoluteLiters != null && postCorr?.absoluteLiters != null
              ? postCorr.absoluteLiters - preCorr.absoluteLiters
              : null,
          preFuelRelativePercent: primaryPre,
          postFuelRelativePercent: primaryPost,
          deltaRelativePercent: primaryDelta,
        };

  return {
    ...absoluteFields,
    prePlateauSampleCount: draft.prePlateau.samples.length,
    postPlateauSampleCount: draft.postPlateau?.samples.length ?? 0,
    totalSampleCount:
      draft.prePlateau.samples.length +
      draft.risePoints.length +
      (draft.postPlateau?.samples.length ?? 0),
    physicalEvidenceStart: draft.prePlateau.samples[0].timestamp,
    physicalEvidenceEnd:
      draft.postPlateau?.samples[draft.postPlateau.samples.length - 1]?.timestamp ??
      draft.risePoints[draft.risePoints.length - 1].timestamp,
    evidenceMeta: {
      detectorModel: 'STABLE_PRE_RISING_STABLE_POST',
      primaryChannel: draft.channel,
      thresholdProvenance: config.thresholdProvenance,
      providerSampleSpacingNotPhysicalDuration: true,
    },
    qualityMeta: {
      maxSampleGapSeconds: draft.maxSampleGapSeconds,
      risePointCount: draft.risePoints.length,
    },
  };
}

export type { DetectedRiseDraft };
