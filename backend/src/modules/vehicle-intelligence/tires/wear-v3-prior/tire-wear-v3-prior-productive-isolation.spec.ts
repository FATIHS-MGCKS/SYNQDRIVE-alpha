import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

const PRODUCTIVE_PATHS = [
  'backend/src/modules/vehicle-intelligence/tires/tire-health.service.ts',
  'backend/src/modules/vehicle-intelligence/tires/tire-health-alert.service.ts',
  'backend/src/modules/vehicle-intelligence/tires/tire-wear-model.service.ts',
  'backend/src/modules/vehicle-intelligence/tires/tire-health-presentation.ts',
  'backend/src/modules/rental-health/tire-rental-health.policy.ts',
  'backend/src/modules/rental-health/rental-health.service.ts',
];

describe('tire wear V3 prior productive isolation', () => {
  it('productive tire health paths do not reference V3 prior shadow store or service', () => {
    for (const rel of PRODUCTIVE_PATHS) {
      const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(text).not.toMatch(/tire_wear_v3_prior_shadow_v1/i);
      expect(text).not.toMatch(/TireWearV3PriorShadowV1/i);
      expect(text).not.toMatch(/TireWearV3PriorService/i);
      expect(text).not.toMatch(/tire-wear-v3-prior/i);
    }
  });

  it('V2 model version constant remains tire-wear-v2', () => {
    const text = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/tires/tire-wear-model-version.ts'),
      'utf8',
    );
    expect(text).toContain("TIRE_WEAR_MODEL_VERSION = 'tire-wear-v2'");
  });
});
