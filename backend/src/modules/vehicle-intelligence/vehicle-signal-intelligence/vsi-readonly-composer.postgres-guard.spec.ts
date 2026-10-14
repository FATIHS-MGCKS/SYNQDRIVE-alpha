import {
  assertVsi03DisposablePostgresTarget,
  isVsi03DisposableDatabaseName,
  parsePostgresDatabaseName,
} from './vsi-readonly-composer.postgres-guard';

describe('vsi-readonly-composer.postgres-guard', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('refuses production-like database hosts', () => {
    process.env.VSI03_READONLY_COMPOSER_PG = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@app.synqdrive.eu:5432/vsi03_test_ci';
    expect(() => assertVsi03DisposablePostgresTarget()).toThrow(/production-like/i);
  });

  it('rejects localhost with production database name synqdrive', () => {
    process.env.VSI03_READONLY_COMPOSER_PG = '1';
    process.env.DATABASE_URL = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
    expect(() => assertVsi03DisposablePostgresTarget()).toThrow(/production-like database name/i);
  });

  it('allows localhost with disposable vsi03_test_ci database name', () => {
    process.env.VSI03_READONLY_COMPOSER_PG = '1';
    process.env.DATABASE_URL = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/vsi03_test_ci?schema=public';
    expect(() => assertVsi03DisposablePostgresTarget()).not.toThrow();
  });

  it('rejects unknown non-disposable database names', () => {
    process.env.VSI03_READONLY_COMPOSER_PG = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/b1_h3_ephemeral';
    expect(() => assertVsi03DisposablePostgresTarget()).toThrow(/vsi03_test_/i);
    expect(isVsi03DisposableDatabaseName('b1_h3_ephemeral')).toBe(false);
  });

  it('parses database name from URL', () => {
    expect(parsePostgresDatabaseName('postgresql://u@localhost:5432/vsi03_test_ci?schema=public')).toBe(
      'vsi03_test_ci',
    );
  });
});
