import * as fs from 'fs';
import * as path from 'path';

describe('EXP-021 fleet runtime import boundaries', () => {
  const fleetDir = path.join(__dirname);
  const runtimeFiles = [
    'reference-capture-exp021-fleet-coordinator.service.ts',
    'reference-capture-exp021-fleet.repository.ts',
  ];

  for (const file of runtimeFiles) {
    it(`${file} does not import backend/scripts/ops`, () => {
      const source = fs.readFileSync(path.join(fleetDir, file), 'utf8');
      expect(source).not.toMatch(/scripts\/ops/);
    });
  }

  it('coordinator imports HF policy gate from runtime module', () => {
    const source = fs.readFileSync(
      path.join(fleetDir, 'reference-capture-exp021-fleet-coordinator.service.ts'),
      'utf8',
    );
    expect(source).toContain("from '../reference-capture-exp021-hf-policy-gate.lib'");
  });
});
