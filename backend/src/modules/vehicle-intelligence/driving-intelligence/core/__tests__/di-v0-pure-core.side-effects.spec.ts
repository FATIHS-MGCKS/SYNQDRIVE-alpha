import * as fs from 'fs';
import * as path from 'path';

const CORE_DIR = path.join(__dirname, '..');

function listTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== '__tests__') {
      files.push(...listTsFiles(full));
    } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('DI V0 core side-effect boundary', () => {
  it('core modules do not import forbidden runtime dependencies', () => {
    const forbidden = [
      '@prisma/client',
      '@nestjs/',
      'bullmq',
      'ioredis',
      'redis',
      'process.env',
      'DimoSegmentsService',
    ];
    const files = listTsFiles(CORE_DIR);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        expect(content).not.toContain(token);
      }
    }
  });
});
