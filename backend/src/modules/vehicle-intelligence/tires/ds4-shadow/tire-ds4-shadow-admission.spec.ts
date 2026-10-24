import {
  classifyDs4EventQuality,
  durationSecondsFromUtcLabels,
  isIntensityBundleAdmissible,
  ordinalDeltaKmhBucket,
} from './tire-ds4-shadow-admission';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.bundle.version';

describe('tire-ds4-shadow-admission', () => {
  it('classifies artefact suspect ahead of quality label', () => {
    expect(classifyDs4EventQuality('OK', true)).toBe('ARTEFACT_SUSPECT');
    expect(classifyDs4EventQuality('OK', false)).toBe('OK');
    expect(classifyDs4EventQuality('DEGRADED', false)).toBe('DEGRADED');
    expect(classifyDs4EventQuality('LIMITED', false)).toBe('LIMITED');
  });

  it('requires EVENT_V0_3_PLAUS marker for ordinal intensity admissibility', () => {
    expect(isIntensityBundleAdmissible(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1)).toBe(true);
    expect(isIntensityBundleAdmissible('DI_V0_MOTION_CORE_SHADOW_BUNDLE_V0')).toBe(false);
  });

  it('derives duration from UTC labels', () => {
    expect(
      durationSecondsFromUtcLabels('2026-01-01T10:00:00.000Z', '2026-01-01T10:00:03.000Z'),
    ).toBe(3);
    expect(durationSecondsFromUtcLabels('bad', '2026-01-01T10:00:03.000Z')).toBeNull();
  });

  it('maps delta kmh to ordinal buckets without weights', () => {
    expect(ordinalDeltaKmhBucket(5)).toBe('low');
    expect(ordinalDeltaKmhBucket(10)).toBe('medium');
    expect(ordinalDeltaKmhBucket(20)).toBe('high');
  });
});
