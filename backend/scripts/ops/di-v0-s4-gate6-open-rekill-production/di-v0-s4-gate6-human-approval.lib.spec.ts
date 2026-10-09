import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createHumanApprovalRecord,
  loadAndVerifyHumanApprovalFile,
  writeFixtureHumanApprovalFile,
} from './di-v0-s4-gate6-human-approval.lib';

describe('Gate-6 human approval authority', () => {
  let dir: string;
  let rootKeyPath: string;
  const rootKey = 'fixture-root-key-material';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-approval-'));
    rootKeyPath = path.join(dir, 'root.key');
    fs.writeFileSync(rootKeyPath, rootKey, 'utf8');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('verifies signed approval file independent of OPEN_ACK env alone', () => {
    const approvalPath = path.join(dir, 'approval.json');
    writeFixtureHumanApprovalFile(approvalPath, rootKey, {
      approvalId: 'apr-1',
      actor: 'operator',
      reason: 'live open',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      approvedAtMs: 1_700_000_000_000,
    });
    const verified = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
        DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE: rootKeyPath,
        DI_S4_GATE6_OPEN_ACK: 'YES',
        DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
      },
      {
        requiredSha: 'a'.repeat(40),
        requiredReleaseId: 'rel',
        requiredEnvSha256: 'b'.repeat(64),
        reason: 'live open',
        actor: 'operator',
      },
    );
    expect(verified.ok).toBe(true);
  });

  it('blocks when root key is missing (independent authority unavailable)', () => {
    const approvalPath = path.join(dir, 'approval.json');
    writeFixtureHumanApprovalFile(approvalPath, rootKey, {
      approvalId: 'apr-2',
      actor: 'operator',
      reason: 'live open',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      approvedAtMs: 1_700_000_000_000,
    });
    const verified = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
      },
      {
        requiredSha: 'a'.repeat(40),
        requiredReleaseId: 'rel',
        requiredEnvSha256: 'b'.repeat(64),
        reason: 'live open',
        actor: 'operator',
      },
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.failures).toContain('INDEPENDENT_APPROVAL_AUTHORITY_BLOCKED');
  });

  it('rejects tampered approval MAC', () => {
    const approvalPath = path.join(dir, 'approval.json');
    const record = createHumanApprovalRecord(rootKey, {
      approvalId: 'apr-3',
      actor: 'operator',
      reason: 'live open',
      requiredSha: 'a'.repeat(40),
      requiredReleaseId: 'rel',
      requiredEnvSha256: 'b'.repeat(64),
      approvedAtMs: 1_700_000_000_000,
    });
    record.mac = '0'.repeat(64);
    fs.writeFileSync(approvalPath, JSON.stringify(record), 'utf8');
    const verified = loadAndVerifyHumanApprovalFile(
      {
        DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE: approvalPath,
        DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE: rootKeyPath,
      },
      {
        requiredSha: 'a'.repeat(40),
        requiredReleaseId: 'rel',
        requiredEnvSha256: 'b'.repeat(64),
        reason: 'live open',
        actor: 'operator',
      },
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.failures).toContain('HUMAN_APPROVAL_MAC_INVALID');
  });
});
