import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(
  __dirname,
  '../../../../../../scripts/ops/di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh',
);

function runAudit(envPath: string): string {
  return execFileSync('bash', [SCRIPT], {
    env: { ...process.env, SYNQDRIVE_BACKEND_ENV: envPath },
    encoding: 'utf8',
  });
}

function parseLines(out: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  }
  return map;
}

describe('di-v0-s4f-tiny-activation-global-budget-env-readonly-audit.sh', () => {
  it('declares CONFIG_FILE_ONLY scope and does not claim runtime enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 's4f-budget-audit-'));
    const envPath = join(dir, 'backend.env');
    writeFileSync(envPath, '# comment only\n', 'utf8');
    const lines = parseLines(runAudit(envPath));
    expect(lines.EVIDENCE_SCOPE).toBe('CONFIG_FILE_ONLY');
    expect(lines.ACTIVE_RUNTIME_CONFIRMATION).toBe('NOT_PERFORMED');
    expect(lines.FILE_AUDIT_CAN_ALONE_SATISFY_TINY_GATE).toBe('NO');
    expect(lines.GLOBAL_BUDGET_CONFIG_FILE_STATE).toBe('MISSING');
    expect(lines.GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE).toBe('UNVERIFIED');
    expect(lines).not.toHaveProperty('ACTIVE_RUNTIME_ENABLED');
  });

  it('reports EXPLICIT_ENABLED for recognized true token', () => {
    const dir = mkdtempSync(join(tmpdir(), 's4f-budget-audit-'));
    const envPath = join(dir, 'backend.env');
    writeFileSync(envPath, 'DIMO_GLOBAL_BUDGET_ENABLED=true\n', 'utf8');
    const lines = parseLines(runAudit(envPath));
    expect(lines.GLOBAL_BUDGET_CONFIG_FILE_STATE).toBe('EXPLICIT_ENABLED');
    expect(lines.ACTIVE_RUNTIME_CONFIRMATION).toBe('NOT_PERFORMED');
  });
});
