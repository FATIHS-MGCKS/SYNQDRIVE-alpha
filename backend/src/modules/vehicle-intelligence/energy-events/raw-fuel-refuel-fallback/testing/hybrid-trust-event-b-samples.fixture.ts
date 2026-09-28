import type { RawFuelSignalSample } from '../../raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import {
  sampleAt,
  stablePlateauSamples,
} from '../../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { buildWob20260927EventBSamples } from './wob-2026-09-19-stretched-end.fixture';

/** Local dual-channel corroboration aligned to WOB Event B rise window. */
export function buildEventBDualChannelCorroboratedSamples(): RawFuelSignalSample[] {
  const preAbs = stablePlateauSamples('2026-09-27T21:30:46.923Z', 4, 3, 50, 'absolute');
  const preRel = stablePlateauSamples('2026-09-27T21:30:46.923Z', 8, 3, 50, 'relative');
  const rise = [
    sampleAt('2026-09-27T21:34:16.923Z', 6, 12),
    sampleAt('2026-09-27T21:35:30.000Z', 10, 18),
    sampleAt('2026-09-27T21:36:46.923Z', 13, 25),
  ];
  const postAbs = stablePlateauSamples('2026-09-27T21:37:30.000Z', 13, 5, 45, 'absolute');
  const postRel = stablePlateauSamples('2026-09-27T21:37:30.000Z', 25, 5, 45, 'relative');
  const merged = [...preAbs];
  for (let i = 0; i < preRel.length; i++) {
    merged[i] = { ...merged[i]!, relativePercent: preRel[i]!.relativePercent };
  }
  merged.push(...rise);
  for (let i = 0; i < postAbs.length; i++) {
    merged.push({ ...postAbs[i]!, relativePercent: postRel[i]!.relativePercent });
  }
  return merged;
}

/** Absolute Event B rise with relative samples only far from rise (must not TRUST). */
export function buildEventBDistantRelativeSamples(): RawFuelSignalSample[] {
  const abs = buildWob20260927EventBSamples();
  const distantPre = stablePlateauSamples('2026-09-27T21:17:16.923Z', 8, 3, 120, 'relative');
  const distantPost = stablePlateauSamples('2026-09-27T21:50:00.000Z', 25, 3, 120, 'relative');
  return [...distantPre, ...abs, ...distantPost];
}

/** Material absolute rise with local relative contradiction. */
export function buildEventBContradictoryDualChannelSamples(): RawFuelSignalSample[] {
  const preAbs = stablePlateauSamples('2026-09-27T21:30:46.923Z', 4, 3, 50, 'absolute');
  const preRel = stablePlateauSamples('2026-09-27T21:30:46.923Z', 40, 3, 50, 'relative');
  const rise = [
    sampleAt('2026-09-27T21:34:16.923Z', 12, 35),
    sampleAt('2026-09-27T21:35:30.000Z', 11, 20),
    sampleAt('2026-09-27T21:36:46.923Z', 13, null),
  ];
  const postAbs = stablePlateauSamples('2026-09-27T21:37:30.000Z', 13, 5, 45, 'absolute');
  const postRel = stablePlateauSamples('2026-09-27T21:37:30.000Z', 5, 5, 45, 'relative');
  const merged = [...preAbs];
  for (let i = 0; i < preRel.length; i++) {
    merged[i] = { ...merged[i]!, relativePercent: preRel[i]!.relativePercent };
  }
  merged.push(...rise);
  for (let i = 0; i < postAbs.length; i++) {
    merged.push({ ...postAbs[i]!, relativePercent: postRel[i]!.relativePercent });
  }
  return merged;
}
