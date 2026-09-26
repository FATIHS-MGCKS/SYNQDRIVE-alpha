import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      walkTsFiles(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('DI V0 shadow public API isolation', () => {
  it('DI_SHADOW_PUBLIC_API_COUNT=0', () => {
    const roots = [
      path.join(REPO_ROOT, 'backend/src/modules'),
      path.join(REPO_ROOT, 'frontend/src'),
    ];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        if (file.includes('driving-intelligence/shadow-persistence')) {
          continue;
        }
        const content = fs.readFileSync(file, 'utf8');
        if (
          content.includes('DiV0ShadowPersistenceService') ||
          content.includes('diV0ShadowRun') ||
          content.includes('di_v0_shadow_runs')
        ) {
          hits.push(file);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
