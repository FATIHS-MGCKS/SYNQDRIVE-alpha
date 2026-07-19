import { describe, expect, it } from '@jest/globals';
import { hashAuditReport, assertApplyGuards } from './device-connection-episode-reconciliation.safety.util';

describe('device-connection-episode-reconciliation.safety.util', () => {
  it('hashes audit reports deterministically', () => {
    const a = hashAuditReport('{"summary":{"total":1}}');
    const b = hashAuditReport('{"summary":{"total":1}}');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('requires backup and operator for apply', () => {
    expect(() =>
      assertApplyGuards({
        apply: true,
        organizationId: 'org-1',
        backupConfirmed: false,
        batchSize: 5,
      }),
    ).toThrow(/backup-confirmed/);

    expect(() =>
      assertApplyGuards({
        apply: true,
        organizationId: 'org-1',
        backupConfirmed: true,
        operator: 'ops',
        reason: 'staging',
        batchSize: 100,
      }),
    ).toThrow(/batch-size/);
  });
});
