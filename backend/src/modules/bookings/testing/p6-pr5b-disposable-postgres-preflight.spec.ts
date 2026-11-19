import {
  assertP6Pr5bDisposablePostgresPreflight,
  assertP6Pr5bPostgresReachable,
  P6_PR5B_OPT_IN_ENV,
} from './p6-pr5b-disposable-postgres-preflight';

describe('P6-PR5B disposable Postgres preflight', () => {
  const original = process.env;

  afterEach(() => {
    process.env = { ...original };
  });

  it('rejects when opt-in flag missing', () => {
    delete process.env[P6_PR5B_OPT_IN_ENV];
    expect(() => assertP6Pr5bDisposablePostgresPreflight()).toThrow(/RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1/);
  });

  it('rejects production-like hosts', () => {
    process.env[P6_PR5B_OPT_IN_ENV] = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@srv1374778.hstgr.cloud/synqdrive';
    expect(() => assertP6Pr5bDisposablePostgresPreflight()).toThrow(/forbidden/);
  });

  it('accepts localhost disposable database name', () => {
    process.env[P6_PR5B_OPT_IN_ENV] = '1';
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5432/p6_pr5b_test_ci?schema=public';
    const proof = assertP6Pr5bDisposablePostgresPreflight();
    expect(proof.databaseName).toBe('p6_pr5b_test_ci');
    expect(proof.productionHostRejected).toBe(true);
  });

  it('fail-closed when postgres unreachable with opt-in enabled', async () => {
    process.env[P6_PR5B_OPT_IN_ENV] = '1';
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:1/p6_pr5b_test_unreachable?schema=public';
    await expect(assertP6Pr5bPostgresReachable()).rejects.toThrow(/not reachable/);
  });
});