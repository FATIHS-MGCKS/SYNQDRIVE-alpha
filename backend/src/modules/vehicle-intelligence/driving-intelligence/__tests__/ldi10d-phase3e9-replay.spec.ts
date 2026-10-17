/**
 * LDI-10D Phase 3E.9 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  auditFreezeCandidates,
  enrichCheckpoint,
  runPhase3e9Analysis,
  SAMPLE_PER_VIDEO,
} from '../../../../../scripts/ops/ldi10d-phase3e9-ocr-quality-audit.lib';
import { verifyPhase3e8Preflight } from '../../../../../scripts/ops/ldi10d-phase3e8-full-video-forensics.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3E.9', () => {
  it('3E.8 checkpoint intact', () => {
    expect(verifyPhase3e8Preflight(repoRoot).checkpointRows).toBe(1028);
  });

  it('freeze audit reproduces 234 point heuristic', () => {
    const rows = enrichCheckpoint(repoRoot);
    expect(auditFreezeCandidates(rows).points3e8).toBe(234);
  });

  it('frame sample spec has 6 videos × per-video quota', () => {
    const a = runPhase3e9Analysis(repoRoot, null);
    expect(a.sampleSpec.length).toBeGreaterThanOrEqual(SAMPLE_PER_VIDEO * 6);
  });

  it('Set A pair audit confirms no DIMO distance filter', () => {
    const a = runPhase3e9Analysis(repoRoot, null);
    expect(a.pairAudit.setAUsesDimoDistanceFilter).toBe(false);
    expect(a.pairAudit.pairedRows).toBe(698);
  });

  it('phase 3E.9 artifacts present', () => {
    const base = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');
    expect(fs.existsSync(path.join(base, 'LDI10D_PHASE3E9_OWNER_REPORT.md'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'LDI10D_PHASE3E9_METRICS_BEFORE_AFTER.json'))).toBe(true);
  });
});
