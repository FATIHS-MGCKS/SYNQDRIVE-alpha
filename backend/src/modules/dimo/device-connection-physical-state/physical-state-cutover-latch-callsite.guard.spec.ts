import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND_SRC = join(__dirname, '../../..');

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectSourceFiles(fullPath, acc);
      continue;
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

describe('physical-state cutover latch callsite guard', () => {
  it('allows latchLegacyToPhysicalInTransaction only from authority cutover service', () => {
    const offenders: string[] = [];
    const allowed = new Set([
      join(
        BACKEND_SRC,
        'modules/dimo/device-connection-physical-state/physical-state-authority-cutover.service.ts',
      ),
      join(
        BACKEND_SRC,
        'modules/dimo/device-connection-physical-state/device-connection-physical-authority-cutover.repository.ts',
      ),
    ]);

    for (const file of collectSourceFiles(BACKEND_SRC)) {
      const content = readFileSync(file, 'utf8');
      if (!content.includes('latchLegacyToPhysicalInTransaction')) continue;
      if (!allowed.has(file)) {
        offenders.push(file.replace(`${BACKEND_SRC}/`, ''));
      }
    }

    expect(offenders).toEqual([]);
  });
});
