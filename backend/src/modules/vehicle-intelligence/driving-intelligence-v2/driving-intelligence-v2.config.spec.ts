import { ConfigService } from '@nestjs/config';
import { DrivingIntelligenceV2Config } from './driving-intelligence-v2.config';

describe('DrivingIntelligenceV2Config', () => {
  function createConfig(env: Record<string, boolean>) {
    const config = {
      get: (key: string, defaultValue: boolean) => {
        if (key === 'drivingIntelligenceV2.masterEnabled') {
          return env.master ?? defaultValue;
        }
        if (key === 'drivingIntelligenceV2.dimoSegmentValidationEnabled') {
          return env.dimoSegmentValidation ?? defaultValue;
        }
        return defaultValue;
      },
    } as ConfigService;
    return new DrivingIntelligenceV2Config(config);
  }

  it('isTripDetectionAffected is always false', () => {
    const cfg = createConfig({ master: true, dimoSegmentValidation: true });
    expect(cfg.isTripDetectionAffected()).toBe(false);
  });

  it('dimo segment validation requires master flag', () => {
    const off = createConfig({ master: false, dimoSegmentValidation: true });
    expect(off.isDimoSegmentValidationEnabled()).toBe(false);

    const on = createConfig({ master: true, dimoSegmentValidation: true });
    expect(on.isDimoSegmentValidationEnabled()).toBe(true);
  });
});
