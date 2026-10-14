import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';

describe('vsi-readonly-composer.postgres-guard', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('refuses production-like database URLs', () => {
    process.env.VSI03_READONLY_COMPOSER_PG = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@app.synqdrive.eu:5432/db';
    expect(() => assertVsi03DisposablePostgresTarget()).toThrow(/production-like/i);
  });
});
