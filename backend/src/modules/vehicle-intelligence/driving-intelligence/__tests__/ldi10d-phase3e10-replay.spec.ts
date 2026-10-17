/**
 * LDI-10D Phase 3E.10 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  classifyStopCases3e10,
  reviewFreezeSegments,
  verifyInputIntegrity,
  wilsonCi,
} from '../../../../../scripts/ops/ldi10d-phase3e10-independent-validation.lib';
import { auditPairIndependence, enrichCheckpoint } from '../../../../../scripts/ops/ldi10d-phase3e9-ocr-quality-audit.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.10', () => {
  it('input integrity reference counts', () => {
    const i = verifyInputIntegrity(repoRoot);
    expect(i.checks.find((c) => c.metric === 'ocr_timepoints')?.match).toBe(true);
    expect(i.checks.find((c) => c.metric === 'gps_fully_readable')?.observed).toBe(676);
    expect(i.checks.find((c) => c.metric === 'l3_baseline_mae_kmh')?.match).toBe(true);
  });

  it('reviews 62 stops and 246 freeze segments', () => {
    expect(classifyStopCases3e10(repoRoot).length).toBe(62);
    expect(reviewFreezeSegments(repoRoot).length).toBe(246);
  });

  it('Set A pairs remain unfiltered by DIMO distance', () => {
    expect(auditPairIndependence(enrichCheckpoint(repoRoot)).setAUsesDimoDistanceFilter).toBe(false);
    expect(auditPairIndependence(enrichCheckpoint(repoRoot)).pairedRows).toBe(698);
  });

  it('Wilson CI helper stable', () => {
    const ci = wilsonCi(8, 10);
    expect(ci).not.toBeNull();
    expect(ci!.low).toBeLessThan(0.9);
    expect(ci!.high).toBeGreaterThan(0.5);
  });

  it('phase 3E.10 artifacts and handoff zip', () => {
    const base = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
    expect(fs.existsSync(path.join(base, 'LDI10D_PHASE3E10_VALIDATION.json'))).toBe(true);
    const zip = path.join(base, 'LDI10D_PHASE3E10_CURSOR_HANDOFF.zip');
    expect(fs.statSync(zip).size).toBeLessThan(2 * 1024 * 1024);
  });
});
