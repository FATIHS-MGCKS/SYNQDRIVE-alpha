import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'crypto';

const DIST_KINEMATICS = path.join(
  process.cwd(),
  'dist/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics',
);

describe('C5.1 algorithm fingerprint (Nest production dist)', () => {
  const jsPath = path.join(DIST_KINEMATICS, 'c5-1-gated-repair-v1-2.js');
  const gatePath = path.join(DIST_KINEMATICS, 'c5-1-gated-repair.js');

  it('hashes compiled v1-2.js without ENOENT', () => {
    if (!fs.existsSync(jsPath) || !fs.existsSync(gatePath)) {
      // Run `npm run build` before this spec in CI / local release gates.
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gate = require(gatePath) as {
      resolveC5_1AlgorithmFilePathForFingerprint: (baseDir?: string) => string;
      motionCoreSpeedC5_1AlgorithmFileSha256: () => string;
    };
    const resolved = gate.resolveC5_1AlgorithmFilePathForFingerprint(DIST_KINEMATICS);
    expect(resolved).toBe(jsPath);
    const expected = createHash('sha256').update(fs.readFileSync(jsPath)).digest('hex');
    expect(gate.motionCoreSpeedC5_1AlgorithmFileSha256()).toBe(expected);
  });
});
