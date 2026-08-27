import { BatteryMeasurementQuality } from '@prisma/client';
import {
  isLvRestShadowContaminationQuality,
  isLvRestShadowMeasurementContext,
  isLvRestShadowModeActive,
  resolveLvRestShadowEvidenceEligible,
  withLvRestShadowContext,
} from './lv-rest-shadow.policy';

describe('lv-rest-shadow.policy', () => {
  const originalRestEnv = process.env.BATTERY_V2_REST_SHADOW_ENABLED;
  const originalPubEnv = process.env.BATTERY_V2_PUBLICATION_ENABLED;

  afterEach(() => {
    if (originalRestEnv === undefined) {
      delete process.env.BATTERY_V2_REST_SHADOW_ENABLED;
    } else {
      process.env.BATTERY_V2_REST_SHADOW_ENABLED = originalRestEnv;
    }
    if (originalPubEnv === undefined) {
      delete process.env.BATTERY_V2_PUBLICATION_ENABLED;
    } else {
      process.env.BATTERY_V2_PUBLICATION_ENABLED = originalPubEnv;
    }
  });

  it('is inactive when canonical REST pipeline flag is off', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'false';
    expect(isLvRestShadowModeActive()).toBe(false);
  });

  it('is active when pipeline on and publication off', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
    expect(isLvRestShadowModeActive()).toBe(true);
  });

  it('is inactive when publication is enabled (production cutover)', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    expect(isLvRestShadowModeActive()).toBe(false);
  });

  it('marks context with shadowMode when wrapping', () => {
    const wrapped = withLvRestShadowContext({ restTargetType: 'REST_60M' });
    expect(wrapped.shadowMode).toBe(true);
    expect(isLvRestShadowMeasurementContext(wrapped)).toBe(true);
  });

  it('forces evidence eligibility off in shadow mode', () => {
    process.env.BATTERY_V2_REST_SHADOW_ENABLED = 'true';
    process.env.BATTERY_V2_PUBLICATION_ENABLED = 'false';
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
