import type { RawFuelRiseDetectionContext } from './raw-fuel-signal-sample.types';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';
import { extractChannelSeries } from './raw-fuel-rise-normalizer';
import type { RawFuelRiseDetectorConfig } from './raw-fuel-rise-detector.config';

export type PrimarySignalChannelSelection =
  | { ok: true; channel: 'ABSOLUTE_LITERS' | 'RELATIVE_PERCENT' }
  | { ok: false; reason: 'no_trusted_channel' | 'insufficient_channel_samples' };

export function selectPrimarySignalChannel(
  context: RawFuelRiseDetectionContext,
  samples: NormalizedRawFuelSample[],
  config: RawFuelRiseDetectorConfig,
): PrimarySignalChannelSelection {
  const absoluteSeries = extractChannelSeries(samples, 'ABSOLUTE_LITERS');
  const relativeSeries = extractChannelSeries(samples, 'RELATIVE_PERCENT');

  if (context.absoluteDetectionAdmissibility === 'ADMISSIBLE') {
    if (absoluteSeries.length >= config.absolute.prePlateauMinSamples) {
      return { ok: true, channel: 'ABSOLUTE_LITERS' };
    }
  } else if (
    context.relativeSignalAvailable &&
    relativeSeries.length >= config.relative.prePlateauMinSamples
  ) {
    return { ok: true, channel: 'RELATIVE_PERCENT' };
  } else {
    return { ok: false, reason: 'no_trusted_channel' };
  }

  if (
    context.relativeSignalAvailable &&
    relativeSeries.length >= config.relative.prePlateauMinSamples
  ) {
    return { ok: true, channel: 'RELATIVE_PERCENT' };
  }

  if (absoluteSeries.length > 0 || relativeSeries.length > 0) {
    return { ok: false, reason: 'insufficient_channel_samples' };
  }

  return { ok: false, reason: 'no_trusted_channel' };
}

/** Corroboration-only secondary channel values at a timestamp. */
export function readCorroborationAt(
  sample: NormalizedRawFuelSample,
  primary: 'ABSOLUTE_LITERS' | 'RELATIVE_PERCENT',
): {
  absoluteLiters: number | null;
  relativePercent: number | null;
} {
  if (primary === 'ABSOLUTE_LITERS') {
    return {
      absoluteLiters: sample.absoluteLiters ?? null,
      relativePercent: sample.relativePercent ?? null,
    };
  }
  return {
    absoluteLiters: sample.absoluteLiters ?? null,
    relativePercent: sample.relativePercent ?? null,
  };
}
