import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isApprovalIdConsumed,
  reserveApprovalIdForDispatch,
} from './di-v0-s4-gate6-approval-consumption.lib';

describe('Gate-6 approvalId consumption register', () => {
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

  it('blocks concurrent second reservation for same approvalId', () => {
    const id = 'approval-id-02';
    const claimingPrefix = path.join(registerDir, `gate6-approval-id.${id}.claiming.`);
    fs.writeFileSync(`${claimingPrefix}stale.pid`, 'stale\n', 'utf8');
    const blocked = reserveApprovalIdForDispatch(registerDir, id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.failure).toBe('APPROVAL_CONSUMPTION_STATE_UNKNOWN');
  });

  it('rejects invalid approvalId shape', () => {
    const r = reserveApprovalIdForDispatch(registerDir, 'short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe('APPROVAL_ID_INVALID');
  });
});
