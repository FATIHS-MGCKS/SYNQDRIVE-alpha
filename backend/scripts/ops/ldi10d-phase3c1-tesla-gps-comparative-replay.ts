#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3C.1 — Tesla GPS comparative replay (audit + gated comparison).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  auditTeslaManifest,
  buildPhase3c1Decision,
  TESLA_MANIFEST_REL,
  verifyPhase3c1Preflight,
} from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { ALGORITHM_IDS } from './ldi10d-phase3c-gps-speed-research.lib';

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const preflight = verifyPhase3c1Preflight(repoRoot);
  if (!preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3C.1', errors: preflight.errors }));
    process.exit(1);
  }

  const audit = auditTeslaManifest(repoRoot, headSha);
  const decision = buildPhase3c1Decision(audit, repoRoot);

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C1_MANIFEST_AUDIT.json'),
    JSON.stringify({ schema: 'LDI10D_PHASE3C1_MANIFEST_AUDIT_V1', headSha, ...audit }, null, 2),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C1_MANIFEST_AUDIT.md'),
    [
      '# LDI-10D Phase 3C.1 — Tesla manifest audit (DIMO 186946)',
      '',
      '## Canonical manifest',
      '',
      `- **Path:** \`${TESLA_MANIFEST_REL}\``,
      `- **Trip ID:** \`${audit.tripId}\``,
      `- **Vehicle:** \`${audit.vehicleId}\``,
      `- **DIMO token:** \`${audit.dimoTokenId}\``,
      `- **Capture production SHA:** \`${audit.productionShaAtCapture}\``,
      `- **Capture analysis SHA:** \`${audit.analysisCodeShaAtCapture}\``,
      `- **Repo HEAD (this run):** \`${audit.repoHeadSha}\``,
      '',
      '## Time window',
      '',
      `- Start: **${audit.timeWindow.startUtc}**`,
      `- Trip end: **${audit.timeWindow.endUtc}**`,
      `- 1 s grid end label: **${audit.timeWindow.gridEndLabelUtc}**`,
      `- Expected buckets: **${audit.timeWindow.expectedBucketCount}**`,
      '',
      '## Checksums',
      '',
      `- Manifest sha256: \`${audit.checksums.manifestSha256}\``,
      `- Per-second replay sha256: \`${audit.checksums.perSecondReplaySha256}\``,
      `- SHA256SUMS verified: **${audit.checksums.sha256sumsFileVerified ? 'YES' : 'NO'}**`,
      '',
      '## Data layers',
      '',
      '### Raw (not fully in git)',
      '',
      ...audit.artifactClassification.raw.map((x) => `- ${x}`),
      '',
      '### Derived (in git)',
      '',
      ...audit.artifactClassification.derived.map((x) => `- \`${x}\``),
      '',
      '### Hash-only references',
      '',
      ...audit.artifactClassification.hashOnlyReferences.map((x) => `- ${x}`),
      '',
      '## GPS coordinates',
      '',
      `- Full lat/lon + UTC in repo: **${audit.gpsCoordinateAccessibility.fullLatLonUtcInRepo ? 'YES' : 'NO'}**`,
      `- Repro without new provider fetch: ${audit.gpsCoordinateAccessibility.reproducibleWithoutNewProviderFetch}`,
      '',
      ...audit.gpsCoordinateAccessibility.notes.map((n) => `- ${n}`),
      '',
      '## Video / tacho overlap',
      '',
      `- Comparison buckets: **${audit.videoTachoOverlap.comparisonBucketCount}**`,
      `- Tacho-readable: **${audit.videoTachoOverlap.tachoReadableBuckets}**`,
      `- Paired TRUSTED L3 + tacho: **${audit.videoTachoOverlap.pairedTrustedL3Tacho}**`,
      `- Window: ${audit.videoTachoOverlap.overlapWindowUtc.first} → ${audit.videoTachoOverlap.overlapWindowUtc.last}`,
      '',
      '## Phase B gate',
      '',
      `- Eligible for 7-algorithm GPS replay: **${audit.phaseBEligible ? 'YES' : 'NO'}**`,
      ...(audit.phaseBBlockers.length
        ? ['', 'Blockers:', ...audit.phaseBBlockers.map((b) => `- ${b}`)]
        : []),
      '',
    ].join('\n'),
  );

  const matrixRows =
    audit.phaseBEligible
      ? ALGORITHM_IDS.map((a) => `| ${a} | pending |`)
      : ALGORITHM_IDS.map(
          (a) =>
            `| ${a} | ${a === 'L3_BASELINE_PRODUCTION' ? `MAE ${decision.baselineMaeKmh?.toFixed(3)} vs tacho (validated witness)` : 'NOT_ASSESSABLE — no DIMO GPS grid in repo'} |`,
        );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C1_COMPARISON_MATRIX.md'),
    [
      '# LDI-10D Phase 3C.1 — Comparison matrix',
      '',
      audit.phaseBEligible
        ? 'Full GPS replay — run after position payload available.'
        : '**Scope:** Baseline L3 vs video tacho only. All other algorithms require committed POSITION payload coordinates on identical seconds (blocked).',
      '',
      '| Algorithm | vs independent tacho (validated) | Diagnostic on trip |',
      '| --- | --- | --- |',
      ...matrixRows,
      '',
      'Non-baseline rows are **diagnostic / not proven accuracy improvements** until GPS replay is unblocked.',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3C1_DECISION.md'),
    [
      '# LDI-10D Phase 3C.1 — Decision template',
      '',
      '```json',
      JSON.stringify(decision, null, 2),
      '```',
      '',
      '## Interpretation',
      '',
      '- **MANIFEST_USABLE:** Identity, window, checksums, and derived per-second replay align with EXP021 Tesla reference.',
      '- **GPS_COORDINATES_AVAILABLE:** NO in git — seven-algorithm comparative replay on identical DIMO GPS inputs is **not** executed.',
      '- **INDEPENDENT_GROUND_TRUTH_AVAILABLE:** Video tacho witness on synchronized bucket labels (quantized 1 s clock).',
      '- **ACCURACY_IMPROVEMENT_PROVEN:** NOT_ASSESSABLE — no candidate beat baseline under independent GPS replay.',
      '',
      '**STOP:** Phase 3C.1 complete — await owner review. No deploy, merge, or Phase 3D.',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase3c1-tesla-gps-comparative-replay',
      'cd backend && npx jest ldi10d-phase3c1 --runInBand',
      '```',
    ].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, phase: '3C.1', ...decision }));
}

main();
