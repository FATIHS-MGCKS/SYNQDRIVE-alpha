import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

const PRODUCTIVE_PATHS = [
  'backend/src/modules/vehicle-intelligence/tires/tire-health.service.ts',
  'backend/src/modules/vehicle-intelligence/tires/tire-health-alert.service.ts',
  'backend/src/modules/vehicle-intelligence/tires/tire-wear-model.service.ts',
  'backend/src/modules/rental-health/tire-rental-health.policy.ts',
  'backend/src/modules/rental-health/rental-health.service.ts',
];

describe('tire DS4 shadow productive isolation', () => {
  it('productive tire health and rental paths do not reference the shadow store', () => {
    for (const rel of PRODUCTIVE_PATHS) {
      const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(text).not.toMatch(/tire_ds4_motion_shadow_input_v1/i);
      expect(text).not.toMatch(/TireDs4MotionShadowInputV1/i);
      expect(text).not.toMatch(/TireDs4ShadowRepository/i);
      expect(text).not.toMatch(/tire-ds4-shadow/i);
    }
  });
});
