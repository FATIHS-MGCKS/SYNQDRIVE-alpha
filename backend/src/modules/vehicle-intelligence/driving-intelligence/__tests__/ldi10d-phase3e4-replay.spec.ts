/**
 * LDI-10D Phase 3E.4 replay guards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseOverlayOcrText, verifyPhase3e4Preflight } from '../../../../../scripts/ops/ldi10d-phase3e4-iphone-gps-forensics.lib';
import { VIDEO_BASELINE_EXPECTED } from '../../../../../scripts/ops/ldi10d-phase3c-gps-speed-research.lib';
import { runPhase3dAnalysis } from '../../../../../scripts/ops/ldi10d-phase3d-gps-evidence-quality.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

const evDir = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10d');

describe('LDI-10D Phase 3E.4', () => {
  it('passes preflight on review pack + frozen fixture', () => {
    const p = verifyPhase3e4Preflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.frameCount).toBe(18);
    expect(p.movFilesPresent).toBe(false);
  });

  it('parses audit example overlay text shape', () => {
    const sample =
      '16.10.2026 05:38:11 51335267 , +9.506096 191.8 m u. M Geschwindigkeit: 5.7 km/h';
    const p = parseOverlayOcrText(sample);
    expect(p.lat).toBeCloseTo(51.335267, 4);
    expect(p.lon).toBeCloseTo(9.506096, 4);
    expect(p.iphoneSpeedKmh).toBeCloseTo(5.7, 1);
    expect(p.overlayLocal).toContain('+02:00');
  });

  it('L3 baseline unchanged', () => {
    expect(runPhase3dAnalysis(repoRoot).l3BaselineDrift).toBe('NONE');
  });

  it('committed phase 3E.4 spatial summary matches pinned runner output', () => {
    const spatial = JSON.parse(
      fs.readFileSync(path.join(evDir, 'LDI10D_PHASE3E4_SPATIAL_COMPARISON.json'), 'utf8'),
    ) as { haversineM: { median: number | null; p95: number | null }; pairedFixes: unknown[] };
    expect(spatial.pairedFixes.length).toBeGreaterThan(0);
    expect(spatial.haversineM.median).not.toBeNull();
    const result = JSON.parse(
      fs.readFileSync(path.join(evDir, 'LDI10D_PHASE3E4_RESULT.md'), 'utf8').match(/```json\n([\s\S]*?)\n```/)![1]!,
    ) as { L3_BASELINE_MAE_KMH: number };
    expect(result.L3_BASELINE_MAE_KMH).toBeCloseTo(VIDEO_BASELINE_EXPECTED.maeKmh, 5);
  });
});
