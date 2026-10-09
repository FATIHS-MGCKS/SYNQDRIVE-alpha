import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  consumeLiveOpenDispatchToken,
  DISPATCH_TOKEN_TTL_MS,
  issueLiveOpenDispatchToken,
} from './di-v0-s4-gate6-dispatch-token.lib';

describe('live-open dispatch token', () => {
  let tokenDir: string;

  beforeEach(() => {
    tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-dispatch-'));
  });

  afterEach(() => {
    fs.rmSync(tokenDir, { recursive: true, force: true });
  });

  it('issues and consumes one-shot token', () => {
    const { filePath } = issueLiveOpenDispatchToken(tokenDir, {
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'operator reason',
      actor: 'operator actor',
      issuedAtMs: 1_700_000_000_000,
    });
    expect(fs.existsSync(filePath)).toBe(true);
    const consumed = consumeLiveOpenDispatchToken(filePath, 1_700_000_000_100);
    expect(consumed.ok).toBe(true);
    if (consumed.ok) {
      expect(consumed.consumed).toBe(true);
      expect(consumed.record.reason).toBe('operator reason');
    }
    expect(fs.existsSync(filePath)).toBe(false);
    const again = consumeLiveOpenDispatchToken(filePath, 1_700_000_000_200);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.failures).toContain('DISPATCH_TOKEN_ALREADY_CONSUMED');
  });

  it('rejects expired token', () => {
    const issuedAt = 1_700_000_000_000;
    const { filePath } = issueLiveOpenDispatchToken(tokenDir, {
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
      issuedAtMs: issuedAt,
    });
    const consumed = consumeLiveOpenDispatchToken(filePath, issuedAt + DISPATCH_TOKEN_TTL_MS + 1);
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.failures).toContain('DISPATCH_TOKEN_EXPIRED');
  });

  it('rejects tampered MAC', () => {
    const { filePath, record } = issueLiveOpenDispatchToken(tokenDir, {
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      reason: 'r',
      actor: 'a',
    });
    const tampered = { ...record, mac: '0'.repeat(64) };
    fs.writeFileSync(filePath, JSON.stringify(tampered), 'utf8');
    const consumed = consumeLiveOpenDispatchToken(filePath);
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.failures).toContain('DISPATCH_TOKEN_MAC_INVALID');
  });
});
