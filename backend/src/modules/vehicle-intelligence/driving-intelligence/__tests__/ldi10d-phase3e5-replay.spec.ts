/**
 * LDI-10D Phase 3E.5 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadMovOcrCsv,
  verifyPhase3e5Preflight,
  rawHasExplicitCoord,
} from '../../../../../scripts/ops/ldi10d-phase3e5-mov-ocr-validation.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.5', () => {
  it('loads 206-row MOV OCR pack', () => {
    const p = verifyPhase3e5Preflight(repoRoot);
    expect(p.ok).toBe(true);
    expect(loadMovOcrCsv(repoRoot).length).toBe(206);
  });

  it('detects explicit coord pattern in known-good raw line', () => {
    const rows = loadMovOcrCsv(repoRoot);
    const good = rows.find((r) => r.frameFile === '62_0006.jpg');
    expect(good).toBeDefined();
    expect(rawHasExplicitCoord(good!.rawOcr)).toBe(true);
  });

  it('phase 3E.5 result exists after runner', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E5_RESULT.md',
    );
    expect(fs.existsSync(p)).toBe(true);
    const doc = JSON.parse(
      fs.readFileSync(p, 'utf8').match(/```json\n([\s\S]*?)\n```/)![1]!,
    ) as { VERIFIED_FOR_COMPARISON: number };
    expect(doc.VERIFIED_FOR_COMPARISON).toBeGreaterThan(50);
  });
});
