import {
  assertRestFeatureInspectDatabaseAllowed,
  BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV,
} from './rest-session-feature-inspect.env';

describe('rest-session-feature-inspect.env', () => {
  const ackBackup = process.env[BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV];

  afterEach(() => {
    if (ackBackup === undefined) {
      delete process.env[BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV];
    } else {
      process.env[BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV] = ackBackup;
    }
  });

  it('denies recognized production DATABASE_URL by default', () => {
    expect(() =>
      assertRestFeatureInspectDatabaseAllowed('postgresql://u:p@srv1374778.hstgr.cloud:5432/db'),
    ).toThrow(/Refusing rest-session feature inspect/);
  });

  it('allows production host only with explicit readonly ack', () => {
    process.env[BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV] = 'true';
    expect(() =>
      assertRestFeatureInspectDatabaseAllowed('postgresql://u:p@app.synqdrive.eu:5432/db'),
    ).not.toThrow();
  });
});
