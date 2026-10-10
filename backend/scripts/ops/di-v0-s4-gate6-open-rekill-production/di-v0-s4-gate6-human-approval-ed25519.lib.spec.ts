import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  generateGate6Ed25519FixtureKeyPair,
  signGate6HumanApprovalRecordV2,
  verifyGate6HumanApprovalRecordV2,
} from './di-v0-s4-gate6-human-approval-ed25519.lib';
import { loadAndVerifyHumanApprovalFile } from './di-v0-s4-gate6-human-approval.lib';

describe('Gate-6 Ed25519 human approval (v2)', () => {
  const pins = {
    requiredSha: 'a'.repeat(40),
    requiredReleaseId: 'rel-2026',
    requiredEnvSha256: 'b'.repeat(64),
    reason: 'authorized live open',
    actor: 'gate6-signer',
  };

  it('verifies offline-signed v2 approval with public key only', () => {
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'ed25519-apr-001',
      actor: pins.actor,
      reason: pins.reason,
      requiredSha: pins.requiredSha,
      requiredReleaseId: pins.requiredReleaseId,
      requiredEnvSha256: pins.requiredEnvSha256,
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    const verified = verifyGate6HumanApprovalRecordV2(publicKeyPem, record, pins, now);
    expect(verified.ok).toBe(true);
  });

  it('rejects tampered signature', () => {
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'ed25519-apr-002',
      actor: pins.actor,
      reason: pins.reason,
      requiredSha: pins.requiredSha,
      requiredReleaseId: pins.requiredReleaseId,
      requiredEnvSha256: pins.requiredEnvSha256,
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    record.signature = Buffer.alloc(64, 1).toString('base64');
    const verified = verifyGate6HumanApprovalRecordV2(publicKeyPem, record, pins, now);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.failures).toContain('HUMAN_APPROVAL_ED25519_SIGNATURE_INVALID');
  });

  it('loadAndVerifyHumanApprovalFile accepts v2 when public key file is configured', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-ed25519-'));
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const publicPath = path.join(dir, 'public.pem');
    const approvalPath = path.join(dir, 'approval.json');
    fs.writeFileSync(publicPath, publicKeyPem, 'utf8');
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'ed25519-apr-003',
      actor: pins.actor,
      reason: pins.reason,
      requiredSha: pins.requiredSha,
      requiredReleaseId: pins.requiredReleaseId,
      requiredEnvSha256: pins.requiredEnvSha256,
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');
    const loaded = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
        DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE: publicPath,
      },
      pins,
      { nowMs: now },
    );
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.verified.scheme).toBe('ed25519-v2');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fail-closed on production issuance before HMAC v1 can be verified (trust anchors + no override)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-ed25519-prod-'));
    const approvalPath = path.join(dir, 'approval-v1.json');
    fs.writeFileSync(
      approvalPath,
      JSON.stringify({
        v: 1,
        approvalId: 'hmac-forbidden-01',
        actor: pins.actor,
        reason: pins.reason,
        requiredSha: pins.requiredSha,
        requiredReleaseId: pins.requiredReleaseId,
        requiredEnvSha256: pins.requiredEnvSha256,
        approvedAtMs: 1_700_000_000_000,
        mac: '0'.repeat(64),
      }),
      'utf8',
    );
    const loaded = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
        SYNQDRIVE_BACKEND_ENV_CANONICAL: '/opt/synqdrive/shared/backend.env',
      },
      pins,
    );
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.failures).toContain('HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_MISSING');
      expect(loaded.failures).not.toContain('HUMAN_APPROVAL_MAC_INVALID');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
