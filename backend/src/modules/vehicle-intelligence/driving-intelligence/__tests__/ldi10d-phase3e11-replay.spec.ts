/**
 * LDI-10D Phase 3E.11 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildOcrSampleSpec,
  buildStopForensics,
  MIN_OCR_SAMPLES,
  temporalAlignmentAnalysis,
  verifyMovSha256,
} from '../../../../../scripts/ops/ldi10d-phase3e11-evidence-hardening.lib';
import { REFERENCE_L3_MAE, verifyInputIntegrity } from '../../../../../scripts/ops/ldi10d-phase3e10-independent-validation.lib';
import { reproduceVideoBaselineMetrics, loadVideoComparison } from '../../../../../scripts/ops/ldi10d-phase3c-gps-speed-research.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.11', () => {
  it('OCR sample size >= 120 stratified', () => {
    expect(buildOcrSampleSpec(repoRoot).length).toBeGreaterThanOrEqual(MIN_OCR_SAMPLES);
  });

  it('five stop forensics cases', () => {
    expect(buildStopForensics(repoRoot).length).toBe(5);
  });

  it('temporal offsets include 0 baseline', () => {
    const t = temporalAlignmentAnalysis(repoRoot);
    expect(t.offsetsTested).toEqual([-2, -1, 0, 1, 2]);
    expect(t.perOffset.find((p) => p.shiftSec === 0)?.validPairs).toBeGreaterThan(600);
  });

  it('L3 baseline unchanged', () => {
    const mae = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot)).maeKmh;
    expect(Math.abs((mae ?? 0) - REFERENCE_L3_MAE)).toBeLessThan(0.0001);
  });

  it('phase 3E.11 deliverables', () => {
    const base = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
    expect(fs.existsSync(path.join(base, 'LDI10D_PHASE3E11_VALIDATION.json'))).toBe(true);
    expect(fs.statSync(path.join(base, 'LDI10D_PHASE3E11_CURSOR_HANDOFF.zip')).size).toBeLessThan(2 * 1024 * 1024);
  });

  it('MOV SHA-256 when present locally', () => {
    if (!fs.existsSync('/tmp/ldi10d-phase3e8-movs/TC_00062.MOV')) return;
    expect(verifyMovSha256(repoRoot, '/tmp/ldi10d-phase3e8-movs').ok).toBe(true);
  });

  it('input integrity pass', () => {
    expect(verifyInputIntegrity(repoRoot).inputIntegrity).toBe('PASS');
  });
});
