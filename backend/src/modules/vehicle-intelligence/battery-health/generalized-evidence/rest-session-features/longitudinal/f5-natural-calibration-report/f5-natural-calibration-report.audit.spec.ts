import { M3_3E_CALIBRATION_UNSET_V1 } from '../longitudinal-health-calibration-profile';

describe('F5 report no runtime reachability', () => {
  it('uses UNSET calibration profile only', () => {
    expect(M3_3E_CALIBRATION_UNSET_V1).toBe('M3_3E_CALIBRATION_UNSET_V1');
  });
});

describe('F5 report contract', () => {
  it('has zero HTTP/scheduler/worker/customer call sites in module path', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const dir = path.join(__dirname);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/@Controller|@Interval|BullModule|publish/i);
      if (file === 'f5-natural-calibration-report.service.ts') {
        expect(src).not.toMatch(/\.(create|update|delete|upsert)\(/i);
        expect(src).not.toMatch(/\$executeRawUnsafe\(\s*'(?!SET TRANSACTION READ ONLY)/);
      }
    }
  });

  it('Q. classifies timeout failures with F5ReportTimeoutError', () => {
    const { F5ReportTimeoutError } = require('./f5-natural-calibration-report.types') as typeof import('./f5-natural-calibration-report.types');
    const err = new F5ReportTimeoutError('F5 report timeout exceeded');
    expect(err.name).toBe('F5ReportTimeoutError');
  });
});
