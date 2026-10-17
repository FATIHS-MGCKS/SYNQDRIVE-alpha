/**
 * LDI-10D Phase 3B replay.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildPhase3aTimeline } from '../../../../../scripts/ops/ldi10d-phase3a-temporal-events.lib';
import {
  PHASE3A_EXPECTED,
  runPhase3bForensics,
  verifyPhase3bPreflight,
} from '../../../../../scripts/ops/ldi10d-phase3b-trip-continuity.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

describe('LDI-10D Phase 3B', () => {
  it('passes full preflight including Phase 3A baseline', () => {
    const p = verifyPhase3bPreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.phase3aDrift).toBe('NONE');
  });

  it('has zero OBSERVED_STANDSTILL at production 3 km/h rule', () => {
    const f = runPhase3bForensics(repoRoot);
    expect(f.counts.observedStandstills).toBe(0);
    expect(f.counts.stopGoConfirmed).toBe(0);
  });

  it('Phase 3A replay unchanged', () => {
    const t = buildPhase3aTimeline(repoRoot);
    expect(t.events.length).toBe(PHASE3A_EXPECTED.eventsTotal);
  });

  it('trip timeline artifact has 362 buckets', () => {
    const p = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3B_TRIP_TIMELINE.json',
    );
    expect(fs.existsSync(p)).toBe(true);
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { tripBucketsAnalyzed: number };
    expect(j.tripBucketsAnalyzed).toBe(362);
  });

  it('produces at least five case studies', () => {
    const f = runPhase3bForensics(repoRoot);
    expect(f.caseStudies.length).toBeGreaterThanOrEqual(5);
  });
});
