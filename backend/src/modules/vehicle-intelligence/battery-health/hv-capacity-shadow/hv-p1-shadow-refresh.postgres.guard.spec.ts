import {
  assertHvP1PostgresIntegrationTarget,
  isHvP1DisposableDatabaseName,
  parsePostgresDatabaseName,
} from './hv-p1-shadow-refresh.postgres.guard';

describe('hv-p1-shadow-refresh.postgres.guard', () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevFlag = process.env.HV_P1_POSTGRES_INTEGRATION;

  afterEach(() => {
    process.env.DATABASE_URL = prevUrl;
    process.env.HV_P1_POSTGRES_INTEGRATION = prevFlag;
  });

  it('accepts disposable local database names', () => {
    expect(isHvP1DisposableDatabaseName('synqdrive_hv_p1_integration_gate')).toBe(true);
    expect(parsePostgresDatabaseName(
      'postgresql://synqdrive:synqdrive@127.0.0.1:55433/synqdrive_hv_p1_integration_gate',
    )).toBe('synqdrive_hv_p1_integration_gate');
  });

  it('rejects shared or production-like targets fail-closed', () => {
    process.env.HV_P1_POSTGRES_INTEGRATION = '1';
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_test';
    expect(() => assertHvP1PostgresIntegrationTarget()).toThrow(/Refusing/);

    process.env.DATABASE_URL =
      'postgresql://u:p@remote.example.com:5432/synqdrive_hv_p1_integration_gate';
    expect(() => assertHvP1PostgresIntegrationTarget()).toThrow(/non-local/);
  });
});
