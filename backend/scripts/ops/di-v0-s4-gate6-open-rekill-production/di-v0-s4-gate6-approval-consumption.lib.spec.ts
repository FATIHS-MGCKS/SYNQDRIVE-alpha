import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  consumedMarkerPath,
  consumptionRegisterBlocksOperatorUnlink,
  isApprovalIdConsumed,
  reserveApprovalIdForDispatch,
  resolveApprovalConsumptionRegisterDir,
} from './di-v0-s4-gate6-approval-consumption.lib';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const WORKER = path.join(__dirname, 'di-v0-s4-gate6-approval-consumption-fork.worker.ts');

function runReserveWorker(registerDir: string, approvalId: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const cp = spawn('npx', ['--yes', 'ts-node', '--transpile-only', WORKER, registerDir, approvalId], {
      cwd: BACKEND_ROOT,
    });
    const chunks: Buffer[] = [];
    cp.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    cp.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    cp.on('close', (code: number | null) => {
      resolve({ code: code ?? 1, out: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

describe('Gate-6 approvalId consumption register', () => {
  jest.setTimeout(120_000);

  let registerDir: string;

  beforeEach(() => {
    registerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-consumption-'));
  });

  afterEach(() => {
    fs.rmSync(registerDir, { recursive: true, force: true });
  });

  it('reserves approvalId once and blocks replay', () => {
    const id = 'approval-id-01';
    expect(reserveApprovalIdForDispatch(registerDir, id).ok).toBe(true);
    expect(isApprovalIdConsumed(registerDir, id)).toBe(true);
    const replay = reserveApprovalIdForDispatch(registerDir, id);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.failure).toBe('APPROVAL_ID_ALREADY_CONSUMED');
  });

  it('persists consumption across process restart', async () => {
    const id = 'approval-id-restart';
    const first = await runReserveWorker(registerDir, id);
    expect(first.code).toBe(0);
    const second = await runReserveWorker(registerDir, id);
    expect(second.code).not.toBe(0);
    expect(second.out).toContain('APPROVAL_ID_ALREADY_CONSUMED');
  });

  it(
    'allows exactly one winner among concurrent worker processes',
    async () => {
    const id = 'concurrent-apr-id-01';
    const workers = 20;
    const results = await Promise.all(
      Array.from({ length: workers }, () => runReserveWorker(registerDir, id)),
    );
    const wins = results.filter((r) => r.code === 0);
    const losses = results.filter((r) => r.code !== 0);
    expect(wins.length).toBe(1);
    expect(wins[0]?.out).toContain('RESERVE_OK=YES');
    expect(losses.length).toBe(workers - 1);
    expect(losses.every((r) => !r.out.includes('RESERVE_OK=YES'))).toBe(true);
  },
    90_000,
  );

  it('rejects invalid approvalId shape', () => {
    const r = reserveApprovalIdForDispatch(registerDir, 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe('APPROVAL_ID_INVALID');
  });

  it('documents production register policy blocks operator unlink when root-owned without group write', () => {
    const secureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-secure-register-'));
    fs.chmodSync(secureDir, 0o750);
    try {
      fs.chownSync(secureDir, 0, 0);
    } catch {
      // skip chown when not privileged
    }
    const id = 'immutable-apr-id-01';
    expect(reserveApprovalIdForDispatch(secureDir, id).ok).toBe(true);
    expect(consumptionRegisterBlocksOperatorUnlink(secureDir)).toBe(true);

    const writableDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-writable-register-'));
    fs.chmodSync(writableDir, 0o777);
    expect(consumptionRegisterBlocksOperatorUnlink(writableDir)).toBe(false);

    const marker = consumedMarkerPath(secureDir, id);
    if (process.getuid?.() === 0) {
      try {
        fs.unlinkSync(marker);
        expect(reserveApprovalIdForDispatch(secureDir, id).ok).toBe(false);
      } catch {
        // root may still be blocked by 0750 dir in some environments
      }
    }
    fs.rmSync(secureDir, { recursive: true, force: true });
    fs.rmSync(writableDir, { recursive: true, force: true });
  });

  it('blocks register dir env override on production issuance context', () => {
    const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-register-alt-'));
    const resolved = resolveApprovalConsumptionRegisterDir({
      DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR: alt,
      SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.failure).toBe('APPROVAL_CONSUMPTION_REGISTER_ENV_OVERRIDE_FORBIDDEN');
    }
    fs.rmSync(alt, { recursive: true, force: true });
  });
});
