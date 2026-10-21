import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract: production deploy runs `SYNQDRIVE_BOOT_CHECK=1 timeout 120 node dist/src/main.js`.
 * Boot check must call process.exit(0) after app.close() so open Redis/Bull handles cannot hang the gate.
 */
describe('SYNQDRIVE_BOOT_CHECK deploy contract (source)', () => {
  const mainSource = readFileSync(join(__dirname, '../../src/main.ts'), 'utf8');

  it('exits the process after successful boot check', () => {
    expect(mainSource).toMatch(/SYNQDRIVE_BOOT_CHECK === '1'/);
    expect(mainSource).toMatch(/Boot check OK/);
    expect(mainSource).toMatch(/await app\.close\(\)/);
    expect(mainSource).toMatch(/process\.exit\(0\)/);
  });

  it('bootstrap failures terminate with non-zero exit', () => {
    expect(mainSource).toMatch(/bootstrap\(\)\.catch/);
    expect(mainSource).toMatch(/process\.exit\(1\)/);
  });
});
