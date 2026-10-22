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

  it('excludes existing outbox / succeeded runs before discovery ORDER BY LIMIT', () => {
    const repoPath = path.join(
      __dirname,
      '../di-v0-m7a-road-assignment-shadow-outbox.repository.ts',
    );
    const sql = fs.readFileSync(repoPath, 'utf8');
    expect(sql).toContain('FROM di_v0_m7a_road_assignment_shadow_outbox_v1 o');
    expect(sql).toContain('ORDER BY e.completed_at ASC');
    expect(sql.indexOf('NOT EXISTS')).toBeLessThan(sql.indexOf('ORDER BY e.completed_at ASC'));
  });

  it('processes at most one claimed trip per claimBatch(1) loop in service', () => {
    const servicePath = path.join(__dirname, '../di-v0-m7a-road-assignment-shadow.service.ts');
    const src = fs.readFileSync(servicePath, 'utf8');
    expect(src).toContain('claimBatch(1, now)');
    expect(src).toContain('claimLeaseRenewIntervalMs');
  });
});
