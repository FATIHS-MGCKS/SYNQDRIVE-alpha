/**
 * F1-EXP-01 preparation guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  F1_REL,
  stableBlindId,
  verifySourceIntegrity,
} from '../../../../../scripts/ops/ldi-f1-exp01-prepare-blind-review.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('F1-EXP-01 blind review prep', () => {
  it('source integrity', () => {
    const i = verifySourceIntegrity(repoRoot, '/tmp/ldi10d-phase3e8-movs');
    expect(i.manifestCropCount).toBe(142);
    expect(i.checkpointLines).toBe(1028);
    if (fs.existsSync('/tmp/ldi10d-phase3e8-movs/TC_00062.MOV')) expect(i.movShaOk).toBe(true);
  });

  it('stable blind ids', () => {
    expect(stableBlindId('62', 0)).toMatch(/^F1BR-[A-F0-9]{12}$/);
    expect(stableBlindId('62', 0)).toBe(stableBlindId('62', 0));
  });

  it('deliverables present after prepare', () => {
    const base = path.join(repoRoot, F1_REL);
    expect(fs.existsSync(path.join(base, 'LDI_F1_EXP01_PROVENANCE_MANIFEST.json'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'LDI_F1_EXP01_REVIEWER_A_TEMPLATE.csv'))).toBe(true);
    const packs = JSON.parse(
      fs.readFileSync(path.join(base, 'LDI_F1_EXP01_BLIND_PACK_MANIFEST.json'), 'utf8'),
    ) as { packs: Array<{ bytes: number }> };
    for (const p of packs.packs) expect(p.bytes).toBeLessThan(1.8 * 1024 * 1024);
    const readme = fs.readFileSync(path.join(base, 'LDI_F1_EXP01_BLIND_REVIEW_README.md'), 'utf8');
    expect(readme).toContain('HUMAN_LABELING_PENDING');
  });
});
