import * as fs from 'node:fs';
import * as path from 'node:path';

describe('M7A road-assignment shadow concurrency / lease safety', () => {
  it('reclaims expired PROCESSING rows in claimBatch SQL', () => {
    const repoPath = path.join(
      __dirname,
      '../di-v0-m7a-road-assignment-shadow-outbox.repository.ts',
    );
    const sql = fs.readFileSync(repoPath, 'utf8');
    expect(sql).toContain("status = 'PROCESSING' AND claim_expires_at IS NOT NULL AND claim_expires_at <=");
  });

  it('processes at most one claimed trip per claimBatch(1) loop in service', () => {
    const servicePath = path.join(__dirname, '../di-v0-m7a-road-assignment-shadow.service.ts');
    const src = fs.readFileSync(servicePath, 'utf8');
    expect(src).toContain('claimBatch(1, now)');
    expect(src).toContain('claimLeaseRenewIntervalMs');
  });
});
