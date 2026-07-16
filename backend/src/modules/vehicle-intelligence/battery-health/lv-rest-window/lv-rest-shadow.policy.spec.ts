import { BatteryMeasurementQuality } from '@prisma/client';
import {
  isLvRestShadowContaminationQuality,
  isLvRestShadowMeasurementContext,
  isLvRestShadowModeActive,
  resolveLvRestShadowEvidenceEligible,
  withLvRestShadowContext,
} from './lv-rest-shadow.policy';

describe('lv-rest-shadow.policy', () => {
  const originalEnv = process.env.BATTERY_V2_REST_SHADOW_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BATTERY_V2_REST_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = originalEnv;
    }
  });

  it('is inactive when feature flag is off', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';
    expect(isLvRestShadowModeActive()).toBe(false);
  });

  it('is active when feature flag is on', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    expect(isLvRestShadowModeActive()).toBe(true);
  });

  it('marks context with shadowMode when wrapping', () => {
    const wrapped = withLvRestShadowContext({ restTargetType: 'REST_60M' });
    expect(wrapped.shadowMode).toBe(true);
    expect(isLvRestShadowMeasurementContext(wrapped)).toBe(true);
  });

  it('forces evidence eligibility off in shadow mode', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    expect(resolveLvRestShadowEvidenceEligible(true)).toBe(false);
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';
    expect(resolveLvRestShadowEvidenceEligible(true)).toBe(true);
  });

  it('detects contamination qualities', () => {
    expect(
      isLvRestShadowContaminationQuality(
        'CONTAMINATED_BY_WAKE' as BatteryMeasurementQuality,
      ),
    ).toBe(true);
    expect(isLvRestShadowContaminationQuality('VALID' as BatteryMeasurementQuality)).toBe(
      false,
    );
  });
});
