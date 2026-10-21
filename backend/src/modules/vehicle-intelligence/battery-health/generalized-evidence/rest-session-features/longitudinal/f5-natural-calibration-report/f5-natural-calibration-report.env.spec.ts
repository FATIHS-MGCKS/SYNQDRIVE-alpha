import { assertF5NaturalCalibrationReportDatabaseAllowed } from './f5-natural-calibration-report.env';
import { BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV } from './f5-natural-calibration-report.constants';

describe('f5-natural-calibration-report.env', () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevOptIn = process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV];

  afterEach(() => {
    process.env.DATABASE_URL = prevUrl;
    if (prevOptIn === undefined) delete process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV];
    else process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV] = prevOptIn;
  });

  it('rejects production host without opt-in', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@srv1374778.hstgr.cloud:5432/db';
    delete process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV];
    expect(() => assertF5NaturalCalibrationReportDatabaseAllowed()).toThrow(/Refusing F5/);
  });

  it('allows production host with explicit opt-in', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@srv1374778.hstgr.cloud:5432/db';
    process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV] = 'true';
    expect(() => assertF5NaturalCalibrationReportDatabaseAllowed()).not.toThrow();
  });
});
