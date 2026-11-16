import { assertP2Pr3DisposablePostgresPreflight } from './p2-pr3-disposable-postgres-preflight';

const OPT_IN = 'P2_PR3_PREFLIGHT_TEST';

describe('assertP2Pr3DisposablePostgresPreflight', () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalFlag = process.env[OPT_IN];

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    process.env[OPT_IN] = originalFlag;
  });

  it('rejects missing opt-in flag', () => {
    delete process.env[OPT_IN];
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5433/synqdrive_p2_pr3_vehicle_access';
    expect(() => assertP2Pr3DisposablePostgresPreflight(OPT_IN)).toThrow(/required/);
  });

  it('rejects non-localhost hosts', () => {
    process.env[OPT_IN] = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@db.example.com/synqdrive_p2_pr3_vehicle_access';
    expect(() => assertP2Pr3DisposablePostgresPreflight(OPT_IN)).toThrow(/127\.0\.0\.1/);
  });

  it('rejects production-like URL hints', () => {
    process.env[OPT_IN] = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/synqdrive_production';
    expect(() => assertP2Pr3DisposablePostgresPreflight(OPT_IN)).toThrow(/rejected/);
  });

  it('accepts allowed disposable database name on localhost', () => {
    process.env[OPT_IN] = '1';
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1';
    expect(() => assertP2Pr3DisposablePostgresPreflight(OPT_IN)).not.toThrow();
  });
});