import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('VO5C-P2B4-0 prisma prune CLI containment', () => {
  const scriptPath = path.join(__dirname, '../../../prisma/prune-master-data.ts');
  const backendRoot = path.join(__dirname, '../../..');

  it('script source does not import PrismaClient', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/PrismaClient/);
    expect(source).toContain('PLATFORM_PRUNE_DISABLED');
  });

  it('exits nonzero with PLATFORM_PRUNE_DISABLED before any DB access', () => {
    let stderr = '';
    let exitCode: number | undefined;
    try {
      execFileSync(
        'npx',
        ['ts-node', 'prisma/prune-master-data.ts'],
        {
          cwd: backendRoot,
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/should-never-connect',
            PRUNE_ENABLED: 'true',
            FORCE_PRUNE: '1',
            NODE_ENV: 'development',
          },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      exitCode = e.status;
      stderr = String(e.stderr ?? '');
    }
    expect(exitCode).toBe(1);
    expect(stderr).toContain('PLATFORM_PRUNE_DISABLED');
  });
});
