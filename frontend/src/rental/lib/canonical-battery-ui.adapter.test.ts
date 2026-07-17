import { describe, expect, it } from 'vitest';
import {
  isCanonicalBatteryTracked,
  resolveCanonicalBatteryUiSeverity,
  resolveCanonicalEstimatedHealthScore,
  resolveCanonicalHvSohPercent,
} from './canonical-battery-ui.adapter';
import { evHvProviderSoh, iceLvLiveStable, iceLvUnsupported } from './battery-test-fixtures';

describe('canonical-battery-ui.adapter', () => {
  it('reads estimated LV score from canonical assessment', () => {
    const score = resolveCanonicalEstimatedHealthScore(iceLvLiveStable());
    expect(score).toBe(82);
  });

  it('returns null estimated score during calibration', () => {
    const calibrating = {
      ...iceLvLiveStable(),
      lv: { ...iceLvLiveStable().lv!, publicationState: 'INITIAL_CALIBRATION' as const },
    };
    expect(resolveCanonicalEstimatedHealthScore(calibrating)).toBeNull();
  });

  it('maps rental critical + LV status to UI severity', () => {
    const severity = resolveCanonicalBatteryUiSeverity(
      { ...iceLvLiveStable(), lv: { ...iceLvLiveStable().lv!, healthStatus: 'CRITICAL' } },
      'critical',
    );
    expect(severity).toBe('critical');
  });

  it('prefers canonical provider SOH percent for HV', () => {
    expect(resolveCanonicalHvSohPercent(evHvProviderSoh())).toBe(91);
  });

  it('tracks battery when live voltage or estimated score exists', () => {
    expect(isCanonicalBatteryTracked(iceLvLiveStable())).toBe(true);
    expect(isCanonicalBatteryTracked(iceLvUnsupported())).toBe(false);
  });
});
