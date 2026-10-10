import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reserveApprovalIdForDispatch } from './di-v0-s4-gate6-approval-consumption.lib';
import {
  DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV,
  DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV,
  issueLiveOpenDispatchToken,
} from './di-v0-s4-gate6-dispatch-token.lib';
import { generateGate6Ed25519FixtureKeyPair, signGate6HumanApprovalRecordV2 } from './di-v0-s4-gate6-human-approval-ed25519.lib';
import {
  finalizeTrustedDispatchIssuanceSpendForLiveOpen,
  recordTrustedDispatchIssuance,
  verifyTrustedDispatchProvenanceForLiveOpen,
  type TrustedDispatchIssuanceRecordV1,
} from './di-v0-s4-gate6-trusted-dispatch-issuance.lib';
import {
  DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE_ENV,
  DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR_ENV,
} from './di-v0-s4-gate6-production-paths.lib';

function setupGate6TrustedDispatchFixture(): {
  dir: string;
  env: NodeJS.ProcessEnv;
  approvalPath: string;
  publicPath: string;
  registerDir: string;
  issuanceDir: string;
  macKeyPath: string;
  tokenDir: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-trusted-dispatch-'));
  const registerDir = path.join(dir, 'approval-register');
  const issuanceDir = path.join(dir, 'issuance-register');
  const tokenDir = path.join(dir, 'tokens');
  const macKeyPath = path.join(dir, 'issuance-mac.key');
  fs.mkdirSync(registerDir);
  fs.mkdirSync(issuanceDir);
  fs.mkdirSync(tokenDir);
  fs.writeFileSync(macKeyPath, randomBytes(32).toString('hex'), 'utf8');

  const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
  const publicPath = path.join(dir, 'public.pem');
  fs.writeFileSync(publicPath, publicKeyPem, 'utf8');
  const now = Date.now();
  const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
    approvalId: 'trusted-dispatch-apr-01',
    actor: 'actor-a',
    reason: 'reason-r',
    requiredSha: 'a'.repeat(40),
    requiredReleaseId: 'rel',
    requiredEnvSha256: 'b'.repeat(64),
    validFromMs: now - 60_000,
    validUntilMs: now + 3600_000,
  });
  const approvalPath = path.join(dir, 'approval.json');
  fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR: registerDir,
    [DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR_ENV]: issuanceDir,
    [DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE_ENV]: macKeyPath,
    DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE: publicPath,
    DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
    DI_S4_GATE6_OPERATOR_REASON: 'reason-r',
    DI_S4_GATE6_OPERATOR_ACTOR: 'actor-a',
    DI_S4_TINY_STAGING_REQUIRED_SHA: 'a'.repeat(40),
    DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID: 'rel',
    DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256: 'b'.repeat(64),
  };
  return { dir, env, approvalPath, publicPath, registerDir, issuanceDir, macKeyPath, tokenDir };
}

function issueWithTrustedRecord(
  env: NodeJS.ProcessEnv,
  tokenDir: string,
  approvalId: string,
): { filePath: string; signingKeyFilePath: string; record: ReturnType<typeof issueLiveOpenDispatchToken>['record'] } {
  const { generateGate6Ed25519FixtureKeyPair, signGate6HumanApprovalRecordV2 } = require('./di-v0-s4-gate6-human-approval-ed25519.lib');
  const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
  const now = Date.now();
  const approvalRecord = signGate6HumanApprovalRecordV2(privateKeyPem, {
    approvalId,
    actor: 'actor-a',
    reason: 'reason-r',
    requiredSha: 'a'.repeat(40),
    requiredReleaseId: 'rel',
    requiredEnvSha256: 'b'.repeat(64),
    validFromMs: now - 60_000,
    validUntilMs: now + 3600_000,
  });
  const verified = {
    scheme: 'ed25519-v2' as const,
    record: approvalRecord,
    publicKeySource: 'fixture',
  };
  reserveApprovalIdForDispatch(env.DI_S4_GATE6_APPROVAL_CONSUMPTION_REGISTER_DIR!, approvalId);
  const issued = issueLiveOpenDispatchToken(tokenDir, {
    approvalId,
    requiredSha: 'a'.repeat(40),
    requiredReleaseId: 'rel',
    requiredEnvSha256: 'b'.repeat(64),
    reason: 'reason-r',
    actor: 'actor-a',
  });
  const recorded = recordTrustedDispatchIssuance(env, { tokenRecord: issued.record, verifiedApproval: verified });
  if (!recorded.ok) throw new Error(recorded.failure);
  return issued;
}

const BACKEND_ROOT = path.join(__dirname, '../../..');
const ISSUANCE_SPEND_WORKER = path.join(__dirname, 'di-v0-s4-gate6-trusted-dispatch-issuance-fork.worker.ts');

function runIssuanceSpendWorker(env: NodeJS.ProcessEnv, nonce: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const cp = spawn('npx', ['--yes', 'ts-node', '--transpile-only', ISSUANCE_SPEND_WORKER, nonce], {
      cwd: BACKEND_ROOT,
      env,
    });
    const chunks: Buffer[] = [];
    cp.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    cp.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    cp.on('close', (code: number | null) => {
      resolve({ code: code ?? 1, out: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

describe('trusted dispatch issuance provenance (S4F-7AX.3)', () => {
  jest.setTimeout(120_000);

  it('privileged issuance register writable check matches register dir', () => {
    const { issuanceDir } = setupGate6TrustedDispatchFixture();
    const { privilegedIssuanceRegisterWritable } = require('./di-v0-s4-gate6-trusted-dispatch-issuance.lib');
    expect(privilegedIssuanceRegisterWritable(issuanceDir)).toBe(true);
  });

  it('verify passes for privileged issuance + consumed approval', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    expect(recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified }).ok).toBe(true);
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(true);
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects self-issued token with HMAC sidecar but no trusted issuance record', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('TRUSTED_DISPATCH_ISSUANCE_RECORD_MISSING');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects valid token with wrong approval id in human approval file', () => {
    const fx = setupGate6TrustedDispatchFixture();
    const issued = issueWithTrustedRecord(fx.env, fx.tokenDir, 'other-approval-id-99');
    reserveApprovalIdForDispatch(fx.registerDir, 'other-approval-id-99');
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('HUMAN_APPROVAL_TOKEN_MISMATCH');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects when approval not consumed in register', () => {
    const fx = setupGate6TrustedDispatchFixture();
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('TRUSTED_DISPATCH_APPROVAL_NOT_CONSUMED');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects approval signed with wrong key (self-issued Ed25519, pinned production public)', () => {
    const fx = setupGate6TrustedDispatchFixture();
    const { privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'wrong-key-apr',
      actor: 'actor-a',
      reason: 'reason-r',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    const badApproval = path.join(fx.dir, 'wrong-key-approval.json');
    fs.writeFileSync(badApproval, JSON.stringify(record), 'utf8');
    reserveApprovalIdForDispatch(fx.registerDir, 'wrong-key-apr');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'wrong-key-apr',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = { scheme: 'ed25519-v2' as const, record, publicKeySource: 'fixture' };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const env = {
      ...fx.env,
      DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: badApproval,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('HUMAN_APPROVAL_REVERIFY_FAILED');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects tampered issuance record MAC', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const recordPath = path.join(fx.issuanceDir, `gate6-dispatch-issuance.${issued.record.nonce}.json`);
    const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as TrustedDispatchIssuanceRecordV1;
    parsed.reason = 'tampered';
    fs.writeFileSync(recordPath, JSON.stringify(parsed), 'utf8');
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('TRUSTED_DISPATCH_ISSUANCE_MAC_INVALID');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('blocks second live-open spend on same issuance nonce', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    expect(finalizeTrustedDispatchIssuanceSpendForLiveOpen(fx.env, issued.record.nonce).ok).toBe(true);
    const again = finalizeTrustedDispatchIssuanceSpendForLiveOpen(fx.env, issued.record.nonce);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.failure).toBe('TRUSTED_DISPATCH_ISSUANCE_ALREADY_SPENT');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('allows exactly one winner among concurrent issuance spend workers', async () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const workers = 12;
    const results = await Promise.all(
      Array.from({ length: workers }, () => runIssuanceSpendWorker(fx.env, issued.record.nonce)),
    );
    const wins = results.filter((r) => r.code === 0);
    const losses = results.filter((r) => r.code !== 0);
    expect(wins.length).toBe(1);
    expect(wins[0]?.out).toContain('ISSUANCE_SPEND_OK=YES');
    expect(losses.every((r) => !r.out.includes('ISSUANCE_SPEND_OK=YES'))).toBe(true);
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('rejects expired human approval at live-open verify', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const approvalRecord = JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8'));
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
      issuedAtMs: approvalRecord.validUntilMs - 5_000,
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: approvalRecord,
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env, {
      nowMs: approvalRecord.validUntilMs + 60_000,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.failures).toContain('HUMAN_APPROVAL_REVERIFY_FAILED');
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });

  it('digest mismatch when token JSON altered but sidecar MAC still wrong path', () => {
    const fx = setupGate6TrustedDispatchFixture();
    reserveApprovalIdForDispatch(fx.registerDir, 'trusted-dispatch-apr-01');
    const issued = issueLiveOpenDispatchToken(fx.tokenDir, {
      approvalId: 'trusted-dispatch-apr-01',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'reason-r',
      actor: 'actor-a',
    });
    const verified = {
      scheme: 'ed25519-v2' as const,
      record: JSON.parse(fs.readFileSync(fx.approvalPath, 'utf8')),
      publicKeySource: 'fixture',
    };
    recordTrustedDispatchIssuance(fx.env, { tokenRecord: issued.record, verifiedApproval: verified });
    const raw = JSON.parse(fs.readFileSync(issued.filePath, 'utf8'));
    raw.reason = 'altered';
    fs.writeFileSync(issued.filePath, JSON.stringify(raw), 'utf8');
    const env = {
      ...fx.env,
      [DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV]: issued.filePath,
      [DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV]: issued.signingKeyFilePath,
    };
    const v = verifyTrustedDispatchProvenanceForLiveOpen(env);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(
        v.failures.some((f) =>
          [
            'DISPATCH_TOKEN_PEEK_FAILED',
            'TRUSTED_DISPATCH_ISSUANCE_DIGEST_MISMATCH',
            'DISPATCH_TOKEN_PINS_MISMATCH',
          ].includes(f),
        ),
      ).toBe(true);
    }
    fs.rmSync(fx.dir, { recursive: true, force: true });
  });
});
