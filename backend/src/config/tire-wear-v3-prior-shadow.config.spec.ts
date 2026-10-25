import tireWearV3PriorShadowConfig, {
  TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED_ENV,
} from './tire-wear-v3-prior-shadow.config';

describe('tire-wear-v3-prior-shadow.config', () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it('defaults shadow write to false', () => {
    delete process.env[TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED_ENV];
    expect(tireWearV3PriorShadowConfig().writeEnabled).toBe(false);
  });
});
