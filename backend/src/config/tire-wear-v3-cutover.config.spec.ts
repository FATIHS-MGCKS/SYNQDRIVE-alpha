import tireWearV3CutoverConfig, {
  TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE_ENV,
  TIRE_WEAR_V3_CUSTOMER_READ_ENABLED_ENV,
} from './tire-wear-v3-cutover.config';

describe('tire-wear-v3-cutover.config', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('defaults customer read flags to false (safe)', () => {
    delete process.env[TIRE_WEAR_V3_CUSTOMER_READ_ENABLED_ENV];
    delete process.env[TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE_ENV];
    const cfg = tireWearV3CutoverConfig();
    expect(cfg.customerReadEnabled).toBe(false);
    expect(cfg.customerReadAuthoritative).toBe(false);
  });
});
