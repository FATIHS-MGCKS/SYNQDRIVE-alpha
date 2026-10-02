import type { RawRefuelCandidateSignalChannel } from '@prisma/client';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from './raw-fuel-rise-detector.config';
import { selectPrimarySignalChannel } from './raw-fuel-rise-channel-authority';
import { mapDraftToObservation } from './raw-fuel-rise-observation-mapper';
import { normalizeRawFuelSamples, extractChannelSeries } from './raw-fuel-rise-normalizer';
import { detectChannelRises } from './raw-fuel-rise-state-machine';
import type { RawFuelRiseDetectionInput } from './raw-fuel-signal-sample.types';
import type { RawFuelRiseDetectionResult } from './raw-fuel-rise-detector.types';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';

export function detectRawFuelRises(
  input: RawFuelRiseDetectionInput,
  config = RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
): RawFuelRiseDetectionResult {
  const { context, samples } = input;
  const normalized = normalizeRawFuelSamples(
    samples,
    context.scanWindowStart,
    context.scanWindowEnd,
    config.relativeValidRange,
  );

  if (!normalized.ok) {
    return {
      candidates: [],
      rejectedOrHeld: [
        {
          reason: normalized.reason,
          lifecycleState: 'REJECTED',
          detail: normalized.detail,
        },
      ],
      diagnostics: emptyDiagnostics(context, 0, 0, 0),
      context,
    };
  }

  const channelSelection = selectPrimarySignalChannel(
    context,
    normalized.samples,
    config,
  );

  if (!channelSelection.ok) {
    return {
      candidates: [],
      rejectedOrHeld: [
        {
          reason: channelSelection.reason,
          lifecycleState: 'INSUFFICIENT',
          detail: channelSelection.reason,
        },
      ],
      diagnostics: emptyDiagnostics(
        context,
        normalized.samples.length,
        0,
        0,
      ),
      context,
    };
  }

  const channel = channelSelection.channel;
  return buildDetectionResultForChannel(
    context,
    normalized.samples,
    channel,
    config,
  );
}

/**
 * F10.6.8-B recovery path — reuse F3 semantics on the persisted candidate channel only.
 * Does not alter normal detectRawFuelRises channel selection.
 */
export function detectRawFuelRisesForPersistedSignalChannel(
  input: RawFuelRiseDetectionInput,
  forcedChannel: RawRefuelCandidateSignalChannel,
  config = RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
): RawFuelRiseDetectionResult {
  const { context, samples } = input;
  const normalized = normalizeRawFuelSamples(
    samples,
    context.scanWindowStart,
    context.scanWindowEnd,
    config.relativeValidRange,
  );

  if (!normalized.ok) {
    return {
      candidates: [],
      rejectedOrHeld: [
        {
          reason: normalized.reason,
          lifecycleState: 'REJECTED',
          detail: normalized.detail,
        },
      ],
      diagnostics: emptyDiagnostics(context, 0, 0, 0),
      context,
    };
  }

  const channelSeries = extractChannelSeries(normalized.samples, forcedChannel);
  if (channelSeries.length === 0) {
    return {
      candidates: [],
      rejectedOrHeld: [
        {
          reason: 'insufficient_channel_samples',
          lifecycleState: 'INSUFFICIENT',
          detail: 'persisted_signal_channel_unavailable',
        },
      ],
      diagnostics: emptyDiagnostics(
        context,
        normalized.samples.length,
        0,
        0,
      ),
      context,
    };
  }

  return buildDetectionResultForChannel(
    context,
    normalized.samples,
    forcedChannel,
    config,
  );
}

function buildDetectionResultForChannel(
  context: RawFuelRiseDetectionInput['context'],
  normalizedSamples: NormalizedRawFuelSample[],
  channel: RawRefuelCandidateSignalChannel,
  config: typeof RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
): RawFuelRiseDetectionResult {
  const channelSeries = extractChannelSeries(normalizedSamples, channel);
  const drafts = detectChannelRises(normalizedSamples, channel, config);
  const candidates = drafts
    .filter((draft) => draft.lifecycleState !== 'REJECTED')
    .map((draft) => mapDraftToObservation(draft, context, config));

  const rejectedOrHeld = drafts
    .filter((draft) => draft.lifecycleState === 'REJECTED')
    .map((draft) => ({
      reason: draft.rejectionReason ?? 'RISE_NOT_STABLE',
      lifecycleState: 'REJECTED' as const,
      channel,
      detail: draft.rejectionReason ?? undefined,
    }));

  const rejectedCounts: Record<string, number> = {};
  for (const item of rejectedOrHeld) {
    const key = String(item.reason);
    rejectedCounts[key] = (rejectedCounts[key] ?? 0) + 1;
  }

  return {
    candidates,
    rejectedOrHeld,
    diagnostics: {
      primaryChannel: channel,
      normalizedSampleCount: normalizedSamples.length,
      channelSampleCount: channelSeries.length,
      scanWindowStart: context.scanWindowStart.toISOString(),
      scanWindowEnd: context.scanWindowEnd.toISOString(),
      metricsContract: {
        rawRefuelScanRunsTotal: 1,
        rawRefuelRiseDetectedTotal: candidates.length,
        rawRefuelCandidateRejectedTotalByReason: rejectedCounts,
        rawRiseWithoutNativeSegmentTotal: null,
      },
    },
    context,
  };
}

function emptyDiagnostics(
  context: RawFuelRiseDetectionInput['context'],
  normalizedSampleCount: number,
  channelSampleCount: number,
  detected: number,
): RawFuelRiseDetectionResult['diagnostics'] {
  return {
    primaryChannel: null,
    normalizedSampleCount,
    channelSampleCount,
    scanWindowStart: context.scanWindowStart.toISOString(),
    scanWindowEnd: context.scanWindowEnd.toISOString(),
    metricsContract: {
      rawRefuelScanRunsTotal: 1,
      rawRefuelRiseDetectedTotal: detected,
      rawRefuelCandidateRejectedTotalByReason: {},
      rawRiseWithoutNativeSegmentTotal: null,
    },
  };
}

export {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
};

export type { RawFuelRiseDetectionInput, RawFuelRiseDetectionResult };
