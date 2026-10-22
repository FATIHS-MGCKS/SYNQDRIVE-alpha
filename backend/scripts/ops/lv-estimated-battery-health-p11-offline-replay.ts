/**
 * Offline P1 vs P11 replay on frozen production episode fixture (no DB).
 */
import * as fs from 'fs';
import * as path from 'path';
import { evaluateLvEstimatedBatteryHealthV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';
import { evaluateLvEstimatedBatteryHealthV1WithResearchPolicy } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';

const fixturePath =
  process.argv[2] ??
  path.resolve(
    __dirname,
    '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/fixtures/n16-p10-production-episodes.fixture.json',
  );

// Reuse spec helpers via dynamic import of test module is avoided — minimal inline runner calls Jest fixture file instead.
console.error(
  'Use: npx jest --runInBand lv-estimated-battery-health-p11.production-fixture.spec.ts',
);
console.error(`Fixture: ${fixturePath}`);
if (fs.existsSync(fixturePath)) {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  console.log(JSON.stringify({ fixtureVehicles: raw.vehicles?.map((v: { label: string }) => v.label) }, null, 2));
}
