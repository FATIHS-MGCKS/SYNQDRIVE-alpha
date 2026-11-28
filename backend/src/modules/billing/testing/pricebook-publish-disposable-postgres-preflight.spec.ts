import {
  assertPricebookPublishDisposablePostgres,
  PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX,
} from './pricebook-publish-disposable-postgres-preflight';

const OPT_IN = 'PRICEBOOK_PUBLISH_POSTGRES_INTEGRATION';

describe('pricebook publish disposable postgres preflight', () => {
  const priorUrl = process.env.DATABASE_URL;
  const priorOptIn = process.env[OPT_IN];

  afterEach(() => {
    if (priorUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = priorUrl;
    }
    if (priorOptIn === undefined) {
      delete process.env[OPT_IN];
    } else {
      process.env[OPT_IN] = priorOptIn;
    }
  });

  it('rejects non-loopback hostname', () => {
    process.env[OPT_IN] = '1';
    process.env.DATABASE_URL = `postgresql://u:p@db.example.com:5432/${PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX}_x`;

    expect(() => assertPricebookPublishDisposablePostgres(OPT_IN)).toThrow(/loopback/);
  });

  it('accepts loopback with disposable database name', () => {
    process.env[OPT_IN] = '1';
    process.env.DATABASE_URL = `postgresql://u:p@127.0.0.1:5432/${PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX}_ci`;

    expect(() => assertPricebookPublishDisposablePostgres(OPT_IN)).not.toThrow();
  });
});