import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  generateGate6Ed25519FixtureKeyPair,
  signGate6HumanApprovalRecordV2,
} from './di-v0-s4-gate6-human-approval-ed25519.lib';
import { loadAndVerifyHumanApprovalFile } from './di-v0-s4-gate6-human-approval.lib';
import {
  evaluateProductionGate6IssuanceTrustAnchorsWithPinnedPaths,
  productionTrustAnchorFixturePaths,
} from './di-v0-s4-gate6-production-trust-anchor.lib';

describe('Gate-6 production trust anchors (S4F-7AX.1)', () => {
  it('blocks public key env override on production issuance context', () => {
    const { publicKeyPem, privateKeyPem } = generateGate6Ed25519FixtureKeyPair();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-trust-'));
    const approvalPath = path.join(dir, 'approval.json');
    const attackerPublic = path.join(dir, 'attacker-public.pem');
    fs.writeFileSync(attackerPublic, publicKeyPem, 'utf8');
    const now = Date.now();
    const record = signGate6HumanApprovalRecordV2(privateKeyPem, {
      approvalId: 'self-signed-apr-01',
      actor: 'actor',
      reason: 'reason',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      validFromMs: now - 60_000,
      validUntilMs: now + 3600_000,
    });
    fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');

    const verified = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
        DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE: attackerPublic,
        SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
      },
      {
        requiredSha: 'a'.repeat(40),
        requiredReleaseId: 'rel',
        requiredEnvSha256: 'b'.repeat(64),
        reason: 'reason',
        actor: 'actor',
      },
      { nowMs: now },
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.failures).toContain('HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts pinned fixture anchors when backend env realpath matches', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-prod-fixture-'));
    const pinned = productionTrustAnchorFixturePaths(fixtureRoot);
    fs.mkdirSync(path.dirname(pinned.backendEnvPath), { recursive: true });
    fs.mkdirSync(pinned.registerDir, { recursive: true });
    fs.writeFileSync(pinned.backendEnvPath, 'X=1\n', { mode: 0o600 });
    fs.writeFileSync(pinned.publicKeyPath, '-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----\n', {
      mode: 0o600,
    });

    const evaluated = evaluateProductionGate6IssuanceTrustAnchorsWithPinnedPaths(
      { SYNQDRIVE_BACKEND_ENV: pinned.backendEnvPath },
      pinned,
    );
    expect(evaluated.ok).toBe(true);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });
});
