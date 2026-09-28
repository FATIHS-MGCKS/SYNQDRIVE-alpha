import type { RawFuelSignalSample } from '../../raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import {
  stablePlateauSamples,
} from '../../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { buildWob20260927EventBSamples } from './wob-2026-09-19-stretched-end.fixture';

/** Local dual-channel corroboration aligned to WOB Event B rise window (detector-identical absolute spine). */
export function buildEventBDualChannelCorroboratedSamples(): RawFuelSignalSample[] {
  const abs = buildWob20260927EventBSamples();
  return abs.map((s) => {
    const t = s.timestamp.getTime();
    const preStart = new Date('2026-09-27T21:30:46.923Z').getTime();
    const riseOn = new Date('2026-09-27T21:34:16.923Z').getTime();
    const riseEnd = new Date('2026-09-27T21:36:46.923Z').getTime();
    const postStart = new Date('2026-09-27T21:37:30.000Z').getTime();
    let relativePercent: number | null = null;
    if (t < riseOn) relativePercent = 8;
    else if (t <= riseEnd) {
      const frac = (t - riseOn) / (riseEnd - riseOn);
      relativePercent = 8 + frac * (25 - 8);
    } else if (t >= postStart) relativePercent = 25;
    return { ...s, relativePercent };
  });
}

/** Absolute Event B rise with relative samples only far from rise (must not TRUST). */
export function buildEventBDistantRelativeSamples(): RawFuelSignalSample[] {
  const abs = buildWob20260927EventBSamples();
  const distantPre = stablePlateauSamples('2026-09-27T21:17:16.923Z', 8, 3, 120, 'relative');
  const distantPost = stablePlateauSamples('2026-09-27T21:50:00.000Z', 25, 3, 120, 'relative');
  return [...distantPre, ...abs, ...distantPost];
}

/** Material absolute rise with local relative contradiction (same absolute spine as Event B). */
export function buildEventBContradictoryDualChannelSamples(): RawFuelSignalSample[] {
  const abs = buildWob20260927EventBSamples();
  return abs.map((s) => {
    const t = s.timestamp.getTime();
    const riseOn = new Date('2026-09-27T21:34:16.923Z').getTime();
    const riseEnd = new Date('2026-09-27T21:36:46.923Z').getTime();
    if (t < riseOn) {
      return { ...s, relativePercent: 40 };
    }
    if (t <= riseEnd) {
      return { ...s, relativePercent: null };
    }
    return { ...s, relativePercent: 5 };
  });
}
