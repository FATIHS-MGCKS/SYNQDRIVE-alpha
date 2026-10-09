import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  consumeLiveOpenDispatchToken,
  DISPATCH_TOKEN_TTL_MS,
  dispatchSigningKeySidecarPath,
  issueLiveOpenDispatchToken,
} from './di-v0-s4-gate6-dispatch-token.lib';

describe('live-open dispatch token (v2 HMAC separation)', () => {
  let tokenDir: string;

  beforeEach(() => {
    tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-dispatch-'));
  });

  afterEach(() => {
    fs.rmSync(tokenDir, { recursive: true, force: true });
  });

  it('issues and consumes one-shot token without secret in payload', () => {
    const { filePath, signingKeyFilePath, record } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'approval-1',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'operator reason',
      actor: 'operator actor',
      issuedAtMs: 1_700_000_000_000,
    });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    expect(raw.secret).toBeUndefined();
    expect(raw.v).toBe(2);
    expect(fs.existsSync(signingKeyFilePath)).toBe(true);
    const consumed = consumeLiveOpenDispatchToken(filePath, {
      signingKeyFile: signingKeyFilePath,
      nowMs: 1_700_000_000_100,
    });
    expect(consumed.ok).toBe(true);
    if (consumed.ok) {
      expect(consumed.record.approvalId).toBe('approval-1');
      expect(consumed.record.reason).toBe('operator reason');
    }
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(signingKeyFilePath)).toBe(false);
    const again = consumeLiveOpenDispatchToken(filePath, { signingKeyFile: signingKeyFilePath });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.failures.some((f) => f.includes('CONSUMED') || f.includes('REPLAY'))).toBe(true);
  });

  it('rejects replay when only JSON copy exists without signing key sidecar', () => {
    const { filePath, signingKeyFilePath } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'approval-2',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
    });
    const copyPath = path.join(tokenDir, 'copy.json');
    fs.copyFileSync(filePath, copyPath);
    fs.unlinkSync(signingKeyFilePath);
    const consumed = consumeLiveOpenDispatchToken(copyPath, { signingKeyFile: dispatchSigningKeySidecarPath(copyPath) });
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.failures).toContain('DISPATCH_SIGNING_KEY_MISSING');
  });

  it('rejects expired token and burns one-shot', () => {
    const issuedAt = 1_700_000_000_000;
    const { filePath, signingKeyFilePath } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'approval-3',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
      issuedAtMs: issuedAt,
    });
    const consumed = consumeLiveOpenDispatchToken(filePath, {
      signingKeyFile: signingKeyFilePath,
      nowMs: issuedAt + DISPATCH_TOKEN_TTL_MS + 1,
    });
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.failures).toContain('DISPATCH_TOKEN_EXPIRED');
    const again = consumeLiveOpenDispatchToken(filePath, { signingKeyFile: signingKeyFilePath });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.failures.some((f) => f.includes('CONSUMED') || f.includes('REPLAY'))).toBe(true);
  });

  it('rejects tampered MAC', () => {
    const { filePath, signingKeyFilePath, record } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'approval-4',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
    });
    const tampered = { ...record, mac: '0'.repeat(64) };
    fs.writeFileSync(filePath, JSON.stringify(tampered), 'utf8');
    const consumed = consumeLiveOpenDispatchToken(filePath, { signingKeyFile: signingKeyFilePath });
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.failures).toContain('DISPATCH_TOKEN_MAC_INVALID');
  });

  it('allows only one winner under concurrent double consumption', async () => {
    const { filePath, signingKeyFilePath } = issueLiveOpenDispatchToken(tokenDir, {
      approvalId: 'approval-5',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
    });
    const [a, b] = await Promise.all([
      Promise.resolve(consumeLiveOpenDispatchToken(filePath, { signingKeyFile: signingKeyFilePath })),
      Promise.resolve(consumeLiveOpenDispatchToken(filePath, { signingKeyFile: signingKeyFilePath })),
    ]);
    const wins = [a, b].filter((r) => r.ok);
    const losses = [a, b].filter((r) => !r.ok);
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(1);
  });
});
