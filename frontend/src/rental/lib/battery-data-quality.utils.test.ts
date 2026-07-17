import { describe, expect, it } from 'vitest';
import {
  batteryDataQualityChipTone,
  batteryDataQualityDetailNoteDe,
  batteryDataQualityShortLabel,
} from './battery-data-quality.utils';
import { normalizeBatteryDataQualityStatus } from './battery-data-quality';

describe('battery-data-quality utils', () => {
  const t = (key: string) => key;

  it('never normalizes unknown quality to VERIFIED', () => {
    expect(normalizeBatteryDataQualityStatus('BELIEVE_ME')).toBeNull();
  });

  it('maps PROXY and LEGACY_UNVERIFIED to non-success chip tones', () => {
    expect(batteryDataQualityChipTone('PROXY')).toBe('watch');
    expect(batteryDataQualityChipTone('LEGACY_UNVERIFIED')).toBe('critical');
  });

  it('uses i18n keys for labels', () => {
    expect(batteryDataQualityShortLabel('STALE', t)).toBe(
      'health.battery.dataQuality.short.STALE',
    );
  });

  it('omits detail notes for decision-capable qualities', () => {
    expect(batteryDataQualityDetailNoteDe('VERIFIED')).toBeNull();
    expect(batteryDataQualityDetailNoteDe('LEGACY_UNVERIFIED')).toBeTruthy();
  });
});
