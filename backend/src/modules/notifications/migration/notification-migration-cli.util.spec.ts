import {
  loadCheckpoint,
  parseMigrationCliArgs,
  saveCheckpoint,
} from './notification-migration-cli.util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('notification-migration-cli.util', () => {
  it('parses CLI flags', () => {
    const args = parseMigrationCliArgs([
      'node',
      'script',
      '--org',
      'org-1',
      '--out',
      '/tmp/out.json',
      '--checkpoint',
      '/tmp/cp.json',
      '--batch-size',
      '25',
      '--include-inactive',
      '--apply',
    ]);

    expect(args).toEqual({
      orgId: 'org-1',
      outPath: '/tmp/out.json',
      checkpointPath: '/tmp/cp.json',
      batchSize: 25,
      includeInactive: true,
      apply: true,
      dryRun: false,
    });
  });

  it('defaults to dry-run when --apply is absent', () => {
    const args = parseMigrationCliArgs(['node', 'script', '--org', 'org-1']);
    expect(args.dryRun).toBe(true);
    expect(args.apply).toBe(false);
  });

  it('validates checkpoint organization', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-cli-'));
    const cpPath = path.join(dir, 'checkpoint.json');
    fs.writeFileSync(
      cpPath,
      JSON.stringify({ organizationId: 'org-a', processedCount: 0 }),
      'utf8',
    );

    expect(() => loadCheckpoint(cpPath, 'org-b')).toThrow('Checkpoint organization mismatch');
    expect(loadCheckpoint(cpPath, 'org-a')?.organizationId).toBe('org-a');
  });

  it('does not save checkpoint on dry-run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-cli-'));
    const cpPath = path.join(dir, 'checkpoint.json');

    saveCheckpoint(cpPath, { organizationId: 'org-1' }, { apply: false });
    expect(fs.existsSync(cpPath)).toBe(false);

    saveCheckpoint(cpPath, { organizationId: 'org-1' }, { apply: true });
    expect(fs.existsSync(cpPath)).toBe(true);
  });
});
