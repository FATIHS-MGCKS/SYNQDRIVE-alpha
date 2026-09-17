import * as fs from 'fs';
import * as path from 'path';

describe('EXP-021 maturation shadow Stage-1A isolation', () => {
  const fleetDir = path.join(__dirname, '..', 'exp021-fleet');
  const fleetFiles = [
    'reference-capture-exp021-fleet-coordinator.service.ts',
    'reference-capture-exp021-fleet.repository.ts',
    'reference-capture-exp021-fleet-freshness-resolver.lib.ts',
  ];

  for (const file of fleetFiles) {
    it(`${file} does not write maturation shadow tables`, () => {
      const source = fs.readFileSync(path.join(fleetDir, file), 'utf8');
      expect(source).not.toMatch(/exp021MaturationShadow/);
      expect(source).not.toMatch(/exp021_maturation_shadow_/);
    });
  }
});
